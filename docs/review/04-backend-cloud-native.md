# 后端架构、SSE、Kubernetes GPU 与 Operator 复习

![图 1 - Cloud Native Agent Backend：API、事件流、存储、GPU 调度与 Operator](../../assets/article-cloud-native.png)

> 阅读目标：把后端能力讲成 AI Agent 的生产底座。模型能力只是一个组件，真正支撑上线的是长任务 API、事件流、幂等、状态恢复、资源调度、观测和故障处理。

## 0. 本文地图

| 模块 | 要讲清楚 | 典型追问 |
|---|---|---|
| SSE | 为什么不是 WebSocket，如何断线恢复 | buffering、Last-Event-ID、心跳 |
| 领域模型 | session/run/message/event/checkpoint 区别 | 为什么不能一张 conversation 表 |
| GPU 调度 | Device Plugin、limits、node label、队列 | K8s 只调度资源，平台要补什么 |
| Operator | CRD + reconcile | 为什么不是普通 CRUD |
| 中间件 | Redis、PostgreSQL、MQ、S3 | 哪些状态放哪里 |

## 1. FastAPI / SSE / Streaming

### SSE 是什么

Server-Sent Events 是浏览器通过 HTTP 长连接接收服务端事件的机制。客户端使用 `EventSource`，服务端返回 `text/event-stream`，每个事件用空行分隔。

### SSE vs WebSocket

| 维度 | SSE | WebSocket |
|---|---|---|
| 通信方向 | 服务端 -> 客户端 | 双向 |
| 协议 | HTTP | 独立升级协议 |
| 浏览器支持 | EventSource 原生 | WebSocket 原生 |
| 重连 | 原生支持 | 需自己实现 |
| 适合场景 | LLM token/event stream、进度通知 | 协同编辑、游戏、双向控制 |
| 运维复杂度 | 较低 | 较高 |

你的项目是服务端把 Agent run event 推给前端，SSE 很合适。

### 面试官为什么问这个

AI Agent 服务经常是长任务：检索、规划、工具调用、视频/图片生成、DAG 执行都可能耗时。面试官问 SSE，不是在问 API 名词，而是在确认你是否能处理：

- 用户看到实时进度，而不是等一个超长 HTTP 响应。
- 浏览器刷新/断线后能恢复已发生事件。
- 反向代理不会缓冲导致“假流式”。
- 后台 run 不能因为前端连接断开就丢状态。

## 2. SSE 工程细节

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant API as FastAPI
  participant Graph as LangGraph Run
  participant Store as Event Store

  FE->>API: GET /v1/responses/{run_id}/events
  API->>Graph: subscribe(run_id)
  Graph-->>API: stage.started
  API-->>FE: event: stage.started
  API->>Store: append event
  Graph-->>API: planner.delta
  API-->>FE: event: planner.delta
  Graph-->>API: dag.updated
  API-->>FE: event: dag.updated
  FE--xAPI: network disconnect
  FE->>API: reconnect with Last-Event-ID
  API->>Store: replay missed events
  API-->>FE: missed events + live stream
```

### 你要能讲出的细节

- 响应头：`Content-Type: text/event-stream`、`Cache-Control: no-cache`。
- Nginx：关闭 buffering，例如 `X-Accel-Buffering: no`。
- 心跳：定期发送 comment/ping 防止连接空闲断开。
- 事件 id：支持 Last-Event-ID 恢复。
- 背压：慢客户端不能拖垮 run。
- 清理：客户端取消后释放订阅和后台任务。
- 幂等：断线重连不应重复执行模型/工具，只重放事件。

### 源码形态：事件流不是直接绑模型生成器

```python
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

router = APIRouter()


@router.get("/v1/runs/{run_id}/events")
async def stream_events(run_id: str, request: Request):
    last_id = request.headers.get("last-event-id")

    async def event_generator():
        async for event in event_store.replay_then_subscribe(run_id, after_id=last_id):
            if await request.is_disconnected():
                break
            yield format_sse(
                event=event.type,
                data=event.payload,
                event_id=event.id,
            )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
```

关键点：

- `replay_then_subscribe` 先补历史事件，再订阅实时事件。
- SSE 连接只负责展示事实流，不应该直接驱动模型执行。
- 后台 run 的生命周期由 run service 管理，前端断线只影响订阅。
- event store 是恢复体验的事实来源。

## 3. 后端领域模型

Agent 平台不要只建一张 conversation 表。建议模型：

- `session`：用户长期会话或项目。
- `run`：一次 Agent 执行。
- `message`：用户/助手消息。
- `event`：SSE 事件和状态变更。
- `checkpoint`：graph 可恢复状态。
- `artifact`：图片/视频/音频/DAG 等产物引用。
- `trace`：模型、工具、检索、执行 spans。

面试金句：

> message 是对用户可见的对话，event 是前端恢复和实时展示的事实流，checkpoint 是运行时恢复状态，trace 是工程排障和评测依据。它们不能混成一张表。

### 表结构草图

```sql
create table runs (
  id text primary key,
  session_id text not null,
  status text not null,
  current_stage text,
  created_at timestamptz not null,
  completed_at timestamptz
);

create table run_events (
  id bigserial primary key,
  run_id text not null references runs(id),
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null
);

create index run_events_run_id_id_idx on run_events(run_id, id);
```

这能说明你知道事件重放需要按 `run_id + event_id` 顺序读，而不是只在内存里推给当前连接。

## 4. Kubernetes GPU 调度

### Device Plugin 机制

Kubernetes 通过 Device Plugin Framework 支持 GPU、FPGA、NIC 等特殊硬件。GPU 节点安装驱动和 vendor device plugin 后，kubelet 会暴露扩展资源，例如：

```yaml
resources:
  limits:
    nvidia.com/gpu: 1
```

关键点：

- GPU 通常在 `limits` 中声明。
- GPU request 和 limit 必须一致，或只写 limit 由 K8s 推导 request。
- 不同 GPU 型号用 node label / node selector / affinity 区分。
- 平台层要做配额、队列、优先级和多租户隔离。

### 典型 Job 片段

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: train-video-model
spec:
  template:
    spec:
      restartPolicy: Never
      nodeSelector:
        accelerator: nvidia-t4
      containers:
        - name: trainer
          image: registry.example.com/trainer:2026-05
          resources:
            limits:
              nvidia.com/gpu: 1
              cpu: "8"
              memory: 32Gi
          env:
            - name: RUN_ID
              value: run_123
```

面试时要补一句：Kubernetes 能调度扩展资源，但它不知道业务优先级、团队配额、训练任务重试策略和成本预算，这些要由平台控制面补齐。

## 5. GPU 平台架构

```mermaid
flowchart TD
  U[User / Algorithm Team] --> API[Platform API\nGin/FastAPI]
  API --> Auth[Project / Quota / Permission]
  Auth --> Queue[Task Queue\npriority/fairness]
  Queue --> Builder[Job Builder\nimage/env/volume/gpu]
  Builder --> K8S[Kubernetes API]
  K8S --> Pod[Pod/Job]
  Pod --> GPU[GPU Node\nV100/T4]
  K8S --> Watcher[Status Watcher]
  Watcher --> DB[(MySQL/Redis)]
  Pod --> Logs[Logs / Metrics]
  Logs --> Obs[Prometheus/Grafana]
  Watcher --> UI[Task UI\nstatus/log/retry]
```

### 平台要解决的问题

- 用户不写 YAML，也能提交训练/推理/数据任务。
- 资源配额：项目/用户/GPU 型号。
- 队列公平性：避免某个团队占满 GPU。
- 状态同步：Pending/Running/Succeeded/Failed/Retrying。
- 日志与结果：日志查看、对象存储输出。
- 故障恢复：失败重试、节点异常、镜像拉取失败、资源不足。

## 6. CRD / Operator

### CRD 适用条件

适合：

- 业务对象生命周期长。
- 需要声明式 API。
- 状态需要不断调和。
- 希望用户像使用 K8s 原生资源一样使用业务对象。

不适合：

- 简单 CRUD。
- 状态不在 K8s 内。
- 不需要控制循环。

### Operator 控制循环

```mermaid
flowchart LR
  Desired[Desired State\nTrainingJob Spec] --> Reconcile[Controller Reconcile]
  Actual[Actual State\nPods/Jobs/PVC] --> Reconcile
  Reconcile --> Action[Create/Update/Delete]
  Action --> Actual
  Reconcile --> Status[Update CR Status]
```

面试回答：

> CRD 存期望状态，Operator 负责把真实状态调和过去。它不是简单把 API 换成 YAML，而是把领域运维知识编码进控制循环。

### Reconcile 伪代码

```go
func (r *TrainingJobReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    job := &aiv1.TrainingJob{}
    if err := r.Get(ctx, req.NamespacedName, job); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    desired := buildBatchJob(job.Spec)
    current := &batchv1.Job{}
    err := r.Get(ctx, types.NamespacedName{Name: desired.Name, Namespace: desired.Namespace}, current)
    if apierrors.IsNotFound(err) {
        return ctrl.Result{}, r.Create(ctx, desired)
    }
    if err != nil {
        return ctrl.Result{}, err
    }

    job.Status.Phase = summarize(current.Status)
    return ctrl.Result{RequeueAfter: time.Minute}, r.Status().Update(ctx, job)
}
```

这段回答能体现 Operator 的本质：不是接一次请求做一次动作，而是持续比较期望状态和真实状态。

## 7. Golang / Python 后端取舍

### Python 适合

- LLM SDK、RAG、数据处理、快速迭代。
- FastAPI 做 AI API 服务。
- 与模型生态集成。

### Golang 适合

- 高并发 API。
- K8s controller/operator。
- 稳定后台服务。
- 低资源占用和部署简单。

你可以说：AI Agent 服务我倾向 Python/FastAPI，因为模型和 RAG 生态更快；平台控制面、K8s operator 和高并发稳定链路可以用 Golang。

## 8. 中间件复习速记

### Redis

- session/cache/rate limit/distributed lock/stream。
- Agent 场景：短期状态缓存、SSE pubsub、任务状态缓存、幂等 key。

### PostgreSQL/MySQL

- 强一致业务数据、session/run/message/event、权限、配置。
- PostgreSQL JSONB 适合半结构化 Agent state，但核心索引字段要列化。

### MongoDB

- 文档型配置、灵活 schema 的产物元数据。
- 不要把强事务核心状态全部塞 Mongo。

### RabbitMQ/Kafka

- RabbitMQ：任务队列、延迟重试、可靠投递。
- Kafka：高吞吐事件流、日志、行为数据、异步消费。

### S3/CDN

- 多模态产物、图片、视频、音频、大型 DAG artifact。
- DB 保存 URI、hash、metadata，不保存大对象。

## 9. 必背问题

### 长任务 API 如何设计？

- POST 创建 run，返回 run_id。
- SSE 订阅事件。
- GET 查询状态和结果。
- POST cancel。
- retry 使用新 run 或明确 retry_of。
- 所有写操作有 idempotency key。

### 一个完整长任务协议

```text
POST /v1/runs
  -> 202 Accepted { run_id, status: queued }

GET /v1/runs/{run_id}
  -> { status, current_stage, result_ref, error }

GET /v1/runs/{run_id}/events
  -> text/event-stream

POST /v1/runs/{run_id}/cancel
  -> { status: cancelling }

POST /v1/runs/{run_id}/retry
  -> { run_id: new_run_id, retry_of: old_run_id }
```

这个协议能把同步请求、实时事件、状态查询、取消、重试分开，方便前端恢复，也方便后端幂等。

### 如何做限流？

- 用户级、项目级、模型级、工具级。
- 区分请求数、并发 run 数、token/min、cost/day。
- 重要任务可排队，低优先级拒绝或降级。

### 如何排查线上 SSE 没有实时返回？

- 检查服务端是否 flush。
- 检查 Nginx/网关 buffering。
- 检查 Content-Type。
- 检查心跳和 idle timeout。
- 检查客户端 EventSource 是否重连。
- 检查后台 run 是否真的产生事件。

## 10. 官方与高质量资料

- MDN Using SSE：<https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events>
- FastAPI StreamingResponse：<https://fastapi.tiangolo.com/advanced/custom-response/>
- Starlette Responses：<https://www.starlette.io/responses/>
- Kubernetes Device Plugins：<https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/device-plugins/>
- Kubernetes Schedule GPUs：<https://kubernetes.io/docs/tasks/manage-gpus/scheduling-gpus/>
- Kubernetes Custom Resources：<https://kubernetes.io/docs/concepts/api-extension/custom-resources/>
- Kubernetes Operator Pattern：<https://kubernetes.io/docs/concepts/extend-kubernetes/operator>
- GitHub Pages Actions：<https://github.com/actions/deploy-pages>
