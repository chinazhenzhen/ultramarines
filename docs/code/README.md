# 代码练习 · 工程实现复习路线

> 目标：把“会讲架构”补成“能写关键代码”。这一区不是刷题列表，而是把算法、系统设计和工程实现拆成可复述、可手写、可追问的肌肉记忆。

---

## 1. 为什么需要单独的 Code 模块

现在项目里的 Review / Interview 文档已经能覆盖“怎么讲”。Code 模块要解决的是另一类面试风险：

- 面试官让你把链表、限流器、任务队列、Operator reconcile 写出来。
- 系统设计聊完后追问数据结构和边界条件。
- AI Agent 项目被追问到 Pydantic schema、LangGraph node、SSE event store、K8s controller 的代码骨架。
- 候选人讲得很熟，但手写代码缺少稳定模板。

一句话定位：

> Review 负责“讲清楚为什么”，Interview 负责“回答怎么问”，Code 负责“现场写得出来”。

## 2. 三类题库规划

| 分类 | 目标 | 第一批题目 | 对应文档 |
|---|---|---|---|
| 算法 | 稳住基础手写能力 | 链表两两交换、二分边界、DFS/BFS、TopK、滑动窗口 | 面试通用基础 |
| 系统设计 | 把架构拆成可写组件 | 限流器、延迟队列、分布式 ID、幂等表、事件重放 | 后端 / SSE / RAG |
| 工程实现 | 对齐简历技术栈 | LangGraph custom node、Pydantic schema、SSE generator、K8s Operator skeleton、Scheduler plugin skeleton | Agent / K8s / LLM Ops |

## 3. 优先补的 8 个细分项

| 优先级 | 题目 | 为什么值得写 |
|---|---|---|
| P0 | [链表两两交换 + 指针不丢失模板](./algorithm/01-swap-linked-list-pairs.md) | 当前 `demo.py` 已经在练这个，但需要整理成规范题解 |
| P0 | [SSE replay-then-subscribe event store](./engineering/01-sse-event-store.md) | 和 Agent Runtime / 后端文档强相关，容易被追问 |
| P0 | [Pydantic JSON Schema 校验 + retry-with-feedback](./engineering/02-pydantic-structured-output.md) | 连接 structured output、tool calling、Planner IR |
| P1 | [LangGraph custom node + checkpoint state](./engineering/05-langgraph-custom-node.md) | 能把 LangGraph 文章落到代码 |
| P1 | [Token bucket / sliding window 限流器](./system-design/01-rate-limiter.md) | 后端高频题，能映射用户/项目/模型级限流 |
| P1 | [K8s Operator reconcile skeleton](./engineering/03-k8s-operator-skeleton.md) | 对应 GPU / Operator 二开文档 |
| P1 | [Scheduler Framework plugin skeleton](./engineering/04-scheduler-framework-plugin.md) | 对应 K8s GPU 调度深挖 |
| P2 | [RAG hybrid retrieval scorer](./engineering/06-rag-hybrid-scorer.md) | 把 BM25、dense、rerank、RRF 写成可测代码 |

## 4. 单题模板

---

每道题按以下结构写，避免变成零散笔记。

```markdown
# {{题号}} · {{题目名称}}

## 1. 题目描述

{{清晰描述输入输出、约束条件}}

## 2. 思路分析

> 关键点：{{时间 / 空间复杂度 | 边界情况 | 核心洞察}}

## 3. 代码实现

```python
def solution({{params}}):
    """
    时间复杂度：O({{n}})
    空间复杂度：O({{n}})
    """
    # 核心逻辑
    pass
```

## 4. 复杂度分析

| 维度 | 复杂度 | 说明 |
|------|--------|------|
| 时间 | O({{}}) | {{关键操作分析}} |
| 空间 | O({{}}) | {{额外空间用途}} |

## 5. 追问扩展

- 如果数据量扩大到 100x 怎么办？
- 如果需要支持并发 / 分布式呢？
- 如果要求 Exactly-Once 语义呢？

## 6. 面试口播

{{30 秒讲清核心思路}}
```

---

## 5. 当前进度

| 分类 | 规划 | 完成 |
|------|------|------|
| 算法 | 15 题 | 1 |
| 系统设计 | 10 题 | 1 |
| 工程实现 | 8 题 | 6 |

---

## 6. 第一批落地顺序

1. [链表两两交换](./algorithm/01-swap-linked-list-pairs.md)：已完成。
2. [SSE Event Store](./engineering/01-sse-event-store.md)：已完成。
3. [Pydantic Structured Output](./engineering/02-pydantic-structured-output.md)：已完成。
4. [K8s Operator Skeleton](./engineering/03-k8s-operator-skeleton.md)：已完成。
5. [Scheduler Framework Plugin](./engineering/04-scheduler-framework-plugin.md)：已完成。
6. [LangGraph custom node + checkpoint state](./engineering/05-langgraph-custom-node.md)：已完成。
7. [Token bucket / sliding window 限流器](./system-design/01-rate-limiter.md)：已完成。
8. [RAG hybrid retrieval scorer](./engineering/06-rag-hybrid-scorer.md)：已完成。

## 7. 和现有资料的关系

| Code 题目 | 对应复习文档 |
|---|---|
| SSE event store | [后端架构、SSE、Kubernetes GPU 与 Operator](../review/04-backend-cloud-native.md) |
| Pydantic structured output | [Tool Calling、Structured Output、MCP 协议](../review/08-tool-calling-mcp.md) |
| LangGraph custom node | [AI Agent 与 LangGraph 工程化](../review/01-ai-agent-langgraph.md) |
| K8s Operator skeleton | [K8s GPU 调度二次开发深度复习](../deep-dive/2026-06-25-k8s-gpu-scheduling-development-review.md) |
| RAG hybrid scorer | [RAG、混合检索与医疗问答](../review/02-rag-retrieval.md) |
| Token bucket / sliding window | [后端架构、SSE、Kubernetes GPU 与 Operator](../review/04-backend-cloud-native.md) |

---

## 8. 维护规则

- 每题必须有可运行代码或伪代码，不能只有文字。
- 每题必须写复杂度、边界条件和 30 秒口播。
- 工程实现题优先使用 Python / Go，和简历技术栈保持一致。
- 新增题目后同步注册到 `reader.js` 和 `app.js`，避免“文件存在但前端看不到”。
