# 项目文档审计与深挖路线

> 审计目标：检查当前 Atlas 文档库是否存在“文件已写但前端不可见”“复习路线遗漏”“主题覆盖不均”“值得单独成文的细分项”等问题，并把能直接修的结构问题补上。

## 1. 结论

当前项目文档主线已经比较完整：Resume、Review、Interview、Interview Notes、Deep Dive 都有稳定内容，前端 reader 也支持 Markdown、Mermaid、表格、图片、目录和代码块渲染。

这轮审计发现 3 个明确优化点：

| 问题 | 影响 | 处理 |
|---|---|---|
| `docs/code/README.md` 已存在，但首页 Code 区仍显示 Coming soon | 用户以为代码练习区没有内容 | 已把 Code README 改成正式“工程实现复习路线”，并接入前端 |
| K8s GPU 深挖已接入 reader/app，但未进入复习总索引 | 复习路线里看不到新专题 | 已补进 `docs/review/README.md` |
| `references.md` 缺少 K8s GPU 二开、DRA、Scheduler Framework、工程代码骨架资料 | 深挖专题缺少统一资料入口 | 已补充 Kubernetes / NVIDIA / Pydantic / Kubebuilder 等来源 |
| Code 路线只有规划，没有实际题解 | 仍然不能支撑“现场写代码” | 已补 8 篇 Code 题解并接入前端 |

## 2. 当前文档覆盖

| 模块 | 当前状态 | 评价 |
|---|---|---|
| Resume | 有完整简历 Markdown 和前端入口 | 稳定 |
| Review | 覆盖 Agent、RAG、LLM Ops、Backend、K8s GPU、Transformer | 主线完整 |
| Interview | 三个项目 Q&A + 旧版总览 | 可用于面试模拟 |
| Interview Notes | LangGraph、Planner、RAG、UGC Judge、UGC Agent | 深挖足够 |
| Deep Dive | K8s GPU 调度二次开发 | 已成为 Infra 重点专题 |
| Code | 原来是占位，现在改为工程实现路线 | 需要继续补题解 |
| References | 原来覆盖 Agent/RAG/Backend，现在补了 K8s GPU 和 Code Practice | 更完整 |

## 3. 已完成的优化

### 3.1 Code 模块从占位变成可用入口

文件：

- `docs/code/README.md`
- `reader.js`
- `app.js`

改动：

- 将 Code README 从“规划中”改成“工程实现复习路线”。
- 明确 Code 模块定位：从“会讲架构”补到“能写关键代码”。
- 规划算法、系统设计、工程实现三类题库。
- 列出第一批最值得补的 8 个细分题目。
- 补齐 8 篇可打开题解：链表两两交换、SSE Event Store、Pydantic Structured Output、K8s Operator Skeleton、Scheduler Framework Plugin、LangGraph Custom Node、限流器、RAG Hybrid Scorer。
- 首页 Code 卡片改为可点击入口。
- reader 左侧栏新增 `Code Practice` 分组。
- command palette 新增 Code 搜索入口。

### 3.2 Review 总索引补齐新专题

文件：

- `docs/review/README.md`

改动：

- 推荐复习顺序新增 K8s GPU 调度二次开发深度复习。
- 推荐复习顺序新增 Code 工程实现复习路线。
- 技术栈到面试能力映射新增 K8s GPU 二次开发和代码练习。

### 3.3 References 补齐资料来源

文件：

- `docs/review/references.md`

新增资料：

- Kubernetes Scheduling Framework
- Kubernetes Dynamic Resource Allocation
- NVIDIA GPU Operator
- NVIDIA k8s-device-plugin
- Python dataclasses
- Pydantic Models
- Kubernetes Controller Runtime
- Kubernetes Python Client

## 4. 还值得单独写的深挖文档

这轮审计后，我建议后续最值得单独成文的不是再扩泛知识，而是补“可手写的工程实现题”。优先级如下：

| 优先级 | 文档 | 建议路径 | 价值 |
|---|---|---|---|
| P0 | SSE Event Store 与断线重放代码题 | `docs/code/engineering/01-sse-event-store.md` | 已完成 |
| P0 | Pydantic Structured Output 校验与修复重试 | `docs/code/engineering/02-pydantic-structured-output.md` | 已完成 |
| P1 | K8s Operator Skeleton 手写题 | `docs/code/engineering/03-k8s-operator-skeleton.md` | 已完成 |
| P1 | Scheduler Framework Plugin Skeleton | `docs/code/engineering/04-scheduler-framework-plugin.md` | 已完成 |
| P1 | RAG Hybrid Scorer 代码题 | `docs/code/engineering/06-rag-hybrid-scorer.md` | 已完成 |
| P1 | LangGraph custom node + checkpoint state | `docs/code/engineering/05-langgraph-custom-node.md` | 已完成 |
| P1 | Token bucket / sliding window 限流器 | `docs/code/system-design/01-rate-limiter.md` | 已完成 |

这批题目比继续写概念文档更有价值，因为当前 Review / Interview 已经足够覆盖“怎么讲”，短板在“现场能否写出来”。本轮已经完成第一批 P0/P1 题解，后续可以继续补延迟队列、分布式 ID、幂等表、二分边界、TopK 和滑动窗口算法。

## 5. 建议的后续节奏

1. 已把 `docs/code/demo.py` 对应的链表两两交换整理成正式算法题解。
2. 已补 SSE Event Store，这是和现有后端文档结合最紧的工程题。
3. 已补 Pydantic Structured Output，能直接支撑 Tool Calling / Planner 追问。
4. 已补 K8s Operator 与 Scheduler Framework skeleton，承接 K8s GPU 深挖。
5. 已补 RAG Hybrid Scorer、LangGraph custom node、Token bucket / sliding window。
6. 下一轮优先补延迟队列、分布式 ID、幂等表和二分边界。

## 6. 验证清单

本轮应验证：

- `app.js` / `reader.js` 语法检查通过。
- `git diff --check` 无尾随空格。
- 新增 `code-index` 和 8 篇 Code 题解能在 reader 文章表中找到。
- 首页 Code 区从占位变成可点击入口。
- Review 总索引能跳转到 K8s GPU 和 Code 路线。
- References 包含新增 Kubernetes / NVIDIA / Code Practice 资料。

## 7. Sources

- 本项目文件清单：`rg --files docs assets`
- 前端文章索引：`reader.js`
- 首页入口与搜索索引：`app.js`
- 复习路线索引：`docs/review/README.md`
- 资料来源页：`docs/review/references.md`
- Code 模块入口：`docs/code/README.md`
