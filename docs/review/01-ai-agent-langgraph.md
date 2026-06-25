# LangGraph 架构设计与 dag_engine Agent Runtime 落地

![图 1 - dag-engine 双运行时：Agent Runtime 负责长流程会话，DAG Engine 负责确定性执行](../../assets/dag-engine-runtime.png)

> 本文以 LangGraph 官方 v1.x 文档和官方仓库为主线，结合 `/Users/mac/Code/Arch/dag_engine/agent` 的真实代码做架构复盘。重点不是泛泛介绍“Agent 是什么”，而是回答一个工程问题：为什么生产级 Agent Runtime 需要 LangGraph 这种低层、有状态、可持久化、可中断恢复的运行时，以及这套能力在 `dag_engine/agent` 里如何落地。

## 0. 先给结论

LangGraph 不是一个“会帮你写 prompt 的高级 Agent SDK”，而是一个低层 agent orchestration runtime。它把长流程 Agent 拆成显式的 `State`、`Node`、`Edge`，底层用 Pregel/BSP 风格的 super-step 执行模型来处理循环、并发、状态合并、checkpoint、interrupt/resume 和 streaming。

`dag_engine` 的架构边界也应该这样理解：

| 层 | 主要代码 | 职责 | 不负责 |
|---|---|---|---|
| Agent Runtime | `agent/runtime.py`、`agent/graph_state.py`、`agent/orchestrator.py` | 多轮对话、阶段流转、用户确认、checkpoint、resume、SSE、Planner 调用、DAG draft 生成 | 不直接执行媒体生成节点 |
| Projection / API | `agent/repository.py`、`agent/service.py`、`agent/blueprint.py` | session/run/message/event/history 查询视图、HTTP/SSE API、Postgres 投影表 | 不替代 LangGraph checkpoint |
| DAG Assembly | `agent/llm_planner.py`、`agent/draft_generation_skill.py`、`agent/draft_rule_catalog.py` | LLM 输出结构化计划，代码按 Registry 规则确定性装配 DAG | 不让模型自由编造完整 DAG |
| DAG Engine | `engine/` 目录 | 拓扑调度、handler 执行、SubDAG、模型队列、MQ/Redis、trace、cancel | 不处理多轮对话和用户确认 |

一句话概括：

> `agent/` 是基于 LangGraph 的长流程 Agent Runtime；`engine/` 是自研 DAG 执行器。上层处理不确定性，底层处理确定性，中间用 `workflow_plan` 和 `dag_current` 作为契约。

## 1. LangGraph 的架构定位

官方对 LangGraph 的定位非常明确：它是用于构建、管理和部署 long-running stateful agents 的低层编排框架。它不强迫你使用 LangChain，也不替你决定 ReAct、Plan-and-Execute、Supervisor 还是 Workflow；它提供的是生产 Agent 最底层的运行时能力。

官方文档和官方博客反复强调几个关键点：

| 能力 | 为什么 Agent 需要 |
|---|---|
| Durable execution | LLM 调用慢、长流程容易失败，失败后不能从头重跑 |
| Human-in-the-loop | 用户确认、审批、修改状态、暂停后恢复是 Agent 产品的常态 |
| Streaming | Agent 运行时间以秒、分钟计，需要持续反馈进度 |
| Parallelization | 可并行节点要并行，但不能引入数据竞争 |
| Checkpointing | 中间状态要能跨进程、跨机器、跨时间恢复 |
| Tracing / Debugging | Agent 行为非确定，需要看状态、路径、输入输出和中间决策 |

这也是为什么 LangGraph 不是传统 DAG engine。传统 DAG 通常依赖拓扑排序，假设图无环；但 Agent 经常需要循环，例如：

```text
LLM decides -> tool call -> observe result -> LLM decides again
review needed -> interrupt -> user resumes -> continue
validator fails -> repair -> validate again
```

LangGraph 官方博客解释过这个设计取舍：Agent 需要循环和确定性并发，所以底层选择了 BSP/Pregel 风格的执行模型，而不是普通 DAG 拓扑调度。

## 2. LangGraph 的核心执行模型

### 2.1 State、Node、Edge 是公开 API，Channel 和 Pregel 是运行时内核

你在应用层最常接触的是三件事：

| 概念 | 含义 | `dag_engine/agent` 对应 |
|---|---|---|
| `State` | 当前图的共享业务状态快照 | `AgentGraphState` |
| `Node` | 读取 state、执行逻辑、返回 state update 的函数 | `_node_handle_storyboard` 等 |
| `Edge` | 决定下一个 node 的固定边或条件边 | `_route_after_ingest` |

官方 Graph API 的关键设计是：node 只是普通同步/异步 Python 函数；edge 只是告诉运行时下一步去哪里。真正复杂的地方在运行时：LangGraph 会把 state key 映射为 channel，用 reducer 合并多个 node 的写入，在 super-step 边界保存 checkpoint。

简单说：

```text
开发者写：StateGraph(State) + add_node + add_edge
LangGraph 编译成：Pregel application
运行时负责：调度 active nodes、隔离并发状态、合并 updates、持久化 checkpoints
```

### 2.2 Super-step：LangGraph 为什么能安全并发

LangGraph 的执行按 super-step 推进。一个 super-step 可以理解为图运行时的一次“批处理 tick”：

1. 运行时根据 channel 版本和 edge 触发关系选出本轮 active nodes。
2. 可并行的 nodes 用各自隔离的 state copy 执行。
3. node 返回局部 update。
4. 运行时按确定性顺序把 update 应用到 channel。
5. 如果配置了 checkpointer，在 super-step 边界保存 state snapshot。
6. 如果还有 active node，进入下一个 super-step；否则结束或等待 interrupt resume。

这点对面试很重要。很多人只会说“LangGraph 是图”，但核心不是图形状，而是这个运行时语义：

> 并发节点不共享可变 state；它们只返回 update，运行时再用 reducer 做确定性合并。

这解释了两个落地问题：

1. 如果多个 node 会写同一个 list，需要显式 reducer，例如 `operator.add` 或 `add_messages`，否则后写覆盖前写。
2. 如果 node 有外部副作用，必须考虑重试和恢复时是否会重复执行。

### 2.3 Checkpoint、Thread、History、Replay

LangGraph 的 persistence 层按 thread 组织 checkpoint。`thread_id` 是恢复一条长流程的持久游标：

```python
{"configurable": {"thread_id": session_id}}
```

官方文档里有三个细节必须讲清楚：

| 机制 | 工程含义 |
|---|---|
| checkpoint | 某个 super-step 边界的 state snapshot |
| checkpoint writes | 同一 super-step 内部分 node 已完成写入，失败恢复时可避免重复跑成功节点 |
| state history | 可用于回放、调试、time travel、投影历史 |

`dag_engine/agent/runtime.py` 的 `_thread_config()` 就是把业务 session 绑定到 LangGraph thread：

```python
def _thread_config(self, session_id: str) -> dict[str, Any]:
    return {"configurable": {"thread_id": session_id}}
```

这个映射是对的：一次创作会话就是一条 LangGraph thread。用户刷新页面、断线重连、隔天回来继续，都应该复用同一个 `session_id`。

### 2.4 Interrupt / Resume：不是前端暂停，而是运行时暂停

![图 2 - LangGraph 动态中断与恢复生命周期](../../assets/langgraph-hitl-flow.png)

LangGraph 的 `interrupt()` 是 human-in-the-loop 的关键原语。它不是简单返回一个“需要用户输入”的标志，而是在 node 内部暂停图执行、保存状态，并等待下一次用 `Command(resume=...)` 恢复。

官方语义可以拆成五步：

1. node 调用 `interrupt(payload)`。
2. LangGraph 保存当前 graph state。
3. interrupt payload 返回给调用方。
4. thread 保持在等待状态，可以等待很久。
5. 下一次 invoke 使用同一个 `thread_id` 和 `Command(resume=value)`，`interrupt()` 调用点拿到 `value` 后继续执行。

`dag_engine/agent` 正是这个模式：

```python
def _node_await_user_turn(self, state: dict[str, Any]):
    pending = state.get("pending_interrupt")
    if not pending:
        return {}
    resumed = interrupt(pending)
    return {
        "current_user_text": str(resumed or "").strip(),
        "pending_interrupt": None,
        "last_turn_meta": {},
        "last_assistant_message": None,
    }
```

每个业务阶段结束后，`_finalize_turn()` 都设置：

```python
"pending_interrupt": {"kind": "user_turn", "stage": session.stage}
```

下一轮用户输入进入 `handle_turn()` 时，如果 repository 里的 state 有 `pending_interrupt`，runtime 就走：

```python
Command(resume=user_text, update=update_payload)
```

这里的架构价值是：等待用户不是前端自己记状态，也不是后端 if/else 从头判断，而是 LangGraph checkpoint 体系里的一个可恢复中断点。

### 2.5 Streaming：不是只能流 token，也可以流业务事件

LangGraph streaming 支持多种模式，包括 `values`、`updates`、`messages`、`custom`、`checkpoints`、`tasks`、`debug`。对 `dag_engine/agent` 这种创作 Agent 来说，最有用的是 `custom`，因为前端关心的是结构化进度：

```text
stage.started
planner.thought_summary
planner.delta
stage.completed
message.created
stage.changed
dag_draft.replaced
message.completed
```

代码里 `stream_turn()` 使用：

```python
self.graph.stream(command_or_input, config, stream_mode="custom")
```

node 内部统一调用：

```python
writer = get_stream_writer()
writer({"event": event, "payload": payload})
```

这比“只流 LLM token”更贴合产品。用户不需要看到完整 JSON 一个字一个字冒出来，而是要知道系统正在做什么：确认阶段、生成核心元素、重写某个分镜、装配 DAG、替换画布草稿。

## 3. dag_engine/agent 的 LangGraph 落地

### 3.1 StateGraph 拓扑：产品状态机 + LangGraph Runtime

`AgentGraphRuntime._build_graph()` 是整个 agent runtime 的入口：

```python
builder = StateGraph(AgentGraphState)
builder.add_node("ingest_turn", self._node_ingest_turn)
builder.add_node("workflow_understanding", self._node_workflow_understanding)
builder.add_node("intent", self._node_handle_intent)
builder.add_node("format_confirm", self._node_handle_format_confirm)
builder.add_node("synopsis_choice", self._node_handle_synopsis_choice)
builder.add_node("core_elements", self._node_handle_core_elements)
builder.add_node("storyboard", self._node_handle_storyboard)
builder.add_node("music", self._node_handle_music)
builder.add_node("transition_sfx", self._node_handle_transition_sfx)
builder.add_node("dag_draft", self._node_handle_dag_draft)
builder.add_node("project_turn", self._node_project_turn)
builder.add_node("await_user_turn", self._node_await_user_turn)
```

图结构是：

```text
START
  -> ingest_turn
  -> route by state.stage
  -> business stage node
  -> project_turn
  -> await_user_turn
  -> ingest_turn
```

这不是 ReAct loop，而是一个产品阶段状态机：

| Stage | 作用 |
|---|---|
| `intent` | 判断是否进入创作流程，种下基础 `script_spec` |
| `format_confirm` | 确认画幅、时长、镜头数量 |
| `synopsis_choice` | 给三套故事方向，让用户选 |
| `core_elements` | 生成主体、主题、风格、视觉钩子 |
| `storyboard` | 生成/修改分镜 |
| `music` | 音乐建议 |
| `transition_sfx` | 转场音效建议，并准备进入 DAG draft |
| `dag_draft` | 生成最终草稿 |
| `workflow_understanding` | 分析已有 DAG，给可编辑槽位 |

这种设计的核心优点是：产品流程稳定，LLM 只在需要语义判断和生成的节点里发挥作用。

### 3.2 AgentGraphState：保存业务事实，不保存 prompt

`agent/graph_state.py` 里的 `AgentGraphState` 是这个 runtime 的核心契约：

```python
class AgentGraphState(TypedDict, total=False):
    session_id: str
    user_id: str
    project_id: str
    workflow_id: str
    mode: str
    stage: str
    current_dag: dict[str, Any] | None
    script_spec: dict[str, Any]
    workflow_plan: dict[str, Any]
    dag_current: dict[str, Any] | None
    workflow_analysis: dict[str, Any] | None
    messages: list[dict[str, Any]]
    logs: list[dict[str, Any]]
    pending_interrupt: dict[str, Any] | None
    current_user_text: str
    current_run_id: str | None
    request_locale: str | None
    last_assistant_message: dict[str, Any] | None
    last_error: dict[str, Any] | None
    last_turn_meta: dict[str, Any]
```

这符合 LangGraph 的推荐心智：state 里放 raw data，prompt 在 node 内按需格式化。比如 `llm_planner.py` 每次调用 Gemini 时才把 `script_spec`、`planning_context` 拼进 prompt。

这个选择有三个好处：

1. checkpoint 保存的是业务事实，不是一大段当时的 prompt。
2. prompt 模板升级不会破坏历史 session 的恢复。
3. 调试 state history 时能直接看到 stage、workflow_plan、dag_current、pending_interrupt。

但也有一个风险：`messages`、`logs`、`dag_current` 都会进入 checkpoint 和 `state_json`。长会话下 state 会膨胀，影响 Postgres checkpoint 写入和恢复延迟。生产上建议：

| 字段 | 推荐策略 |
|---|---|
| `messages` | state 只保留最近 N 条和 summary，完整内容放 `message_projection` |
| `logs` | state 只保留本轮必要日志，完整事件放 `event_projection` |
| `dag_current` | 大对象可 ref 化，只存 `draft_id` / `version` / `storage_key` |
| `script_spec.shots` | 分镜长文本可存 refs 或摘要 |

### 3.3 handle_turn：同步响应的恢复链路

一次普通请求进入 `AgentGraphRuntime.handle_turn()` 后，代码做了几件关键事：

1. 从 repository 读取 session state。
2. 创建 run projection，记录 `run_id`、输入、stage、stream 标志。
3. 用 `session_id` 构造 LangGraph `thread_id`。
4. 如果存在 `pending_interrupt`，用 `Command(resume=user_text, update=...)` 恢复。
5. 如果不是恢复，把当前 state 作为 graph input，并注入 `current_user_text`、`current_run_id`。
6. 调用 `self.graph.invoke(...)`。
7. 从 LangGraph 最新 state 刷新 repository。
8. 完成 run，状态为 `interrupted` 或 `completed`。
9. 保存 history 投影。

这条链路的工程意义是：

```text
HTTP request
  -> run_projection
  -> LangGraph invoke/resume
  -> checkpointer
  -> session/message/event projection
  -> response
```

注意这里有两套持久化：

| 持久化 | 代码 | 用途 |
|---|---|---|
| LangGraph checkpointer | `InMemorySaver` / `PostgresSaver` | 恢复执行、interrupt、history、time travel |
| 业务 projection | `PostgresAgentRepository` | session 列表、消息分页、run 详情、事件查询 |

这不是重复造轮子，而是 CQRS 风格的拆分：checkpoint 是运行时事实，projection 是产品查询视图。

### 3.4 stream_turn：SSE 不是旁路，而是 graph 内部事件

`stream_turn()` 和 `handle_turn()` 的前半段一致，只是调用：

```python
for item in self.graph.stream(command_or_input, config, stream_mode="custom"):
    if isinstance(item, dict) and str(item.get("event", "")).strip():
        yield item
```

graph node 内部通过 `_stream_event()` 发事件。这样 SSE 不是“外层猜测进度”，而是每个 node 在关键业务点主动汇报。

落地时建议继续补三类字段：

| 字段 | 目的 |
|---|---|
| `run_id` | 前端去重、断线重连、按 run 聚合事件 |
| `seq` | 同一 run 内事件有序，SSE 重放方便 |
| `state_version` / `checkpoint_id` | 前端知道本地画布是否落后 |

### 3.5 project_turn：把 LangGraph state 投影成产品视图

`_node_project_turn()` 很关键：

```python
self.repository.save_state(state)
meta = dict(state.get("last_turn_meta", {}) or {})
message = dict(state.get("last_assistant_message", {}) or {})
if message:
    self._stream_event("message.created", {"message": message})
if meta.get("stage_changed"):
    self._stream_event("stage.changed", {"stage": str(state.get("stage", "intent") or "intent")})
if meta.get("dag_replaced"):
    self._stream_event("dag_draft.replaced", {"dag_draft": state.get("dag_current")})
```

它把图运行时的最新 state 同步到：

| Projection 表 | 作用 |
|---|---|
| `session_projection` | session 列表、当前 stage、pending interrupt、state_json |
| `run_projection` | 每轮输入输出、状态、错误、interrupt payload |
| `message_projection` | 消息分页和渲染 |
| `event_projection` | 日志、调试、回放 |
| `checkpoint_projection` | LangGraph history 的业务查询副本 |

生产上要明确一致性边界：恢复执行应以 LangGraph checkpointer 为准；页面查询以 projection 为准；projection 落后时可以通过 `get_state_history()` 或最新 checkpoint 重建。

## 4. Planner + Deterministic Assembly：这套代码最重要的设计

### 4.1 为什么不能让 LLM 直接输出完整 DAG

多模态 DAG 草稿不是普通 JSON。它包含：

| 结构 | 风险 |
|---|---|
| `nodes` | 模型可能编造不存在的 workflow id |
| `edges` | source/target、handle、类型可能不匹配 |
| `flow_info` | 画布节点 metadata、位置、状态、输出 schema 容易缺字段 |
| `globals` / `globals_schema` | 参数名、类型、默认值可能不一致 |
| `outputs` / `output_aliases` | 下游引用可能断裂 |

所以正确做法不是“prompt 写严一点”，而是设计中间表示：

```text
用户自然语言
  -> LLM Planner 输出 script_spec / workflow_plan / shots / music
  -> Orchestrator normalize / repair / resolve workflow ids
  -> DraftGenerator 确定性装配完整 DAG
  -> DAG validator 做最终门禁
```

当前代码已经实现了前三步。

### 4.2 LLM Planner 只做语义计划

`GeminiWorkflowPlanner` 的职责是输出结构化 JSON：

| 方法 | 输出 |
|---|---|
| `plan_intent()` | `script_spec`、三组 `synopsis_choices` |
| `plan_core_elements()` | 选中的 synopsis、核心视觉元素 |
| `plan_workflow()` | 真实/候选 workflow、shots、music、reason |
| `classify_stage_intent()` | `continue`、`retry`、`revise_core_field`、`revise_shot`、`clarify` |
| `resolve_format_confirmation()` | 画幅和时长 |

它用 `response_json_schema` 约束输出，并用较低 temperature 和 retry/backoff 处理瞬时错误。这是必要但不充分的防线：JSON schema 只能保证形状，不能保证 workflow id 真实、edge 可执行、canvas metadata 完整。

### 4.3 Orchestrator 是规则和 LLM 的边界层

`AgentOrchestrator` 先走规则解析，规则不够时再调用 LLM：

| 场景 | 优先规则 |
|---|---|
| 是否创作视频 | `is_creative_video_request()` |
| 画幅/时长 | `parse_format_selection()` |
| 继续/重试 | `parse_confirmation_choice()` |
| 修改核心字段 | `parse_core_element_field_revision()` |
| 修改某个分镜 | `parse_shot_revision()` |

这符合生产 Agent 的成本和稳定性原则：

> 明确指令用代码解析，模糊语义交给 LLM；LLM 决策结果再回到代码校验。

最值得讲的是 `_resolve_workflow_plan_funcs()`。它解决了一个很真实的问题：模型可能返回 `video_multi_generation` 这种偏好规则 key，但真实 DAG 需要的是 Registry 里的 workflow id，比如 `run_t2v_format`。代码按顺序兜底：

1. 已经是真实 workflow id：保留。
2. 是 `preferred_workflows` key：映射到真实 id。
3. 走 fallback keys。
4. 从 `relevant_workflows` 按 capability match。

这就是“LLM 负责语义，代码负责结构”的落地。

### 4.4 DraftGenerator 是最终装配器，不是 prompt 模板

`generate_draft()` 会先校验 `generation_node_func` 是否是真实 workflow id：

```python
if not self._is_real_workflow_id(gen_func):
    available = [r.workflow_id for r in self.draft_rule_catalog.list_workflow_rules()]
    raise ValueError(...)
```

然后调用：

```python
self._draft_generator.build_draft(
    script_spec=session.script_spec,
    workflow_plan=session.workflow_plan,
)
```

这里的架构价值是把 DAG 可执行性从 LLM 输出里拿回来。LLM 可以描述“6 个镜头、霓虹城市、跟拍、音乐情绪”，但不能自由决定节点函数、句柄、输出 schema、画布结构。

还应该补一个独立 `validate_dag_draft()`：

| 校验项 | 例子 |
|---|---|
| node id 唯一 | `nodes[*].id` 不重复 |
| workflow id 存在 | `%xxx` 能在 Registry 中找到 |
| edge 端点存在 | `source` / `target` 都在 nodes |
| handle 合法 | `sourceHandle` / `targetHandle` 属于 node schema |
| flow_info 双向一致 | canvas nodes 和 DAG nodes 可映射 |
| outputs 合法 | output 引用存在且类型匹配 |
| globals/schema 一致 | 参数类型、required、默认值一致 |

这个 validator 应该成为线上门禁和离线 eval 的共同核心。

## 5. 为什么不用 LangGraph 替代底层 DAG Engine

这是面试里非常容易被问到的问题。

结论：不应该用 LangGraph 替代 `engine/` 的 DAGExecutor。两者解决的问题不同。

| 对比项 | LangGraph Agent Runtime | DAG Engine |
|---|---|---|
| 图是否允许环 | 允许，适合 agent loop | DAG 执行通常要求无环 |
| 状态 | 共享业务 state + reducer | 节点结果、globals、nodemap |
| 持久化 | checkpoint / thread / history | Redis、DB、MQ、trace |
| 中断 | `interrupt()` 等用户输入 | cancel / fail-fast / worker stop |
| 并发 | super-step active nodes | 拓扑 ready queue + 模型队列 |
| 目标 | 决策流、对话流、恢复 | 确定性执行生成任务 |

`engine/` 里已有的模型级队列、SubDAG、sidecar trace、MQ worker、Redis lazy hydration、画布结构、任务取消、远程 handler 调用，都是媒体生成平台的执行层资产。LangGraph 更适合放在它上面，管“怎么生成一个可执行 DAG 草稿”，而不是亲自执行每个视频/图片/音频节点。

更专业的说法：

> LangGraph 是 agent control plane；DAG Engine 是 media execution plane。上层决定、确认、恢复、组装；下层调度、执行、限流、追踪。

## 6. 当前实现的生产化风险与改造建议

### 6.1 同一 session 并发写

LangGraph 的 `thread_id=session_id` 让恢复很自然，但也意味着同一 session 不能同时跑两次 resume。否则会出现：

```text
用户快速发两条消息
  -> 两个 request 读到同一个 pending_interrupt
  -> 两个 Command(resume=...) 竞争同一 thread
  -> checkpoint / projection 状态不一致
```

建议加 per-session lock：

| 位置 | 做法 |
|---|---|
| API 层 | 同一 `session_id` 串行化请求 |
| Redis | `SET lock:agent:{session_id} value NX EX 60` |
| DB | `run_projection` 增加 active run 唯一约束 |
| 前端 | 禁止同一 session 重复提交，失败可重试 |

### 6.2 Checkpoint 与 Projection 一致性

当前代码里 LangGraph checkpointer 和 `repository.save_state()` 都会持久化状态。需要文档化 source of truth：

| 场景 | 推荐准则 |
|---|---|
| resume 执行 | 以 LangGraph checkpoint 为准 |
| 页面列表/消息 | 以 projection 为准 |
| projection 落后 | 从最新 checkpoint 或 state history 重建 |
| graph checkpoint 成功但 projection 失败 | run 标记为 projection_failed，后台补偿 |
| projection 成功但 checkpoint 失败 | run 失败，不能宣称可恢复 |

长期建议把 projection 写入放到可靠 outbox 或后台 job，避免 response latency 被 history 扫描拖慢。

### 6.3 Interrupt 节点的副作用幂等

官方 interrupts 文档强调：`interrupt()` 恢复时会重新进入调用点，interrupt 之前的副作用必须可幂等。当前 `_node_await_user_turn` 基本没有副作用，这很好。真正的保存和发事件在 `project_turn`，发生在 interrupt 前一个 node。

需要注意的是 `project_turn` 如果在恢复或重放时再次执行，`message_projection` 和 `event_projection` 依赖 `message_id`、`(session_id, seq)` 做 upsert，这个方向是对的；SSE 事件仍需加 `event_id`，让前端可去重。

### 6.4 State 膨胀

LangGraph checkpoint 会保存 state snapshot。当前 state 包含消息、日志、DAG 草稿，长会话下可能变大。建议给每个 checkpoint 记录：

```json
{
  "state_bytes": 128394,
  "messages_count": 48,
  "dag_current_bytes": 89120,
  "checkpoint_write_ms": 42
}
```

超过阈值时：

1. 把大字段 ref 化。
2. 压缩旧消息为 summary。
3. projection 保留完整消息。
4. checkpoint 只保留恢复所需最小状态。

### 6.5 Graph 版本和 State schema 迁移

LangGraph 官方支持一定范围内的 graph/state 迁移，但 interrupted thread 对删除/重命名 node 更敏感。`dag_engine/agent` 应该显式引入：

| 字段 | 用途 |
|---|---|
| `graph_version` | 当前 StateGraph 拓扑版本 |
| `state_schema_version` | `AgentGraphState` 版本 |
| `planner_schema_version` | LLM planner payload 版本 |
| `draft_schema_version` | DAG draft 版本 |

迁移规则：

1. 只新增 state key 通常安全。
2. 重命名 stage/node 要提供 compatibility router。
3. interrupted thread 正要进入的 node 不能直接删除。
4. 老 checkpoint 恢复后先跑 migration node，再进入业务 node。

### 6.6 错误分类与恢复策略

现在 `llm_planner.py` 有 retry/backoff，`service.py` 会把 `PlannerUnavailableError` 映射为 503，把 planner 执行/响应错误映射为 502。这是基础，但还可以更细：

| 错误类型 | 示例 | 策略 |
|---|---|---|
| transient provider error | 502、503、timeout | 自动 retry，保留 checkpoint |
| LLM payload invalid | JSON 合法但字段缺失 | repair loop，回传 validator error |
| user-fixable | 用户没选 synopsis | interrupt 询问用户 |
| registry/config error | workflow id 不存在 | fallback 或提示配置错误 |
| invariant violation | edge 引用不存在 | 阻断落库，报警 |

错误也应该进入 `last_error`，并投影到 run/event，方便面试里讲“怎么排障”。

## 7. 面试 QA：深度落地版

### Q1：为什么选 LangGraph，而不是 LangChain Agent、OpenAI Agents SDK 或自研状态机？

答：

我选 LangGraph 不是因为它“新”，而是因为这个产品需要长流程、有状态、可恢复的 Agent Runtime。创作流程不是一个简单 ReAct loop，而是 `intent -> format_confirm -> synopsis_choice -> core_elements -> storyboard -> dag_draft` 这种阶段型产品状态机。每个阶段都有不同输入输出、用户确认和局部重试。

LangChain Agent 更适合快速搭工具调用循环；OpenAI Agents SDK 更偏高层抽象；自研状态机可以做阶段流转，但 checkpoint、interrupt/resume、streaming、history、并发 state merge 都要自己实现。LangGraph 给的是底层运行时能力：StateGraph、thread_id、checkpointer、interrupt、Command、custom stream。我们可以保留对业务结构的控制，又不用自己重造恢复和中断语义。

落到代码就是：`AgentGraphRuntime._build_graph()` 定义阶段图，`_thread_config()` 用 `session_id` 作为 `thread_id`，`_node_await_user_turn()` 用 `interrupt()`，下一轮用 `Command(resume=user_text)` 恢复。

### Q2：LangGraph 和传统 DAGExecutor 的本质区别是什么？

答：

传统 DAGExecutor 的核心是拓扑调度：节点无环，入度为 0 的先执行，执行完降低下游入度，直到结束。它适合确定性任务执行，比如媒体生成 DAG。

LangGraph 的核心是有状态循环图：节点可以形成环，state 通过 channel 在 super-step 间传递，node 返回 update，runtime 用 reducer 合并。它适合 Agent 决策流：LLM 可以多轮调用工具、等待用户、恢复、修复、再进入下一步。

在我们的架构里，`agent/` 用 LangGraph 管“如何和用户多轮确认并生成一个 DAG draft”；`engine/` 用自研 DAGExecutor 管“如何把已确定的 DAG 跑完”。这是 control plane 和 execution plane 的分工。

### Q3：LangGraph 的 super-step 对工程设计有什么影响？

答：

super-step 决定了三件事。

第一，并发节点拿到的是隔离 state copy，不能依赖共享可变对象互相影响。node 只能返回 update。

第二，同一 key 的多写入必须设计 reducer，否则默认覆盖容易丢数据。比如消息列表、日志列表如果未来由多个 node 并行写，就应该用 `add_messages` 或 `operator.add` 这种 reducer。

第三，checkpoint 在 super-step 边界保存。恢复、time travel、history 都围绕边界发生。所以 node 内部的副作用必须考虑“如果这个 step 失败、恢复或重放，会不会重复执行”。外部 API 调用、文件写入、扣费、发送消息都要么放进 LangGraph task，要么做幂等键。

### Q4：`thread_id=session_id` 为什么重要？

答：

LangGraph checkpointer 用 `thread_id` 查找和恢复同一条执行历史。业务上，一次创作 session 正好对应一条可恢复 agent thread。用 `session_id` 作为 `thread_id` 后，用户刷新页面、断线重连、隔天继续，都能找到同一份 checkpoint。

代码里：

```python
def _thread_config(self, session_id: str) -> dict[str, Any]:
    return {"configurable": {"thread_id": session_id}}
```

这个设计还让 projection 表好建：`session_projection`、`run_projection`、`message_projection`、`checkpoint_projection` 都围绕 `session_id` 关联。

但它也带来并发约束：同一 `session_id` 同一时间只能有一个 active run。生产上要加 Redis 或 DB lock，避免两个 resume 同时写同一个 thread。

### Q5：Interrupt/Resume 在你们代码里如何完整走通？

答：

一次阶段处理结束后，`_finalize_turn()` 生成 assistant message，并设置：

```python
"pending_interrupt": {"kind": "user_turn", "stage": session.stage}
```

随后 `project_turn` 保存 state、投影消息和事件。接着图进入 `await_user_turn`，这里调用：

```python
resumed = interrupt(pending)
```

LangGraph 保存 checkpoint 并暂停。下一轮用户输入进来时，`handle_turn()` 发现 repository state 里有 `pending_interrupt`，就用：

```python
Command(resume=user_text, update={"current_run_id": run_id})
```

恢复同一个 thread。`interrupt()` 调用点返回用户文本，清掉 `pending_interrupt`，图回到 `ingest_turn`，再根据 `stage` 路由到对应业务节点。

### Q6：Interrupt 前后副作用怎么保证不重复？

答：

原则是：`interrupt()` 所在 node 尽量不做外部副作用。当前 `_node_await_user_turn` 基本只调用 `interrupt()` 并清理 turn-scoped 字段，这是合理的。

真正的副作用在 `project_turn`：保存 state、投影 message/event、发送 stream event。这些需要幂等。当前数据库 projection 用 upsert，`message_projection` 以 `message_id` 为主键，`event_projection` 以 `(session_id, seq)` 为主键，方向是对的。还应该给 SSE 事件加 `event_id/run_id/seq`，前端重复收到时可去重。

如果要在 interrupt 前做扣费、发送外部消息、创建资产，必须加 idempotency key，或者把副作用包成可恢复 task。

### Q7：State 里应该放什么，不应该放什么？

答：

State 应该放恢复执行所需的业务事实，例如：

```text
stage
script_spec
workflow_plan
dag_current 或 dag_ref
pending_interrupt
last_turn_meta
```

不应该长期放巨大 prompt、完整 provider token 流、大型二进制、大段中间草稿文本。prompt 应该在 node 内从 raw state 按需格式化。这样 prompt 模板升级不影响历史 checkpoint，state history 也更可读。

在当前代码中，`script_spec`、`workflow_plan`、`pending_interrupt` 放 state 是对的；`messages`、`logs`、`dag_current` 长期可能膨胀，需要 ref 化或摘要化。

### Q8：为什么要有 projection 表，LangGraph checkpoint 不够吗？

答：

Checkpoint 是运行时恢复用的，不适合直接承载产品查询。页面要查 session 列表、消息分页、run 状态、事件日志、历史 checkpoint 摘要，这些查询需要稳定索引和业务字段。

所以 `PostgresAgentRepository` 维护了：

```text
session_projection
run_projection
message_projection
event_projection
checkpoint_projection
```

这相当于把 LangGraph 的运行时状态投影成查询模型。恢复以 checkpoint 为准，页面查询以 projection 为准。projection 落后时可以从 checkpoint/history 重建。

### Q9：如何解释 Planner + Deterministic Assembly？

答：

我们不让 LLM 直接输出完整 DAG，因为它容易编造 workflow id、连错 edge、漏掉 flow_info、产生不可执行 JSON。LLM 只负责语义层计划：

```text
script_spec
synopsis choices
core elements
shots
music
selected workflow ids
```

然后 `AgentOrchestrator` 做 normalize、repair、workflow id resolve，最后 `DraftGenerator` 按 Registry 规则确定性装配真实 DAG。

这套架构把“创意自由度”和“结构正确性”分开：LLM 管语义，代码管约束。生产里这是比“让模型一次性吐完整 DAG”稳定得多的模式。

### Q10：如果模型返回了不存在的 workflow id，怎么办？

答：

当前 `_resolve_workflow_plan_funcs()` 有一套解析链：

1. 如果是 Registry 里的真实 workflow id，直接保留。
2. 如果是 `preferred_workflows` 的 symbolic key，映射到真实 id。
3. 走 fallback keys，例如视频多镜头、单镜头、音频工作流。
4. 扫描 `planning_context.relevant_workflows`，按 capability hints 匹配。
5. 仍然找不到就失败，不允许进入 DAG draft。

这能处理模型把 `video_multi_generation` 当成真实 func 的常见错误。后续还应该加 `validate_dag_draft()`，在 draft 生成后做最终门禁。

### Q11：如何支持“只改第二个镜头，不要重写全部”？

答：

这是 stage-aware routing 的价值。用户在 `storyboard` 阶段输入“第二镜换成俯拍”，先走规则 `parse_shot_revision()`；规则不确定时再用 `classify_stage_intent()`。如果得到 `action=revise_shot` 和 `shot_id`，runtime 调：

```python
planner.stream_plan_workflow(..., revise_shot_id=intent.shot_id)
```

`_apply_workflow_payload()` 会把新返回的 shot merge 回原有 shots，只替换对应 `shot_id`，保留其他分镜。这样用户体验是局部修改，checkpoint 里也能看到每次修改后的结构化 state。

### Q12：LangGraph 的 streaming 在前端怎么落地？

答：

后端使用 `graph.stream(..., stream_mode="custom")`，node 内部用 `get_stream_writer()` 发结构化事件。`AgentApplicationService.stream_response()` 把这些事件通过 SSE 编码出去。

前端不应该只监听 token，而应该监听业务事件：

```text
stage.started -> 显示阶段进度
planner.delta -> 显示生成中
message.created -> 插入助手消息
dag_draft.replaced -> 替换画布草稿
message.completed -> 收尾
error -> 展示可恢复错误
```

生产上要补 `run_id`、`seq`、`event_id`，解决断线重连和重复事件。

### Q13：这套系统怎么做可靠性测试？

答：

至少四层。

第一，parser 单测：画幅、时长、继续/重试、修改字段、修改镜头等规则解析。

第二，planner contract tests：用 fake planner payload 验证 normalize、repair、workflow id resolve、局部 merge。

第三，runtime tests：创建 session，按阶段推进，验证 checkpoint、pending_interrupt、resume、message_projection、run 状态。

第四，draft validator/eval：固定一批用户需求，生成 DAG draft，检查 node/edge/flow_info/schema 是否可执行，并统计一次性可执行率、修复率、失败原因分布。

已有测试里 `test_agent_runtime.py`、`test_llm_planner.py`、`test_agent_routes.py` 已经覆盖了一部分 runtime 和 API 行为，后续重点是把 DAG validator 作为硬门禁。

### Q14：如果要让分镜并行生成，应该用 LangGraph Send 吗？

答：

要看并行发生在哪一层。

如果是 Agent planning 阶段，要让多个 shot 的文案/提示词并行生成，可以在 LangGraph 层用 `Send` 或子图，让每个 shot worker 独立生成，再 reducer 合并结果。

但如果是实际视频/图片生成任务，那应该交给底层 DAG Engine。它已经有模型队列、handler、SubDAG、MQ/Redis、取消和 trace。不要用 LangGraph 去替代媒体执行层。

所以原则是：语义规划并行可考虑 LangGraph；资产生成并行交给 DAG Engine。

### Q15：怎么处理 graph/state schema 迁移？

答：

要显式版本化。state 里加 `graph_version`、`state_schema_version`、`planner_schema_version`、`draft_schema_version`。新增字段通常安全；删除或重命名 interrupted thread 可能马上要进入的 node 风险很大。

我的做法是：

1. 老 node 名保留一段兼容期。
2. 新 graph 入口先跑 migration node，把旧 state 补齐。
3. router 兼容旧 stage 名。
4. checkpoint history 保留原始 metadata。
5. 对 interrupted sessions 做灰度恢复测试。

### Q16：如何解释你在这个项目里的工程判断？

答：

我会强调三个判断。

第一，没有把所有事情都交给 LLM。LLM 只做语义规划，DAG 结构由确定性代码生成。

第二，没有用 LangGraph 替代底层 DAG Engine。LangGraph 管 Agent 控制流，DAG Engine 管媒体任务执行，各自保持边界。

第三，把 checkpoint 和业务 projection 分开。运行时恢复需要 checkpoint，产品查询需要 projection，两者的读写语义不同。

这三个判断都是为了降低生产不确定性：模型输出不确定、用户行为不确定、长流程失败不确定，但系统边界和恢复策略必须确定。

### Q17：这套架构最大的短板是什么？

答：

当前最大的短板不是“有没有用 LangGraph”，而是生产化细节还要补齐：

1. 同一 session 并发请求需要锁。
2. checkpoint/projection 一致性需要补偿机制。
3. state 大小需要指标和瘦身策略。
4. DAG draft validator 应该成为最终门禁。
5. SSE 事件需要 `run_id/seq/event_id`。
6. 错误需要结构化分类，支持用户修复、planner repair 和运维报警。

这些补齐后，LangGraph 的 checkpoint/resume 才能真正变成线上 SLA，而不是 demo 能跑。

## 6. 生产级持久化与高并发治理（PostgreSQL 核心机制）

在真实的千万级高并发企业场景下，LangGraph 的持久化不能只靠 demo 里的 `InMemorySaver`，而必须落地到以 PostgreSQL 为核心的持久化方案。

### 6.1 PostgreSQL 物理存储与 Schema 设计
在生产环境下，LangGraph 推荐并集成了 `langgraph-checkpoint-postgres`。其底层的物理表结构主要包含以下几张核心表：

1. **`checkpoints` (检查点元数据表)**
   - 存储每个 super-step 结束时图的元数据。
   - 核心字段：`thread_id`（通常映射为 `session_id`）、`checkpoint_id`（由系统生成的有序 UUID / 时间戳）、`parent_id`（父检查点指针，用以形成链式 DAG 历史游标，支持 Time Travel）、`metadata`（存储运行节点名称、当前 run_id 等）。
2. **`checkpoint_blobs` (状态二进制大对象表)**
   - 存储序列化后的图状态。
   - 核心字段：`thread_id`、`checkpoint_id`、`channel`（每个 state 键对应一个通道）、`type`（数据序列化类型，如 json、pickle、protobuf）、`blob`（二进制存储的实际 State 增量或快照）。
3. **`checkpoint_writes` (Super-step 写入缓冲表)**
   - 临时暂存当前 super-step 运行中各个 Node 返回的 `updates`，在 super-step 边界执行合并（Reduce）并转换为最终的 checkpoint 快照，然后清空 writes 记录。

### 6.2 异步非阻塞高并发治理 (AsyncPostgresSaver)
在 FastAPI 等基于 asyncio 的异步高性能 API 框架中，**严禁使用任何同步数据库 Saver**。
- **痛点**：同步 checkpointer 会发起阻塞式的 I/O 连接，强行占用 FastAPI 主事件循环，导致并发请求吞吐断崖式下跌，甚至引起大面积 HTTP 504 延迟超时。
- **对策**：必须统一使用 `AsyncPostgresSaver`，并配合 `asyncpg` 异步驱动。

```python
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool

# 建立异步连接池
pool = AsyncConnectionPool(conninfo="postgresql://user:pass@host/db", max_size=20)

async def run_agent_workflow():
    async with AsyncPostgresSaver(pool) as saver:
        # 编译图时挂载异步持久化组件
        app = workflow.compile(checkpointer=saver)

        # 运行过程中，所有 Checkpoint 读写都由 aio 协程异步驱动，绝不阻塞主事件循环
        config = {"configurable": {"thread_id": "session_123"}}
        await app.ainvoke({"messages": [{"role": "user", "content": "hi"}]}, config)
```

### 6.3 悲观排他锁与并发写冲突 (Thread Locking)
在多渠道、高频轮询的场景下，同一个 `thread_id`（即同一个 `session_id`）极有可能遭遇并发请求碰撞（例如用户手抖快速点击了两次，或者前端 Canvas 在发送心跳的同时，用户提交了新修改）。
- **LangGraph 原生锁机制**：LangGraph Checkpointer 在读取或执行某一 thread 时，会对该 `thread_id` 施加行级悲观锁。如果第二个请求试图写同一个 thread，它将被阻塞，直到前一个 super-step 执行完毕、checkpoint 保存完成、锁被释放。
- **工程保护**：在应用平台层，我们应该对 API 网关配置分布式 Redis 悲观锁。当判断某个 `session_id` 处于 `running` 状态时，直接在网关层将冲突请求拦截并返回 `HTTP 409 Conflict`，避免大量请求在数据库级别排队挂起，引发连接池枯竭故障。

---

## 7. "Time Travel" 机制与状态分支原理 (Fork, Rewind)

在多模态创作或 AI 辅助编程领域，用户经常不满足于“单线前行”的生成结果，而是希望能够“回滚到 3 步以前，重新走另一条创意分支”。这在工程上被称为 **时间旅行（Time Travel）**。

### 7.1 Checkpoint 链与 Fork 的数学模型
LangGraph 默认采用链式结构（Linked List）存储一个 thread 下的所有 Checkpoint：
$$\text{CP}_0 \longleftarrow \text{CP}_1 \longleftarrow \text{CP}_2 \longleftarrow \text{CP}_3$$
每个 Checkpoint 记录自己的 `parent_id`。
当用户希望对 $\text{CP}_1$ 阶段的数据做人工编辑，然后继续生成时，系统会执行 **Fork** 动作：
1. 客户端通过 `get_state_history(thread_id)` 获取历史 $\text{CP}_1$ 的 `checkpoint_id`。
2. 调用 `update_state` 往该历史检查点写入用户编辑的值。
3. LangGraph 运行时不会覆写原始链条，而是会克隆 $\text{CP}_1$，并将它的 `parent_id` 设为 $\text{CP}_1$，从而分叉出一条新的历史分支：

```text
                  ┌──> CP_4 (New Branch) ──> CP_5...
                  │
CP_0 <── CP_1 <── CP_2 <── CP_3 (Abandoned Branch)
```

### 7.2 Time Travel 代码实现示例
以下是我们在 API 层面实现“回到分镜阶段 2 并覆盖其参数，重新生成视频草稿”的底层逻辑：

```python
async def rewind_and_fork_thread(session_id: str, target_checkpoint_id: str, edit_payload: dict):
    config = {"configurable": {"thread_id": session_id}}

    # 1. 获取目标 Checkpoint 历史状态
    checkpoint_config = {
        "configurable": {
            "thread_id": session_id,
            "checkpoint_id": target_checkpoint_id
        }
    }

    # 2. 调用 update_state 往指定 Checkpoint 执行分支写入
    # as_node 指定本次状态更新以哪个节点的名义发起，使图运行时能够顺理成章地路由到下一个相邻 Node
    await app.aupdate_state(
        checkpoint_config,
        values={
            "script_spec": edit_payload,           # 覆盖历史分镜数据
            "stage": "storyboard",                 # 将阶段强制拨回分镜节点
            "pending_interrupt": None              # 消除挂起的中断
        },
        as_node="storyboard_generator_node"
    )

    # 3. 重新运行图。LangGraph 将自动加载最新分叉的 Checkpoint 分支继续顺流执行
    async for event in app.astream(
        None,                                      # 传 None 表示不输入新 message，完全从最新 Checkpoint 恢复
        config=config,
        stream_mode="custom"
    ):
        yield event
```

---

## 8. 面试版 90 秒总结

可以这样讲：

> 我们的系统分成两层运行时：上层 `agent/` 用 LangGraph 做长流程 Agent Runtime，下层 `engine/` 是自研 DAG 执行器。LangGraph 负责多轮创作会话的状态、阶段流转、checkpoint、interrupt/resume 和 custom streaming；DAG Engine 负责真实媒体生成 DAG 的拓扑调度、模型队列、SubDAG、trace 和 cancel。
>
> 在代码里，`AgentGraphRuntime` 用 `StateGraph(AgentGraphState)` 定义阶段图，`session_id` 作为 LangGraph `thread_id`，每轮结束通过 `pending_interrupt` 和 `interrupt()` 等用户输入，下一轮用 `Command(resume=...)` 恢复。`script_spec`、`workflow_plan`、`dag_current` 都是结构化 state，prompt 在 planner node 内按需格式化。
>
> 最关键的设计是 Planner + Deterministic Assembly：LLM 只输出结构化计划、分镜、音乐和 workflow 选择；`AgentOrchestrator` 负责规则解析、payload 修复、workflow id 解析；`DraftGenerator` 按 Registry 规则确定性生成 DAG。这样既保留 Agent 的语义理解能力，又避免模型编造不可执行节点。生产上还需要补 session lock、state 瘦身、DAG validator、event 去重和 projection 补偿。

## 9. 资料来源

本文按 2026-05-18 可访问的官方资料整理：

- LangGraph Overview：<https://docs.langchain.com/oss/python/langgraph/overview>
- LangGraph Graph API：<https://docs.langchain.com/oss/python/langgraph/graph-api>
- LangGraph Persistence：<https://docs.langchain.com/oss/python/langgraph/persistence>
- LangGraph Durable Execution：<https://docs.langchain.com/oss/python/langgraph/durable-execution>
- LangGraph Interrupts：<https://docs.langchain.com/oss/python/langgraph/interrupts>
- LangGraph Streaming：<https://docs.langchain.com/oss/python/langgraph/streaming>
- LangGraph Runtime / Pregel：<https://docs.langchain.com/oss/python/langgraph/pregel>
- LangGraph Subgraphs：<https://docs.langchain.com/oss/python/langgraph/use-subgraphs>
- LangGraph GitHub：<https://github.com/langchain-ai/langgraph>
- Building LangGraph: Designing an Agent Runtime from First Principles：<https://www.langchain.com/blog/building-langgraph>
