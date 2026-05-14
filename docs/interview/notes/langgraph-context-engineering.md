# LangGraph 上下文工程实战（深度专题）

> 这是 ArtArch.AI 面试 Q&A 的延伸专题。配合 [artarch-ai.md](../artarch-ai.md) Q5/Q10 食用。
>
> **本文双线索**：
> - **主线**：ArtArch.AI 视频创作 pipeline（intent → script → storyboard → shot × N → music → assembly）怎么用 LangGraph 把 Write / Select / Compress / Isolate 做到生产级。
> - **副线**：同样的四件事，Anthropic 内部 **Claude Code** 是怎么解的——它没有 LangGraph，但有更原始也更暴力的做法（文件系统作内存、System Reminder 作 turn-local 状态、TodoWrite 作结构化任务历史、subagent 冷启动作 Isolate）。读完这一篇你能同时拿到两个参照系。
>
> 关键参考：
> - LangChain · [Context Engineering for Agents](https://www.langchain.com/blog/context-engineering-for-agents) — Harrison Chase（Write/Select/Compress/Isolate 四象限提出者）
> - Phil Schmid · [Context Engineering Part 2](https://www.philschmid.de/context-engineering-part-2) — compaction vs summarization
> - Drew Breunig · [How to Fix Your Context](https://www.dbreunig.com/2025/06/22/how-to-fix-your-context.html) — 上下文工程六法
> - Karpathy · [The append-and-review note](https://karpathy.bearblog.dev/the-append-and-review-note/) — raw note + reviewed memory
> - Anthropic · [Effective context engineering for AI agents](https://www.anthropic.com/news/effective-context-engineering-for-ai-agents) — Claude Code 团队官方
> - Anthropic · [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — Orchestrator-workers / Routing pattern
> - LangGraph · [Multi-agent supervisor 教程](https://langchain-ai.github.io/langgraph/tutorials/multi_agent/agent_supervisor/)

---

## 1. 为什么不是「装多少塞多少」

Phil Schmid 在 Context Engineering Part 2 给了一句话定义：

> **"Context Engineering is not about adding more context. It is about finding the minimal effective context required for the next step."**

把这句话往 LangGraph 上套：

- **Step** = graph 里一个 node 的一次 LLM 调用。
- **Minimal effective context** = 让模型完成当前 node 任务的最小上下文。
- 长流程 Agent 跑 30 个 node，如果每个 node 都把全量历史塞进去，token 成本是线性叠加；如果做好上下文工程，每个 node 只看 `script_spec` + 当前 shot，成本是常数。

### 1.1 ArtArch.AI 的"不做上下文工程"是什么样

一次完整视频创作的工作流：

```
intent_classify (1 LLM call)
  → script_draft (1)
  → script_critic + refine (2)
  → storyboard_subgraph (5-8 内部 calls)
  → shot_generation × 6-12 镜 (6-12 calls)
  → music_pick (1)
  → assembly_validate (1)
  → 平均 ~25 次 LLM 调用 / 创作
```

不做任何上下文工程时（每个 node 都拿全 state）：

| 阶段 | input token | 备注 |
|---|---|---|
| script_draft | 1.5K | 起步 |
| storyboard | 8K | + script_spec + messages |
| shot_3 | 18K | + storyboard + 前 2 镜全文 |
| shot_8 | 42K | + 前 7 镜全文 + messages |
| music | 55K | + 所有 shot 全文 |
| **单次创作总成本** | **~$0.40-0.80** | ERNIE 4.0 / GPT-4o 价位 |

做了 Write/Select/Compress/Isolate 后：

| 阶段 | input token | 降幅 |
|---|---|---|
| shot_3 | 1.2K | -93% |
| shot_8 | 1.4K | -97%（线性 → 常数） |
| music | 0.6K | -99% |
| **单次创作总成本** | **~$0.05-0.12** | **省 70-85%** |

> 这就是为什么 Claude Code 团队在 [Effective context engineering](https://www.anthropic.com/news/effective-context-engineering-for-ai-agents) 里把上下文工程称为 "the new prompt engineering"——它不是优化技巧，是上线门槛。

### 1.2 Claude Code 的视角

Claude Code 处理同样的问题，但**形态完全不同**：它没有 LangGraph 的 StateGraph，每个对话就是一个无限增长的 conversation；用户随时可能 `Cmd+K` 切换主题；可能用 `Read` 打开几百 MB 的代码库；可能让 Claude 跑 30 分钟的后台任务。

它的做法是把上下文工程"原始化"：

| 概念 | LangGraph 形态 | Claude Code 形态 |
|---|---|---|
| Write（外置） | state 存 ref + 外部 store | **文件系统**是 memory，conversation 只挂 path |
| Select | `prompt_view(state)` 函数 | `Read(file, offset, limit)`、Skills 按需加载 |
| Compress | reducer + summarizer node | **自动压缩**（context approaches limit 时） + CLAUDE.md 不变前缀 |
| Isolate | sub-graph + output_schema | **Task tool** 派生 subagent，subagent 冷启动 + 单字符串返回 |
| —— | —— | **TodoWrite**（独家）：结构化任务列表代替部分 conversation history |
| —— | —— | **System Reminders**（独家）：turn-local 状态广播，不进 conversation history |

后面四节会成对展开（先 ArtArch 实战，再 Claude Code 对照），最后三节是 Claude Code 独有的两个高阶模式 + 一个综合 checklist。

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

### 2.1 ArtArch.AI 实战：三层存储 + Ref 协议

ArtArch.AI 实际产出的资产有三类：

1. **文本类**（剧本 / 分镜描述 / shot prompt）：~300-2K 字 / 条，**走 PG 大对象表**。
2. **二进制类**（生成的图片 / 视频 / 音频）：MB 级，**走 S3**。
3. **embedding / 检索结果**：~4-8KB / 条，**走 Redis** 热缓存。

state 里只挂这三种 ref 的元数据：

```python
from typing import Annotated, TypedDict, Literal
from dataclasses import dataclass
from langgraph.graph.message import add_messages

@dataclass
class AssetRef:
    """统一的资产引用协议。"""
    asset_id: str                                            # uuid
    kind: Literal["text", "image", "video", "audio", "embedding"]
    storage: Literal["s3", "pg", "redis"]                    # 后端类型
    storage_key: str                                          # bucket+key 或 row_id
    content_hash: str                                         # 32 位 hash，幂等 + cache key
    size_bytes: int
    summary: str                                              # ≤ 100 字摘要，给 select view 用
    metadata: dict = None                                     # 生成参数等


@dataclass
class ShotRef(AssetRef):
    shot_index: int = 0
    status: Literal["draft", "approved", "rendered"] = "draft"
    style_anchor: str = ""                                    # cinematic / anime / ...


class AgentGraphState(TypedDict):
    session_id: str
    user_id: str
    current_stage: str
    messages: Annotated[list, add_messages]

    # ❌ 反例
    # script_full_text: str            # 2K 字本应走 PG
    # storyboard: list[dict]           # 12 条 × 300 字 全部入 state

    # ✅ 正解：只挂 ref + 全局必需的小字段
    script_ref: AssetRef | None
    storyboard_refs: list[AssetRef]
    shot_refs: list[ShotRef]
    music_ref: AssetRef | None

    # 全局必需 + 小（≤ 1KB）→ 可以直接进 state
    script_spec: dict                  # 强类型 JSON, ~500 字段总览
    style_card: dict                   # 全局风格卡，~400 token
    confirmed_choices: dict            # 结构化已确认决策
    history_summary: str | None
```

**Asset Store 的抽象层**（一行也不能省）：

```python
class AssetStore:
    """统一访问 PG / S3 / Redis，让 node 写 ref 时不感知后端。"""

    async def put(self, content: bytes | str, kind: str, *, summary: str = "",
                  metadata: dict = None) -> AssetRef:
        h = hashlib.sha256(content.encode() if isinstance(content, str) else content).hexdigest()[:32]
        # 幂等：同 hash 直接复用
        if (existing := await self._lookup_by_hash(h)):
            return existing
        if kind == "text" and len(content) < 16_000:
            row_id = await pg.insert("assets_text", content=content, hash=h)
            backend, key = "pg", row_id
        elif kind in ("image", "video", "audio"):
            key = f"artarch/{kind}/{h}.bin"
            await s3.put_object(Bucket="artarch", Key=key, Body=content)
            backend = "s3"
        else:
            await redis.setex(f"asset:{h}", 86400, content)
            backend, key = "redis", h
        return AssetRef(
            asset_id=str(uuid4()), kind=kind, storage=backend, storage_key=key,
            content_hash=h, size_bytes=len(content), summary=summary[:100],
            metadata=metadata or {},
        )

    async def get(self, ref: AssetRef) -> bytes | str:
        if ref.storage == "pg":
            return await pg.fetch_one("SELECT content FROM assets_text WHERE id=$1", ref.storage_key)
        if ref.storage == "s3":
            return (await s3.get_object(Bucket="artarch", Key=ref.storage_key))["Body"].read()
        return await redis.get(f"asset:{ref.storage_key}")

    async def batch_get(self, refs: list[AssetRef]) -> list:
        # 同后端的 ref 走 batch API
        groups = defaultdict(list)
        for r in refs:
            groups[r.storage].append(r)
        ...  # 略
```

**实测数字**：

| 指标 | 直接挂内容 | 改成 ref 后 |
|---|---|---|
| state size（30 轮对话后） | ~420 KB | ~14 KB（-97%） |
| checkpoint 写入 P99 | 320 ms | 18 ms |
| 单 session 全程 checkpoint 总量 | 8-12 MB | 280-400 KB |
| Postgres `state` jsonb 字段最大值 | 多次顶到 8MB | 稳定 < 64KB |

**幂等设计的额外收益**：因为 ref 用 content_hash 做去重，同一段 script 改动 5 轮但实质相同时只存一份，**节省 65% 存储**。

**生产 checklist**：

- [ ] state schema review CI 强制：禁止 `bytes` / `list[bytes]` / `list[dict]`（除非 dict 是强类型 ref）。
- [ ] checkpoint size 监控：单条 > 32KB 告警，超 128KB 阻断。
- [ ] AssetStore 写入异步重试 + DLQ：写 S3 失败不能阻塞 graph 推进。
- [ ] PG `assets_text` 表按 `created_at` 月分区 + TTL 删除。

### 2.2 Claude Code 是怎么做的

Claude Code **没有 state，文件系统就是 memory**。这个设计哲学激进但有效：

```text
ArtArch.AI:                  Claude Code:
─────────────────────────    ───────────────────────────
state["script_ref"]          conversation: "我已经把分镜写到 /tmp/storyboard.md"
  ↓ AssetStore.get(ref)       ↓ 下次需要时 → Read("/tmp/storyboard.md", offset=0, limit=100)
script_text                  file content
```

具体做法：

1. **大产出直接落盘**：Claude Code 让模型把代码、设计文档、报告写到 `Write` tool 的目标文件——`conversation history` 里只留 "已写入 src/foo.py" 这种 12 字符的反馈。
2. **按需 Read with offset/limit**：要看的时候 `Read(file_path, offset=120, limit=40)` 只读关键 40 行，不读全文。
3. **路径就是 ref**：`src/foo.py:120` 在对话里到处出现，等价于 ArtArch 的 `ShotRef.storage_key`。
4. **永久持久化**：`~/.claude/projects/<proj>/memory/` 跨 session 保留——比 LangGraph checkpoint 更激进，是**永久外置 memory**（详见 §9）。

**关键对照**：

| 维度 | ArtArch.AI | Claude Code |
|---|---|---|
| 外部存储 | S3 / PG / Redis | 本地文件系统 |
| Ref 形态 | 强类型 `AssetRef` dataclass | 字符串路径 + 行号 |
| 幂等 | content_hash | 文件路径天然唯一 |
| 持久化粒度 | session（checkpoint） | 永久（直到用户删） |
| 取回机制 | `AssetStore.get(ref)` 后端路由 | `Read(path, offset, limit)` 单接口 |
| 适合 | 跨 user / 强 schema / 高并发 | 单用户 / 强终端 / 长周期任务 |

Anthropic 在 [Effective context engineering](https://www.anthropic.com/news/effective-context-engineering-for-ai-agents) 里管这种叫 **"using files as memory"**——它的极致是 [Claude Sonnet 的 memory tool](https://docs.anthropic.com/en/docs/build-with-claude/memory)，模型自己决定写哪些文件。**ArtArch.AI 的 AssetStore 是同一思想的多租户版**。

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

### 3.1 ArtArch.AI 实战：prompt_view 是 state 的 SQL 视图

**核心思想**：把 LangGraph 的 state 当成"数据库"，每个 node 自己定义"视图"——SQL 视图思想搬到 agent。视图函数必须满足：

1. **纯函数**：`(state, ctx) -> dict`，不修改 state，方便单元测试。
2. **声明式**：函数体里能立刻看出"这个 node 拿了哪些字段"。
3. **可审计**：出问题能立刻定位"是哪个 view 漏了字段或多塞了字段"。

```python
from typing import Protocol

class PromptView(Protocol):
    """所有 node 的 view 函数协议。"""
    async def __call__(self, state: AgentGraphState, **ctx) -> dict: ...


# ─────────────────────────── view 1: 分镜 ───────────────────────────
async def storyboard_view(state: AgentGraphState, **_) -> dict:
    """storyboard 阶段需要：剧本 + 风格 + 全局规格。不需要历史消息、不需要单 shot 内容。"""
    script = await asset_store.get(state["script_ref"])     # lazy load
    return {
        "script_text": script,
        "style_card": state["style_card"],
        "shot_count_target": state["script_spec"]["shot_count"],
        "aspect_ratio": state["confirmed_choices"]["aspect_ratio"],
        "language": state["confirmed_choices"].get("language", "zh-CN"),
    }


# ─────────────────────────── view 2: 单 shot 生成 ──────────────────
async def shot_generation_view(state: AgentGraphState, shot_index: int) -> dict:
    """单 shot 只需要：当前镜分镜 + 风格 + 上一镜摘要（保连贯）。不传完整 storyboard。"""
    sb_ref = state["storyboard_refs"][shot_index]
    sb_text = await asset_store.get(sb_ref)
    prev_summary = (
        state["shot_refs"][shot_index - 1].summary
        if shot_index > 0 else None
    )
    return {
        "shot_index": shot_index,
        "shot_brief": sb_text,                                # ~200 字
        "style_card": state["style_card"],
        "aspect_ratio": state["confirmed_choices"]["aspect_ratio"],
        "previous_shot_summary": prev_summary,                # 50 字 lookback
        # ❌ 不传：messages / 其他 shot 全文 / script_full_text / planner_logs
    }


# ─────────────────────────── view 3: 配乐 ──────────────────────────
async def music_view(state: AgentGraphState, **_) -> dict:
    """配乐阶段连 shot 内容都不要——只看整体 mood + 时长 + 平台。"""
    duration = sum(r.metadata.get("duration_sec", 0) for r in state["shot_refs"])
    return {
        "mood": state["confirmed_choices"].get("mood", "neutral"),
        "duration_sec": duration,
        "language": state["confirmed_choices"].get("language", "zh-CN"),
        "target_platform": state["confirmed_choices"].get("target_platform"),
        "rejected_tracks": state["confirmed_choices"].get("rejected_assets", []),
    }


# ─────────────────────────── view 4: 装配校验 ─────────────────────
async def assembly_validate_view(state: AgentGraphState, **_) -> dict:
    """装配校验只看 shot ref 元数据 + 音轨 ref，不取原始素材。"""
    return {
        "shot_summaries": [
            {"i": r.shot_index, "status": r.status, "duration": r.metadata.get("duration_sec")}
            for r in state["shot_refs"]
        ],
        "music_ref_summary": state["music_ref"].summary if state["music_ref"] else None,
        "aspect_ratio": state["confirmed_choices"]["aspect_ratio"],
    }


# ─────────────────────────── 在 node 里用 view ────────────────────
async def shot_generation_node(state: AgentGraphState):
    shot_index = state["current_shot_index"]
    view = await shot_generation_view(state, shot_index=shot_index)
    response = await llm.generate(prompt=SHOT_PROMPT, **view)
    new_ref = await asset_store.put(response.image_bytes, kind="image",
                                     summary=response.summary)
    return {"shot_refs": [new_ref]}                          # reducer add 进去
```

**面试加分细节**：

1. **previous_shot_summary 而不是 full**：要保证镜头视觉连贯（人物服装/光线），但完整 prompt 没必要。50 字的"主角穿蓝色外套，黄昏侧光，城市天台远景"够了。**单次 shot 的 input token 从 ~6K 降到 ~1.2K**。
2. **lazy load + summary**：`AssetRef.summary` 是"廉价侧道"——当你只需要知道 "上一镜大概什么样" 而不需要完整 prompt 时，summary 就够。lazy load 只在真正需要 raw content 时触发。
3. **view 矩阵可审计**：N 个 node × M 个字段的二维表，出 bug 时一眼能看出"shot_8 怎么吃了 messages"——而隐式截断（`messages[-4:]`）一旦坏了无从下手。
4. **测试性**：每个 view 是纯函数，单元测试 mock state dict 就能跑，不用拉起整个 graph。

**Lost in the Middle 防御**：[Liu et al. 2023](https://arxiv.org/abs/2307.03172) 指出 LLM 对长上下文中间段的注意力会衰减。我们的 view 平均 input 控制在 1-2K token，**完全规避了 LITM 问题**——这是上下文工程的隐性收益。

### 3.2 Claude Code 是怎么做的

Claude Code 没有 LangGraph 的 state schema，但**它的 Select 做得更彻底**——通过四个机制：

**机制 1：Skills 按需加载（Just-in-time skill load）**

```text
对话开始：只挂载 skill 名字 + 一行 description（数百字总开销）
用户说"帮我改 CLAUDE.md"
  ↓ Claude 决定调用 Skill("update-config")
  ↓ 这时才把 update-config 完整的几千字说明文档加载进上下文
```

对应 ArtArch 的 `view` 概念——**默认不进，按需进**。在 Anthropic [Effective context engineering](https://www.anthropic.com/news/effective-context-engineering-for-ai-agents) 里这叫 **"progressive disclosure"**。

**机制 2：Tool 的 description vs schema 分离**

```python
# Claude Code 看到的（精简）：
[Read]: 读取文件，必须用绝对路径。
[Edit]: 替换文件内容...
[Bash]: 执行 shell 命令...

# 调用时才注入完整 JSON Schema 给 model 填参数
```

工具列表始终在 context（不变 → 走 prompt cache），但每个工具的复杂参数 schema 是**调用时模型自己取**。

**机制 3：Read with offset/limit**

```python
# 等价于 ArtArch 的 prompt_view 里只取 50 字 summary
Read(file_path="/repo/long_file.py", offset=120, limit=30)
# → 只取第 120-150 行，整个 3000 行的文件不进 context
```

**机制 4：Grep 输出截断 + Bash 输出 head/tail**

Bash 工具默认对长输出截断、Grep 默认 head_limit——这是**强制的 Select**，不给模型"贪心读全部"的机会。

**对比一句**：

| 维度 | ArtArch (LangGraph) | Claude Code |
|---|---|---|
| Select 触发 | 进 node 时调用 view 函数 | 模型每次工具调用时由 LLM 自己决定 offset/limit |
| Select 单元 | 字段 | 文件 / 行号 / Skill |
| 强制 vs 自主 | 强制（view 写死） | 自主（model 自己 select） |
| 失败模式 | view 漏字段 → bug 易定位 | model 截太多 → "我没看到那段代码" |

**借鉴启示**：ArtArch.AI 完全可以加一个 "skill-style 工具按需加载" 模块——比如把 "查询素材库" 做成 tool，只在用户提到 "换个音乐" 时挂载。目前是写死在 graph 里，未来上 multi-tenant + 多业务线时这套会更灵活。

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

### 4.1 ArtArch.AI 实战：双路压缩 + 决策保护

完整 compress 节点（生产代码）：

```python
from pydantic import BaseModel, Field

class ConfirmedChoices(BaseModel):
    """单一真相源——这里的字段永远不会被自然语言摘要丢失。"""
    style: str | None = None
    aspect_ratio: str | None = None
    mood: str | None = None
    language: str | None = None
    target_platform: str | None = None
    rejected_assets: list[str] = Field(default_factory=list)
    confirmed_at: dict[str, str] = Field(default_factory=dict)

    def merge(self, other: "ConfirmedChoices", conflict: str = "keep_old") -> "ConfirmedChoices":
        """保护已确认的决策不被摘要覆盖。"""
        merged = self.model_dump()
        for field, new_val in other.model_dump().items():
            if new_val is None or (isinstance(new_val, list) and not new_val):
                continue
            old_val = merged.get(field)
            if old_val and conflict == "keep_old":
                # 已经确认过的字段不让 summarizer 改
                if field == "rejected_assets":
                    merged[field] = list({*old_val, *new_val})  # 拒绝列表是 union
                continue
            merged[field] = new_val
            if isinstance(new_val, str):
                merged["confirmed_at"][field] = datetime.utcnow().isoformat()
        return ConfirmedChoices(**merged)


class DecisionSummary(BaseModel):
    """LLM 摘要的输出 schema：同时输出可逆决策和语气文字。"""
    new_confirmed_choices: ConfirmedChoices
    flavor_note: str = Field(..., max_length=200,
                              description="≤200 字的语气摘要，记用户口味、风格偏好、节奏感")
    open_questions: list[str] = Field(default_factory=list,
                                       description="用户还没明确的疑问点")


COMPRESS_PROMPT = """\
你正在压缩一段视频创作助手的多轮对话历史。

任务：把以下消息压缩成两类内容：
1. 【结构化决策】：用户明确确认过的字段（风格 / 画幅 / 配乐 mood / 拒绝的素材 ID 等），输出到 new_confirmed_choices。
2. 【语气摘要】：用户的偏好、口味、节奏感受等模糊但有用的信号，输出到 flavor_note。

严格要求：
- 只把"用户明确说 yes 的"放进 new_confirmed_choices；含糊的（"也许"、"再看看"）只放进 flavor_note。
- flavor_note 不超过 200 字，写得像一段读者笔记，不要列表。
- open_questions 写 1-3 条用户尚未确认但你判断需要确认的关键问题。

对话历史：
{messages}
"""


async def maybe_compress(state: AgentGraphState) -> dict:
    msgs = state["messages"]
    total_tokens = sum(estimate_tokens(m) for m in msgs)

    if total_tokens < 8_000 and len(msgs) < 30:
        return {}                                            # 不用压

    keep_recent = msgs[-4:]
    older = msgs[:-4]

    summary: DecisionSummary = await llm.structured_output(
        DecisionSummary,
        prompt=COMPRESS_PROMPT.format(messages=render_messages(older)),
    )

    existing = ConfirmedChoices(**state.get("confirmed_choices", {}))
    merged = existing.merge(summary.new_confirmed_choices, conflict="keep_old")

    prev_flavor = state.get("history_summary") or ""
    new_flavor = (prev_flavor + "\n" + summary.flavor_note).strip()[-1500:]  # 滚动窗口

    return {
        "messages": keep_recent,
        "confirmed_choices": merged.model_dump(),
        "history_summary": new_flavor,
        "open_questions": summary.open_questions,
    }


# graph 里挂为入口前置 node
graph.add_node("maybe_compress", maybe_compress)
graph.add_edge("ingest_turn", "maybe_compress")
graph.add_edge("maybe_compress", "route_by_stage")
```

**五个落地坑（都是上线后踩出来的）**：

1. **`conflict="keep_old"`**：confirmed_choices 一旦确认就不允许被摘要覆盖。早期版本没加这个保护，第 35 轮摘要把"用户已确认 cinematic"覆盖成 None，下轮重新问，用户怒。
2. **rejected_assets 用 union**：拒绝清单是单调增长的（不能被忘），其他字段是覆盖。这种"字段语义不统一"的合并逻辑必须显式写出来。
3. **keep_recent=4 是 A/B 出来的**：在 {1, 2, 4, 8} 四档实测，4 是质量/成本甜点。1 时会丢"刚才那个角度"；8 时压缩收益消失。
4. **flavor_note 必须滚动窗口**：自由文本永远在长，必须硬限制 1500 字截尾覆盖。
5. **触发条件 OR 不是 AND**：`token > 8K OR turn > 30`——token 不爆但轮次多说明话题切换频繁，结构化决策依然有价值。

**实测数字**：

| 指标 | 不做 compress | 做了 compress |
|---|---|---|
| 50 轮对话单次 input | ~80K token | ~22K（-72%） |
| 单次创作总成本 | ~$0.40 | ~$0.12（-70%） |
| 决策一致性（A/B 测：用户中途换风格的二次确认率） | 28% 反悔 | 4% 反悔 |

最后那个指标是 confirmed_choices 保护的直接证据——**摘要式压缩会让模型反复确认已经做过的决策**，结构化决策不会。

### 4.2 Claude Code 是怎么做的

Claude Code 的 Compress **完全不同**——它没有 confirmed_choices schema，而是用三个机制叠加：

**机制 1：Auto-compaction（自动压缩）**

Claude Code 的 system prompt 里有这一句：

> The system will automatically compress prior messages in your conversation as it approaches context limits. This means your conversation with the user is not limited by the context window.

具体做法（推测，结合 Anthropic 文档）：

- 当 context 接近上限（200K → ~80% = 160K），触发自动总结。
- 早期 turn 被 LLM 总结成一段 markdown 摘要，原文删除。
- 摘要 + 最近 K 轮原文 + 当前 turn = 新 context。

这个**对应 ArtArch 的 `maybe_compress`**，但**没有结构化决策保护**——所有信息一视同仁地被压缩。

**为什么 Claude Code 敢这么做**？因为它有两个"逃生通道"：

- **文件系统**（§2.2）：重要内容已经落盘，压缩丢了也能 `Read` 回来。
- **CLAUDE.md / Memory**（§9）：跨 session 的不变前缀始终注入。

**机制 2：CLAUDE.md / 不变前缀**

每个项目的 CLAUDE.md 在每次对话开头自动注入（通过 `<system-reminder>`）。它是**永不被压缩的"宪法"**——项目约定、风格、禁忌都写在这里。等价于 ArtArch 的 `style_card` 永远在 state 里不进压缩。

```text
# 在 Claude Code 对话里看到的：
<system-reminder>
Contents of /Users/foo/proj/CLAUDE.md:
- 用 4 空格缩进
- 测试覆盖率 > 80%
- 不要直接 commit 到 main
</system-reminder>
```

**机制 3：TodoWrite—— 任务列表替代部分 conversation**

Claude Code 的 `TodoWrite` 工具维护一个结构化任务列表：

```text
TodoWrite:
  [✓] 读 src/auth/login.py
  [✓] 找到 hardcoded JWT secret
  [→] 把 secret 改成 env var（in_progress）
  [ ] 加单元测试
```

这个列表**作为状态被持续可见**，比 conversation 历史更紧凑。当 conversation 压缩时，TodoWrite 的当前状态依然可见——它是 Claude Code 版的 `confirmed_choices`，**只是更动态、更面向任务进度**。

**对照表**：

| Compress 维度 | ArtArch.AI | Claude Code |
|---|---|---|
| 触发条件 | token > 8K OR turn > 30 | 接近 context 上限 |
| 决策保护 | `ConfirmedChoices` Pydantic schema | TodoWrite 任务状态 + CLAUDE.md |
| 语气保护 | `history_summary` 滚动窗口 | LLM 自由摘要 |
| 反悔率（已确认决策被丢） | 4% | 不可控（取决于摘要 LLM） |
| 适合 | 强 schema 业务（视频/订单/工单） | 通用编程对话 |

**借鉴启示**：ArtArch.AI 可以新增一个"任务列表 channel"——当前哪些 shot 已经渲染、哪些待确认、哪些被否，用 TodoWrite 风格的结构化列表存在 state 里。这个列表**永远完整可见**，不进摘要，相当于把"任务进度"从对话历史里抽离出来——和 confirmed_choices 一样，是 Compress 的"逃生通道"。

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

### 5.1 ArtArch.AI 实战：storyboard sub-graph 完整骨架

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated
import operator


class StoryboardGraphState(TypedDict):
    """子图自己的"工作台"——主图看不到这些字段。"""
    script_text: str
    style_card: dict
    duration_target: int
    shot_count_target: int

    drafts: Annotated[list[dict], operator.add]              # 历次草稿，append-only
    critic_logs: Annotated[list[dict], operator.add]
    revise_count: int

    final_shots: list[dict] | None
    needs_revise: bool


async def draft_node(state: StoryboardGraphState):
    """初稿：根据 script + style 生成 N 条分镜。"""
    draft = await llm.structured_output(
        StoryboardDraft,
        prompt=DRAFT_PROMPT,
        script=state["script_text"],
        style=state["style_card"],
        shot_count=state["shot_count_target"],
    )
    return {"drafts": [draft.model_dump()]}


async def critic_node(state: StoryboardGraphState):
    """评审：节奏 / 视觉连贯 / 时长是否 OK。"""
    last_draft = state["drafts"][-1]
    critique = await llm.structured_output(
        StoryboardCritique,
        prompt=CRITIC_PROMPT,
        draft=last_draft,
        duration_target=state["duration_target"],
    )
    return {
        "critic_logs": [critique.model_dump()],
        "needs_revise": critique.has_issues,
    }


async def refine_node(state: StoryboardGraphState):
    last_draft = state["drafts"][-1]
    last_critique = state["critic_logs"][-1]
    revised = await llm.structured_output(
        StoryboardDraft,
        prompt=REFINE_PROMPT,
        draft=last_draft,
        critique=last_critique,
    )
    return {
        "drafts": [revised.model_dump()],
        "revise_count": state["revise_count"] + 1,
    }


def should_revise(state: StoryboardGraphState) -> str:
    if not state["needs_revise"]:
        return "finalize"
    if state["revise_count"] >= 3:                          # 兜底防死循环
        return "finalize"
    return "refine"


async def finalize_node(state: StoryboardGraphState):
    return {"final_shots": state["drafts"][-1]["shots"]}


storyboard_subgraph = (
    StateGraph(StoryboardGraphState)
    .add_node("draft", draft_node)
    .add_node("critic", critic_node)
    .add_node("refine", refine_node)
    .add_node("finalize", finalize_node)
    .set_entry_point("draft")
    .add_edge("draft", "critic")
    .add_conditional_edges("critic", should_revise, {
        "refine": "refine",
        "finalize": "finalize",
    })
    .add_edge("refine", "critic")
    .add_edge("finalize", END)
    .compile()
)


# ─────────────────────────── 主图里挂载子图 ─────────────────────
async def storyboard_node(state: AgentGraphState):
    sub_input = StoryboardGraphState(
        script_text=await asset_store.get(state["script_ref"]),
        style_card=state["style_card"],
        duration_target=state["script_spec"]["duration_sec"],
        shot_count_target=state["script_spec"]["shot_count"],
        drafts=[], critic_logs=[], revise_count=0,
        final_shots=None, needs_revise=True,
    )
    sub_result = await storyboard_subgraph.ainvoke(sub_input)

    # 把子图产出的 12 条 shot 描述写到 AssetStore，得到 ref 列表
    sb_refs = [
        await asset_store.put(json.dumps(s), kind="text", summary=s["one_line_summary"])
        for s in sub_result["final_shots"]
    ]

    # 只回写"结果引用 + 一条对话消息"——子图内部的 drafts / critic_logs 全丢
    return {
        "storyboard_refs": sb_refs,
        "messages": [AIMessage(content=f"已完成分镜（{len(sb_refs)} 镜）")],
    }
```

**关键设计点**：

1. **子图自己的 State 完全独立**：`StoryboardGraphState` 和 `AgentGraphState` 没有任何字段重叠——子图改了什么主图永远看不到。
2. **只通过 return 接口面回写**：子图跑了 5-8 次 LLM、产出 5-10 个 drafts + critic logs，主图最终只收 `storyboard_refs` 和 1 条 message。
3. **子图的失败不污染主图**：如果 refine 死循环到 revise_count=3 仍 needs_revise，finalize 兜底返回最后一稿——主图不知道子图挣扎过。
4. **独立 checkpoint**：子图可以挂自己的 checkpointer，便于回放和单元测试。

**实测**：

| 指标 | 子图内部 | 回流主图 |
|---|---|---|
| LLM 调用次数 | 5-8 次 | 0 次（只有最后一次写 ref） |
| 累计 token | ~20K input + 15K output | ~50 token（一条 AI message） |
| state 增量 | StoryboardGraphState（~10KB） | 12 个 AssetRef（~3KB） |

如果不做 isolate，这 20K token 全部进 messages，30 轮对话就是 600K——根本跑不动。

### 5.2 Claude Code 是怎么做的：Task tool + 冷启动 subagent

Claude Code 的 Isolate **比 LangGraph 更激进**——subagent 是 **完全冷启动**的，不继承父对话任何上下文，只读 prompt。

```python
# Claude Code 的 Task tool 调用：
Task(
    subagent_type="Explore",                              # 专用 agent 类型
    description="找到所有调用 deprecated API 的位置",
    prompt="""
    Search the codebase for usages of the deprecated `OldClient` class.
    Context: we're migrating to NewClient in v3.0. The old class is in src/legacy/.
    Report: a list of file:line locations + a one-line description per call site.
    Under 200 words.
    """,
)
```

观察四个特点：

1. **subagent 启动时 context = 空**——不读父对话历史，只读传入的 prompt。
2. **subagent 内部跑 N 次工具调用**（Read、Grep、Bash），消耗自己的 context window。
3. **subagent 只能返回 1 个字符串**——所有内部探索浓缩成最终一段文字回传父对话。
4. **subagent 类型决定权限**——`Explore` 是只读的，没有 Edit/Write；这是 LangGraph 子图的"类型化版本"。

**核心对照**：

| 维度 | ArtArch 子图 | Claude Code Task |
|---|---|---|
| 启动状态 | 父图传 `sub_input` 字段 | 完全冷启动，只读 prompt |
| 内部状态共享 | 通过 sub_input 字段 | 不共享，prompt 自包含 |
| 输出接口面 | dict（schema 化） | 单字符串 |
| 失败传播 | 子图返回 needs_revise=False 兜底 | subagent 总返回字符串，由调用方判断质量 |
| 适合 | 任务边界清晰、需要状态接续 | 任务边界明确、能写完整 prompt |

**Claude Code 的"冷启动哲学"在 Anthropic 内部叫 ["context-isolated subagents"](https://www.anthropic.com/engineering/building-effective-agents)**。它的好处是：

- 父对话的"杂念"不会污染 subagent 的专注度。
- subagent 可以并行（Anthropic blog 里反复强调的 fan-out）。
- 失败可以重启而不需要回滚父对话状态。

**借鉴启示**：ArtArch.AI 的 storyboard 子图目前是"暖启动"——传了 script_text 等字段。如果未来要做"批量生成 10 个候选分镜"，可以用 Claude Code 的冷启动模式 + 并发：10 个子图独立 invoke，每个用同样的 script 但不同 seed，最后由 critic 评出最优——这是 [Anthropic Orchestrator-workers pattern](https://www.anthropic.com/engineering/building-effective-agents) 的直接套用。

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

### 6.1 ArtArch.AI 实战：四级 cache_control 标注

Anthropic API 的 prompt caching 是**显式标注**——你必须告诉 SDK 哪几段是"稳定前缀"。ArtArch.AI 的 prompt 拆四层标注：

```python
import anthropic

client = anthropic.AsyncAnthropic()

async def call_shot_generator(view: dict) -> str:
    """单 shot 生成调用，prompt 拆四层，前三层走 cache。"""
    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1500,
        system=[
            # 第 1 层：永久不变的 system prompt
            {
                "type": "text",
                "text": GLOBAL_SYSTEM_PROMPT,                 # ~2K token
                "cache_control": {"type": "ephemeral"},
            },
            # 第 2 层：tool definitions / output schema
            {
                "type": "text",
                "text": SHOT_TOOL_SCHEMA,                     # ~1K token
                "cache_control": {"type": "ephemeral"},
            },
            # 第 3 层：本会话的 style_card + confirmed_choices（半变）
            {
                "type": "text",
                "text": render_session_constants(view["style_card"],
                                                  view["aspect_ratio"]),
                "cache_control": {"type": "ephemeral"},
            },
        ],
        messages=[
            # 第 4 层：每次调用都变（shot_brief + previous_shot_summary）
            {
                "role": "user",
                "content": render_shot_request(
                    shot_index=view["shot_index"],
                    shot_brief=view["shot_brief"],
                    previous_summary=view["previous_shot_summary"],
                ),
            }
        ],
    )
    return response.content[0].text
```

**关键**：

- **cache_control 最多 4 个 breakpoint**——所以拆 4 层是 API 上限。
- **同一会话 5 分钟内 hit 率 >85%**：第 4 镜调用时，前 3 层都从 cache 读，只有第 4 层（"shot_brief + previous_summary"）走完整 input pricing。
- **shot N 之间能复用**：因为 shot 1-12 的前 3 层完全一致，所以从 shot 2 开始全是 cache hit。

**实测节省**：

| 指标 | 不开 cache | 开 4 层 cache |
|---|---|---|
| 单 shot input cost | $0.012 | $0.003（**-75%**） |
| 单次创作总成本 | ~$0.12 | ~$0.04（**-67%**） |
| TTFB（首 token 到达） | ~600ms | ~250ms |

Anthropic 的 [Prompt caching 文档](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) 写得很细，**生产 RAG/Agent 必读**。

### 6.2 Claude Code 是怎么做的：极致前缀稳定性

Claude Code 的 system prompt 是个**巨大的静态前缀**（包含 tool list、CLAUDE.md、能力描述、安全约束），每次对话开头几乎不变。再加上：

- **system_reminder 也走 cache**：CLAUDE.md / 项目文件目录 等定期注入的 reminder 都是稳定前缀。
- **Skill description 走 cache**：所有可用 skill 的名字 + 一行描述始终在 context，不变 → cache hit。
- **每条 user turn 才是 cache miss 起点**——这是 Claude Code 单 turn 成本远低于裸 API 调用的关键。

观察 Claude Code 在长 session 里的成本曲线：第 1 turn 比较贵（cache prefill），第 2 turn 起几乎线性增长——这正是 cache hit 占主导的特征。

**借鉴启示**：ArtArch.AI 当前 cache 命中率 85%，可以进一步把 **few-shot examples** 也放到 system 层（第 2 层 schema 之后），把命中率推到 90%+。Anthropic 官方 [Cookbook](https://github.com/anthropics/anthropic-cookbook/tree/main/misc) 里有 `prompt_caching.ipynb` 示例。

---

## 6.3 Anthropic 官方"上下文工程"四类技术对照

[Anthropic Effective context engineering](https://www.anthropic.com/news/effective-context-engineering-for-ai-agents) 把上下文工程拆成四类——和 LangChain 的 Write/Select/Compress/Isolate 不完全重合，但互补：

| Anthropic 分类 | LangChain 分类 | ArtArch.AI 落地 | Claude Code 落地 |
|---|---|---|---|
| **Tool curation** | Select | view 函数 | Skills 按需加载 |
| **Compaction** | Compress（可逆） | AssetRef + lazy load | Files as memory |
| **Summarization** | Compress（有损） | history_summary | Auto-compaction |
| **Structured Note-Taking** | Write + Compress | confirmed_choices + TodoWrite-style 列表 | TodoWrite + memory files |

两个体系最终指向同一件事：**让每次 LLM 调用看到的上下文，是当前任务能跑成的最小集**。

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

### 8.1 Claude Code 的对照：transcript = jsonl 文件

Claude Code 完全没有 checkpoint 概念——它的"持久化"就是把整个 conversation 写成 jsonl 文件存在本地。

```text
~/.claude/projects/<project-hash>/sessions/<session-id>.jsonl
  ├─ 每行一个 message（user / assistant / tool_use / tool_result）
  ├─ 重启时全量 replay 进 context
  └─ 不做 diff、不做 LRU、不做 GC（除非用户手动 /clear）
```

对比：

| 维度 | ArtArch (LangGraph) | Claude Code |
|---|---|---|
| 存储 | Postgres jsonb | 本地 jsonl |
| 单位 | state diff（reducer 合并） | 完整 message append |
| 多用户 | thread_id 路由 | 单用户单 session |
| 恢复 | `astream(thread_id=...)` 从最近 checkpoint | replay 整个 jsonl |
| 数据量 | 极小（KB 级，因为 ref） | 大（MB 级，因为完整 conversation） |
| 适合 | 多租户、并发、断线恢复 | 单机长任务、本地调试、回放 |

**借鉴启示**：ArtArch.AI 上线后可以补一个 "可读 transcript 导出"——把 checkpoint 反向渲染成 jsonl，方便 PM 在出问题时不开发库直接看一次创作的全过程。Claude Code 的 jsonl 格式可以直接抄。

---

## 9. Memory & Notes：跨 session 的持久化记忆

这一章 LangGraph 原生没有，但 Claude Code 玩得非常深——这是它"在多个 session 之间保持人格"的关键。

### 9.1 Claude Code 的 memory 系统

`~/.claude/projects/<project-hash>/memory/` 下是一组 markdown 文件：

```text
memory/
  MEMORY.md                    # 索引文件，每行一条 "- [Title](file.md) — hook"
  user_role.md                 # user 类型记忆
  feedback_doc_style.md        # feedback 类型记忆
  reference_atlas_reader.md    # reference 类型记忆
  project_xxx.md               # project 类型记忆
```

每个 memory 文件带 frontmatter：

```markdown
---
name: feedback-doc-style
description: Q&A 长文写作偏好——深扣细节、贴代码、含发散 tip、引用社区大佬
metadata:
  type: feedback
---

用户写复习长文的硬性偏好：必须深扣技术细节，要贴可跑代码示例...

**Why:** 用户多次反馈过简短回答没有用，要的就是细节密度。
**How to apply:** 写技术 Q&A 文档时默认 600+ 行，含 3-5 个代码块，引用 2-3 位社区专家。
```

**MEMORY.md 在每次对话开头被注入 system prompt**，但单个 memory 文件**仅在 Claude 主动 Read 时加载**。这是 Write + Select 的精妙组合：

- Write：长内容外置到文件。
- Select：MEMORY.md 索引常驻 prompt（廉价），detail 文件按需 Read（按用）。

四种记忆类型（Anthropic 官方约定）：

| 类型 | 用途 | 例子 |
|---|---|---|
| **user** | 用户身份、角色、偏好 | "用户是 AI Agent 工程师面试候选人" |
| **feedback** | 用户对 AI 行为的指导 | "Q&A 必须含代码示例" |
| **project** | 当前工作的背景 | "我们在 5/14 之前要交付 RAG 升级" |
| **reference** | 外部资源指针 | "线上指标看 Grafana board X" |

写 memory 是两步：

1. 写文件 `xxx.md`（带 frontmatter）。
2. 往 `MEMORY.md` 加一行索引：`- [Title](xxx.md) — one-line hook`。

**关键约束**（来自 Anthropic 官方）：

- 不写"代码已存在的"事实（git/grep 能查到的）。
- 不写"今天的临时状态"（ephemeral 信息）。
- 写"非显然的偏好、教训、外部知识指针"。

### 9.2 ArtArch.AI 借鉴：per-user style memory

ArtArch.AI 目前 confirmed_choices 是 **session-scoped**——每次新会话从空开始。但很多用户会重复："我跟上次一样的暖色调风格"。可以补一个 **跨 session 的 user-memory** 机制：

```python
class UserMemory(BaseModel):
    """每个 user 一份，跨 session 持久化。"""
    user_id: str
    preferred_styles: list[str] = []                       # 历史 confirmed style 排序
    preferred_moods: list[str] = []
    typical_aspect_ratio: str | None = None
    typical_target_platform: str | None = None
    avoid_assets: list[str] = []                            # 历史拒绝列表
    flavor_profile: str = ""                                # 自然语言偏好画像（< 500 字）
    last_updated: datetime


# 每次会话结束（或定期 cron），把这次的 confirmed_choices append 进 UserMemory
async def append_to_user_memory(user_id: str, session_choices: ConfirmedChoices):
    mem = await user_memory_store.get(user_id) or UserMemory(user_id=user_id, last_updated=datetime.utcnow())
    if session_choices.style:
        mem.preferred_styles = (mem.preferred_styles + [session_choices.style])[-10:]
    if session_choices.mood:
        mem.preferred_moods = (mem.preferred_moods + [session_choices.mood])[-10:]
    mem.avoid_assets = list({*mem.avoid_assets, *session_choices.rejected_assets})[-50:]
    mem.last_updated = datetime.utcnow()
    await user_memory_store.put(user_id, mem)


# 新会话开始时把 UserMemory 注入 system 层（cache 友好）
async def build_system_prompt(user_id: str) -> str:
    mem = await user_memory_store.get(user_id)
    if not mem:
        return GLOBAL_SYSTEM_PROMPT
    return GLOBAL_SYSTEM_PROMPT + "\n\n" + render_user_memory(mem)
```

**Karpathy 的 append-and-review 在这里落地**：

- 单会话内的 `confirmed_choices` = **append-only raw note**（这次会话发生了什么）。
- `UserMemory` = **reviewed structured memory**（多次会话洗出来的稳定画像）。
- 每次 session 结束有个 "review" 步骤，把 raw note 摘成结构化 memory。

**实测假设**（如果接入）：

| 指标 | 不用 user memory | 接入后 |
|---|---|---|
| 老用户首轮"风格确认"次数 | 平均 3 次 | 平均 0.4 次 |
| 用户满意度（端到端） | baseline | +12% |
| 单次创作 token 成本 | baseline | -8% |

引用：Anthropic 的 [Claude Sonnet 4.5 memory tool](https://docs.anthropic.com/en/docs/build-with-claude/memory) 直接把这套抽象成 SDK——模型自己决定写哪些 memory 文件、什么时候 Read。ArtArch.AI 当前还是"我们代码决定写哪些字段"的"硬版"。

---

## 10. TodoWrite 模式：结构化任务列表代替 conversation 历史

这是 Claude Code 一个很容易被忽视但威力极大的模式。

### 10.1 Claude Code 的 TodoWrite

观察 Claude Code 处理"实现一个新功能"的对话：

```
turn 1: 用户 "帮我加个 OAuth 登录"
turn 2: Claude TodoWrite([
          "1. 调研现有 auth 模块 [pending]",
          "2. 设计 OAuth flow [pending]",
          "3. 写代码 [pending]",
          "4. 加测试 [pending]",
          "5. 更新文档 [pending]"
        ])
turn 3: Claude TodoWrite(更新 [1] -> in_progress)
turn 4: Claude Read("src/auth/login.py")
turn 5: Claude TodoWrite(更新 [1] -> completed, [2] -> in_progress)
turn 6: Claude Write("docs/oauth-design.md", ...)
turn 7: Claude TodoWrite(更新 [2] -> completed, [3] -> in_progress)
...
```

**TodoWrite 列表始终可见**（在每次模型调用前注入），相当于一个**永远不被压缩的进度面板**。Conversation 可以被自动压缩，但 TodoWrite 状态完整保留。

**关键性质**：

- **比 conversation 历史紧凑**：5 行 todo > 50 turn 的工具调用 + 输出。
- **强 schema**：每条 todo 有 status（pending/in_progress/completed）、content、activeForm。
- **状态机约束**：永远只有一项 `in_progress`，强制串行 + 强制专注。
- **能成为 final report**：任务结束时整张表就是一份执行报告。

### 10.2 ArtArch.AI 借鉴：CreationTaskList

ArtArch.AI 一次创作有 8-10 个阶段，每个阶段有"待确认 / 已生成 / 已驳回 / 已通过"四种状态。用 TodoWrite 模式抽出来：

```python
from typing import Literal

class CreationTask(BaseModel):
    task_id: str                                            # e.g. "shot_3" / "music"
    stage: str
    content: str                                            # 人话描述
    active_form: str                                        # 进行中时的话术
    status: Literal["pending", "in_progress", "needs_user_input",
                    "completed", "rejected", "regenerating"]
    asset_ref: AssetRef | None = None                        # 已产出的引用
    user_decision_at: datetime | None = None
    reject_reason: str | None = None


class CreationTaskList(BaseModel):
    """每个 session 一份，长期可见，不进 history_summary。"""
    tasks: list[CreationTask]

    @property
    def current_in_progress(self) -> CreationTask | None:
        for t in self.tasks:
            if t.status == "in_progress":
                return t
        return None

    def render_for_prompt(self) -> str:
        lines = ["【创作进度】"]
        for t in self.tasks:
            tick = {"pending": "○", "in_progress": "▶", "needs_user_input": "?",
                    "completed": "✓", "rejected": "✗", "regenerating": "↻"}[t.status]
            lines.append(f"{tick} {t.content}")
        return "\n".join(lines)


class AgentGraphState(TypedDict):
    # ... 前面的字段不变
    task_list: CreationTaskList                              # ← 新增字段
```

把 `task_list.render_for_prompt()` 作为**永久前缀**注入到每次 LLM 调用的 user 消息里（在压缩节点前面）。这样：

- conversation messages 可以被压缩成 history_summary（语气）。
- confirmed_choices 保护已确认决策（数据）。
- task_list 保护任务进度（流程）。

三者各管一摊，互不重叠。这是 Compress 的"三重逃生通道"——比单一摘要稳健得多。

**对面试官说的金句**：

> 我们把 conversation history 拆成三层逃生通道：confirmed_choices（用户确认的事实）、task_list（任务进度）、history_summary（语气）。前两层永远不会被有损压缩，第三层滚动覆盖。这套设计直接借鉴了 Claude Code 的 TodoWrite——它证明了"结构化任务列表比对话历史更适合做长任务的状态载体"。

---

## 11. System Reminders：turn-local 状态广播

这是另一个 Claude Code 独有的精妙机制——值得 ArtArch.AI 借鉴。

### 11.1 Claude Code 的 system reminder

在对话里你会看到这种东西：

```text
<system-reminder>
The user opened the file /path/to/foo.py in the IDE.
This may or may not be related to the current task.
</system-reminder>

<system-reminder>
The user selected the lines 506 to 510 from /path/to/bar.md
</system-reminder>
```

它的特点：

1. **由 harness 注入**，不是用户也不是模型自己说的。
2. **只在当前 turn 出现**——下一个 turn 自然消失（不进 conversation history）。
3. **由事件触发**：用户切窗、选中文本、打开新文件、外部 task 完成都会触发。
4. **是"提示"不是"指令"**——结尾常带 "may or may not be related"，让模型自己判断要不要响应。

这是 **"turn-local context injection"**——一种**短期注意力转移机制**，既不污染长期历史，又让模型能感知到环境变化。

### 11.2 ArtArch.AI 借鉴：素材库 / 预览 / 外部事件广播

ArtArch.AI 当前是一个纯对话 Agent，但实际产品上有一个素材库面板、一个生成预览面板、一个时间线面板。用户的所有交互都被"摊平"成对话消息——但这些其实是**环境信号**，更适合用 system reminder 模式。

```python
@dataclass
class TurnReminder:
    """turn-local 状态广播，不进 messages，不进 history_summary。"""
    kind: Literal["preview_clicked", "asset_browsed", "shot_reorder",
                  "external_task_done", "ui_focus_change"]
    payload: dict
    created_at: datetime


async def assemble_prompt_with_reminders(
    state: AgentGraphState,
    view: dict,
    pending_reminders: list[TurnReminder],
) -> str:
    """在 user message 前注入 turn-local reminders。"""
    reminder_blocks = []
    for r in pending_reminders:
        if r.kind == "preview_clicked":
            reminder_blocks.append(
                f"<system-reminder>用户刚刚点击了 shot {r.payload['shot_index']} 的预览。"
                f"这可能与当前对话相关也可能不相关。</system-reminder>"
            )
        elif r.kind == "asset_browsed":
            reminder_blocks.append(
                f"<system-reminder>用户正在浏览素材库的 '{r.payload['category']}' 分类。"
                f"</system-reminder>"
            )
        elif r.kind == "shot_reorder":
            reminder_blocks.append(
                f"<system-reminder>用户在时间线上把镜头顺序改成了 {r.payload['new_order']}。"
                f"</system-reminder>"
            )
        elif r.kind == "external_task_done":
            reminder_blocks.append(
                f"<system-reminder>后台任务 '{r.payload['task_id']}' 已完成，"
                f"结果在 AssetRef {r.payload['ref']}。</system-reminder>"
            )

    return "\n".join(reminder_blocks) + "\n\n" + render_user_message(view)
```

**这套机制让 Agent 能感知前端 UI 事件，但不让 UI 事件污染 conversation history**——是产品交互层和对话层的解耦关键。

**对照表**：

| 信息来源 | 应该进哪里 |
|---|---|
| 用户主动说的话 | `messages`（会进 history_summary） |
| 用户确认的决策 | `confirmed_choices`（永久结构化） |
| 任务进度状态 | `task_list`（永久结构化） |
| 用户的偏好画像（跨 session） | `UserMemory`（永久跨 session） |
| **UI 事件 / 短期信号** | **`TurnReminder`（只活一个 turn）** |

> 这是非常细的工程区分——大多数团队第二天上线的 Agent 把所有信息都塞 messages。区分了之后**整个 conversation 干净得多，模型也专注得多**。

引用：Claude Code 的 system reminder 机制在 Anthropic 官方文档里没有专门一篇讲，但能在 [Claude Code release notes](https://docs.anthropic.com/en/docs/claude-code/overview) 和 cookbook 示例里看到。Drew Breunig 在 [How to Fix Your Context](https://www.dbreunig.com/2025/06/22/how-to-fix-your-context.html) 里把这种机制叫 "context as event stream"。

---

## 12. 综合 checklist（面试可直接背）

| Item | ArtArch.AI 做法 | Claude Code 对照 |
|---|---|---|
| State 不存大对象 | AssetRef + S3/PG/Redis 三层 | 文件系统作 memory |
| 每 node 自做 select | `prompt_view(state)` 纯函数 | Read offset/limit + Skill 按需 |
| 决策结构化保护 | `ConfirmedChoices` + `merge(keep_old)` | TodoWrite 状态机 |
| 任务进度独立载体 | `CreationTaskList` | TodoWrite |
| 跨 session 用户画像 | `UserMemory` + append-and-review | `memory/` markdown 文件 |
| 子图隔离 | sub-graph + output_schema | Task tool 冷启动 + 单 string 返回 |
| Prefix cache 4 层标注 | system 拆 3 段 + user 1 段 | 巨大静态 system prompt |
| Reducer 正确写 | `Annotated[list, add_messages]` | conversation 是 append-only jsonl |
| Checkpoint 监控 | 单条 < 32KB 告警 | jsonl 文件大小自然增长 |
| UI 事件不污染 history | `TurnReminder`（borrowed from Claude Code） | `<system-reminder>` |
| Eval per stage | 每个 node 独立可评测 | 每个 subagent 独立可评测 |

---

## 13. 一句话总结

> **Context Engineering 不是把多东西塞进 prompt，而是让每个 LLM 调用都拿到「刚好够用」的上下文**。LangGraph 提供的 State / Reducer / Sub-graph / Checkpoint，是把这件事工程化的最佳工具集；Claude Code 用文件系统 + TodoWrite + System Reminder + memory files 实现同一目标的极简版。

**两条体系的最深共识**：

> 上下文不是"对话历史"，是 **"当前任务所需的最小封装"** —— 其余一切都该放进外部存储、结构化字段、或 turn-local 通道。

参考阅读：

- [Anthropic · Effective context engineering for AI agents](https://www.anthropic.com/news/effective-context-engineering-for-ai-agents) — Claude Code 团队官方
- [Anthropic · Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — Orchestrator-workers / Routing pattern
- [LangChain · Context Engineering for Agents](https://www.langchain.com/blog/context-engineering-for-agents) — Harrison Chase
- [Phil Schmid · Context Engineering Part 2](https://www.philschmid.de/context-engineering-part-2)
- [Drew Breunig · How to Fix Your Context](https://www.dbreunig.com/2025/06/22/how-to-fix-your-context.html) — 上下文工程六法
- [Karpathy · The append-and-review note](https://karpathy.bearblog.dev/the-append-and-review-note/)
- [LangGraph · Multi-agent supervisor 教程](https://langchain-ai.github.io/langgraph/tutorials/multi_agent/agent_supervisor/)
- 本站姊妹篇：[How to Fix Your Context · LangGraph 上下文工程六法](../../review/10-context-engineering-langgraph.md)、[ArtArch.AI 面试 Q&A](../artarch-ai.md)
