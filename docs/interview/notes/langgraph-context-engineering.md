# LangGraph 上下文工程实战（深度专题）

> 这是 ArtArch.AI 面试 Q&A 的延伸专题。配合 [artarch-ai.md](../artarch-ai.md) Q5/Q10 食用。
>
> 关键参考：
> - LangChain - [Context Engineering for Agents](https://www.langchain.com/blog/context-engineering-for-agents)（Write/Select/Compress/Isolate 四象限的提出者）
> - Phil Schmid - [Context Engineering Part 2](https://www.philschmid.de/context-engineering-part-2)
> - Karpathy - [The append-and-review note](https://karpathy.bearblog.dev/the-append-and-review-note/)

---

## 1. 为什么不是「装多少塞多少」

Phil Schmid 在 Context Engineering Part 2 给了一句话定义：

> **"Context Engineering is not about adding more context. It is about finding the minimal effective context required for the next step."**

把这句话往 LangGraph 上套：

- **Step** = graph 里一个 node 的一次 LLM 调用。
- **Minimal effective context** = 让模型完成当前 node 任务的最小上下文。
- 长流程 Agent 跑 30 个 node，如果每个 node 都把全量历史塞进去，token 成本是线性叠加；如果做好上下文工程，每个 node 只看 `script_spec` + 当前 shot，成本是常数。

下面把 LangChain 总结的四个策略具体翻译成 LangGraph 操作。

---

## 2. Write：把不该进 prompt 的写出去

**模式**：让 graph state 里只保留「**引用**」，把「**内容**」写到外部存储。

```python
class AgentGraphState(TypedDict):
    # ❌ 错误：直接塞内容
    # storyboard_images: list[bytes]
    # storyboard_descriptions: list[str]  # 每条 2KB 描述

    # ✅ 正确：只塞引用
    storyboard_image_refs: list[str]  # S3 key
    storyboard_description_refs: list[str]  # PG row id
    storyboard_summary: str  # 极简摘要，给 planner 用
```

**取的时候惰性加载**：

```python
async def _node_handle_storyboard(state: AgentGraphState):
    # 只在需要时按 ref 取
    if state["stage"] == "music":
        # music 阶段不需要原始 storyboard 描述，跳过
        return ...
    descs = await desc_store.batch_get(state["storyboard_description_refs"])
    ...
```

**踩过的坑**：state 字段允许 `bytes / list[dict]` 但 Postgres jsonb 字段有 1GB 限制；checkpoint 写多了直接撑爆。**强制 state schema review**：禁止 `list[bytes]` / `list[dict]` 的字段，原子大对象一律走外部 ref。

---

## 3. Select：每 node 只把必要字段塞进去

LangGraph 的 State 是「全局 channel」，所有 node 都能读全状态。这是双刃剑：方便，但**不应该把整个 state 直接 dump 进 prompt**。

**Pattern：每个 node 自己做 context selection**：

```python
async def _node_handle_storyboard(state: AgentGraphState):
    # ✅ 只选当前 node 需要的字段
    prompt_ctx = {
        "script_spec": state["script_spec"],
        "core_elements": state["core_elements"],
        "style": state["confirmed_choices"].get("style"),
        "shot_count_target": state["script_spec"].shot_count,
        # 注意：不要把 messages / planner_logs / dag_current 拉进来
    }
    plan = await planner.gen_storyboard(prompt_ctx)
    return {"storyboard_plan": plan}
```

**反例（不要这么做）：**

```python
# ❌ 把整个 state JSON 塞进 prompt，省事但 token 直线上涨
prompt = f"Current state:\n{json.dumps(state, ensure_ascii=False)}\n\n请生成分镜。"
```

---

## 4. Compress：超长历史的可逆 vs 有损压缩

Phil Schmid 的关键区分：

| 类型 | 做法 | 适用 |
|---|---|---|
| Compaction（可逆） | 把工具输出替换成引用、把图片替换成 S3 key | tool result、attachment |
| Summarization（有损） | LLM 摘要，丢弃原文 | 闲聊、远古上下文 |

**在 LangGraph 里的实现：**

```python
async def maybe_compress(state: AgentGraphState) -> dict:
    msgs = state["messages"]
    total_tokens = sum(estimate_tokens(m) for m in msgs)

    if total_tokens < 8000:
        return {}  # 不用压

    # 关键：保留最近 4 轮原文（模型节奏），早期的摘要
    recent = msgs[-4:]
    older = msgs[:-4]

    # 结构化摘要（有损 + 保留关键决策）
    summary = await summarizer.summarize(
        older,
        keep_decisions=True,
        schema=DecisionSummary,
    )

    return {
        "messages": recent,
        "history_summary": summary,
        # 关键决策永远走结构化字段，不靠 summary
    }

# 在 graph 里挂为前置 node
graph.add_node("maybe_compress", maybe_compress)
graph.add_edge("ingest_turn", "maybe_compress")
graph.add_edge("maybe_compress", "route_by_stage")
```

**Karpathy 的「append-and-review」思路应用**：

- 原文 messages = "append-only raw note"
- DecisionSummary（结构化字段）= "reviewed structured memory"
- 决策类信息从来不走自由文本摘要，单独入 `confirmed_choices`

---

## 5. Isolate：sub-agent / sub-graph 隔离上下文

复杂阶段（storyboard / music）拆成子图，子图的 state 不污染主图。

```python
# 主图状态
class MainGraphState(TypedDict):
    session_id: str
    stage: Stage
    script_spec: ScriptSpec
    confirmed_choices: dict
    storyboard_result: StoryboardOutput | None  # 子图返回的精简结果
    ...

# 子图状态（更细，但不暴露给主图）
class StoryboardGraphState(TypedDict):
    shots_draft: list[ShotDraft]
    shot_critic_logs: list[CriticLog]
    shot_retries: list[int]
    style_anchors: list[StyleAnchor]
    final_output: StoryboardOutput

# 主图节点调用子图
async def _node_run_storyboard(state: MainGraphState):
    sub_state = StoryboardGraphState(...)
    result = await storyboard_subgraph.ainvoke(sub_state)
    return {"storyboard_result": result["final_output"]}
```

**好处**：

1. 主图 state 不会因为「子图的中间细节」越来越大。
2. 子图可以独立 checkpoint / evaluate / replay。
3. 子图的 prompt 失败不影响主图。

---

## 6. Prefix Cache 友好的 prompt 组织

Anthropic Claude / OpenAI / Gemini 都支持 prefix cache。LangGraph 的 prompt 组装顺序如果设计得好，可以提升 cache 命中率：

```python
# ✅ Cache 友好：不变的在前，变化的在后
prompt = f"""
{IMMUTABLE_SYSTEM_PROMPT}              # 不变（cache hit）
{IMMUTABLE_FEW_SHOT_EXAMPLES}          # 不变（cache hit）
{IMMUTABLE_TOOL_DEFINITIONS}           # 不变（cache hit）
---
{session_summary}                       # 半变（按会话）
{current_stage_context}                # 每次都变
{user_message}                          # 每次都变
"""
```

**反例（cache 不友好）：**

```python
# ❌ 变化的在前
prompt = f"""
{user_message}                          # 每次都变 → 整个 prompt cache miss
{session_summary}
{IMMUTABLE_SYSTEM_PROMPT}
"""
```

Anthropic Claude prompt cache 节省 90% input cost，前提是 prefix 完全一致。Gemini 的 implicit caching 类似。这是日 LLM 成本最大的杠杆之一。

---

## 7. Reducer 的正确用法（容易踩坑的点）

LangGraph state 是「合并语义」，不是覆盖语义：

```python
from langgraph.graph.message import add_messages
from typing import Annotated

class AgentGraphState(TypedDict):
    # 用 reducer 才会增量合并
    messages: Annotated[list[BaseMessage], add_messages]
    logs: Annotated[list[LogEntry], operator.add]
    # 普通字段是覆盖语义
    script_spec: ScriptSpec
```

**典型错误**：没写 reducer 的 list 字段，每个 node 返回的 list 都会**覆盖**前面 node 的值，导致历史丢失。

**调试技巧**：每次 graph step 后 dump state diff，看哪些字段在意外覆盖。

---

## 8. Checkpoint 落地实战

```python
from langgraph.checkpoint.postgres import PostgresSaver

async def build_runtime():
    pool = AsyncConnectionPool(DATABASE_URL, max_size=20)
    checkpointer = PostgresSaver(pool)
    await checkpointer.setup()  # 建表

    graph = StateGraph(AgentGraphState)
    # ... add nodes & edges ...
    return graph.compile(checkpointer=checkpointer)

# 一次会话 = 一个 thread
config = {"configurable": {"thread_id": session_id}}
async for ev in runtime.astream(input, config=config, stream_mode="custom"):
    ...

# 断线恢复：用同一个 thread_id 再 invoke，会从最近 checkpoint 起来
```

**生产化关键：**

- **表分区**：checkpoint 表按 `created_at` 月分区，旧数据归档。
- **state 大小监控**：单条 checkpoint 大于 32KB 就告警，往往是有人塞了大对象进 state。
- **不同环境用不同 checkpoint store**：Dev 用 InMemorySaver，prod 用 Postgres。

---

## 9. 综合 checklist（面试可直接背）

| Item | 我的做法 |
|---|---|
| State 不存大对象 | 只存 ref（S3 key / PG row id） |
| 每 node 自做 select | 不 dump 全 state |
| 压缩有可逆 + 有损 | 工具输出走 compaction，闲聊走 summarization |
| 决策走结构化 | `confirmed_choices` 单独字段，不靠 summary |
| 子图隔离 | 复杂阶段 sub-graph，state 不污染主图 |
| Prefix cache 友好 | 不变 prompt 在前，变化在后 |
| Reducer 正确写 | list 字段都标注 Annotated reducer |
| Checkpoint 监控 | 单条 < 32KB，超阈值告警 |
| Eval per stage | 每个 node 独立可评测 |

---

## 10. 一句话总结

> **Context Engineering 不是把多东西塞进 prompt，而是让每个 LLM 调用都拿到「刚好够用」的上下文**。LangGraph 提供的 State / Reducer / Sub-graph / Checkpoint，是把这件事工程化的最佳工具集。
