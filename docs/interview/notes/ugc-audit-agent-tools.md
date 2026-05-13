# UGC Audit Agent · 工具集与多 Agent 编排

> 配合 [baidu-map-ugc.md](../baidu-map-ugc.md) Q4 / Q5-Q11 食用。这是地图 UGC 项目的「Agent 系统设计真深度版」。

---

## 1. Audit Agent 适用判据：什么时候才该上 Agent？

Anthropic *Building Effective Agents* 给出的判据：

> *"Use agents when tasks require dynamic decisions about which tools to call and what evidence to gather, and when the cost of getting it wrong justifies the variance and latency of agents."*

UGC 机审完全命中：

| 判据 | 是否满足 |
|---|---|
| 不同样本需要不同证据组合 | ✅ 关店 vs 电话 vs 名称纠错完全不同 |
| 需要主动调查（不仅是分类） | ✅ 必须查街景 / 第三方 / 用户行为 |
| 出错代价高 | ✅ 错改 POI 影响千万用户 |
| 可承担 1-6s 延迟 | ✅ 异步处理，不在主链路 |
| 工具集合相对稳定 | ✅ 不会每天加新工具 |

**反例**：Layer 1 / 2 不该用 Agent，因为是确定规则 / 静态分类器，用 Agent 是 over-engineer。

---

## 2. 工具集（Tool Catalog）

### 2.1 读类工具（read-only，Agent 可自治调用）

| 工具 | 用途 | 实现 |
|---|---|---|
| `phone_lookup_rag` | 电话号码多源验证（绑定、号段、黑名单、归属地、注册库、用户跨报、**号码池行为向量 ANN**） | ES（精确） + **Milvus（行为向量 ANN）** + Redis KV + OLAP 并发召回，详见主文 Q5 |
| `poi_history_rag` | POI 近 90 天变更轨迹、上报来源分布 | ES 时序索引 |
| `similar_report_cluster` | 同 POI / 同区域 / 同诉求的报告聚类 | OLAP + DBSCAN 在线 |
| `user_reputation_query` | 用户 6 维信誉向量 | feature store 查询 |
| `user_behavior_sequence` | 用户最近 N 条上报的时空 / 类型分布 | 行为日志 OLAP |
| `street_view_check` | 街景影像时间序列、招牌检测 | 内部街景 API + 招牌检测模型 |
| `crossref_third_party` | 跨大众点评 / 美团 / 工商网核验 | 受控爬虫 + 官方 API + 缓存 |
| `image_reverse_search` | 反查图片是否被多处使用 | image embedding + Faiss |
| `text_risk_scan` | 涉法 / 政 / 黄 / 投诉 / 竞品恶意词典 | 关键词 + 语义分类器 |
| `geo_consistency_check` | 坐标 vs 行政区划 vs 地标语义 | geo SDK + 反向地理编码 |
| `black_gang_membership_query` | 查 user / poi 是否属于已识别可疑社区 | 离线图聚类结果缓存 |
| `business_registry_lookup` | 工商注册库查法人 / 经营状态（合规允许时） | 第三方付费 API |

### 2.2 写类工具（read-write，必须走 HITL 网关）

| 工具 | 用途 | 风控 |
|---|---|---|
| `flag_user_reward_freeze` | 临时冻结用户奖励 | 进 HITL 队列，人工 1h 内审批 |
| `cluster_mass_reject` | 批量打包黑产嫌疑案件 | 进 HITL 队列 + 必须 ≥ 5 evidence |
| `escalate_complaint` | 推送涉法 / 隐私 case 给合规 | 自动转发，但不能直接结案 |

OpenAI Operator / GPT-5 system card 明确建议：**high-impact tool 永远不允许 agent 单方面执行**。我们做的就是这个原则的工程化。

---

## 3. Tool Description 写法（被低估的关键点）

LLM 选工具靠 description，不靠工具名。**好的 description 比好的工具名重要 10 倍**。

❌ 反例：

```json
{
  "name": "phone_lookup_rag",
  "description": "查询电话",
  "parameters": {...}
}
```

✅ 正例：

```json
{
  "name": "phone_lookup_rag",
  "description": "Look up a phone number across multiple sources: (1) which POIs currently bind this number, (2) is it in a virtual / 95 / 400 segment, (3) blacklist hits in the last 180 days, (4) geographic consistency between number's carrier region and the POI's city, (5) recent swap events from another POI, (6) business registry data. **Always call this when the report touches phone numbers, closure, or transfer of ownership.** Returns a structured PhoneLookupResult with all 6 dimensions.",
  "parameters": {...}
}
```

**Description 三件套：**

1. **What it does**：多源 / 输入 / 输出
2. **When to call it**：明确触发条件
3. **What it returns**：结构化字段

---

## 4. Orchestrator vs Evaluator 边界

| 维度 | Orchestrator | Evaluator |
|---|---|---|
| 角色 | 调度证据收集 | 独立审判 |
| Prompt 立场 | 中性，按 case 决定调什么 | 反向，专门挑毛病 |
| 是否决策 | 不直接决策 | 决策 |
| 是否调工具 | 是，调多个 | 否，只看 Orchestrator 给的 evidence |
| 是否可 retry | 是，最多 3 轮 | 否，看到不够直接 manual_review |
| 模型选择 | 强模型（Gemini 2.5 Pro / GPT-5），需要多步规划 | 中模型即可（Gemini Flash / GPT-5-mini），任务窄 |

**两阶段独立 prompt 的价值（Anthropic Evaluator-Optimizer pattern）：**

- Orchestrator 自己 self-critique 会偏袒自己的决策。
- Evaluator 用反向 prompt（专门找毛病），相当于「换一双眼睛」。
- 实测对边界 case 的误判率下降 ~30%。

**关键技巧：Evaluator 的 prompt 必须强制要求列 ≥ 1 条 counter_argument。** 如果列不出，说明 evidence 真的强，confidence 上调；如果能列出但仍判 approve，confidence 下调。

---

## 5. Plan-and-Execute（升级版）

当前架构是「一次性收 evidence → judge」。下个迭代上 Plan-and-Execute：

```python
async def plan_and_execute(report):
    # Phase 1: Plan
    plan = await orchestrator.make_plan(report)
    # plan = ["phone_lookup", "user_reputation", "street_view"]

    # Phase 2: Execute (并行)
    evidence_v1 = await execute_in_parallel(plan)

    # Phase 3: Replan if needed
    gaps = await orchestrator.identify_gaps(evidence_v1, report)
    if gaps:
        plan_v2 = await orchestrator.replan(gaps)
        evidence_v2 = await execute_in_parallel(plan_v2)
        evidence = merge(evidence_v1, evidence_v2)
    else:
        evidence = evidence_v1

    # Phase 4: Evaluate
    return await evaluator.judge(evidence, report)
```

**Plan-and-Execute 比 ReAct 更适合 UGC 机审：**

- ReAct 是逐步推理 + 行动 + 观察，适合**路径不确定**的任务（写代码、搜索研究）。
- Plan-and-Execute 是先规划再批量执行，适合**步骤明确但需要主动调查**的任务（机审、合规检查、KYC）。
- ReAct 每步要 LLM call，**Plan-and-Execute 把规划和评判都集中**，token 成本低 40%+。

---

## 6. Token / Cost 预算管理

```python
@dataclass
class AgentBudget:
    max_tool_calls: int = 10
    max_replan_rounds: int = 3
    max_total_tokens: int = 8_000
    max_latency_sec: float = 8.0
    max_cost_usd: float = 0.05

# 超预算自动 short-circuit
```

**生产实测（Layer 3 全样本）：**

| 指标 | P50 | P95 |
|---|---|---|
| Tool calls | 3 | 8 |
| Replan rounds | 0 | 1 |
| Total tokens | 1.8k | 5.2k |
| Latency | 2.1s | 6.8s |
| Cost | $0.008 | $0.032 |

---

## 7. 失败模式与修法

### 7.1 工具调用爆炸（agent loop）

Orchestrator 在某些 case 反复调同一工具，不收敛。

**修法：**

- 同一工具同一参数 24h 内重复调用 → cache 命中即返回（节省 + 防 loop）。
- max_tool_calls 强制硬限。
- Prompt 加 "do not call the same tool with same args twice"。

### 7.2 工具选错

应该调 `street_view_check` 时模型调了 `image_reverse_search`。

**修法：**

- Description 强化 "When to call it" 段落。
- Few-shot 加 1-2 个「正确选工具」的 trace 示例。
- 评测集监控 selection_recall / selection_precision。

### 7.3 Evaluator 与 Orchestrator 合谋

两个 prompt 太相似 → 一起错。

**修法：**

- 用**不同模型**跑（Gemini Pro 做 Orchestrator，GPT-5 做 Evaluator）。
- Evaluator prompt 强调「反向 / 挑毛病 / counter argument 必填」。
- 定期 swap 模型角色做 A/B 校准。

### 7.4 工具返回数据漂移

下游 RAG 索引升级，schema 变了，Agent 看到的字段不一样。

**修法：**

- 工具实现层强制 schema 版本号 + 兼容层。
- Agent 端不直接吃 raw response，过一层 normalize。
- 工具 schema 进 CI，破坏性变更必须升 major version。

### 7.5 缓存导致幻读

缓存了某 POI 的「店还开着」结果，但 POI 实际已关。

**修法：**

- 高敏类（关停 / 转让）不缓存。
- 缓存 TTL 24h 上限。
- 重大 event（用户大量投诉同 POI）触发主动 invalidate。

---

## 8. 安全：Read-only 自治 / Read-write HITL

```python
class ToolPermission(StrEnum):
    AGENT_AUTONOMOUS = "agent_autonomous"  # read-only
    HITL_REQUIRED = "hitl_required"        # write / high-impact

TOOL_PERMISSIONS = {
    "phone_lookup_rag": ToolPermission.AGENT_AUTONOMOUS,
    "poi_history_rag":  ToolPermission.AGENT_AUTONOMOUS,
    # ...
    "flag_user_reward_freeze": ToolPermission.HITL_REQUIRED,
    "cluster_mass_reject":      ToolPermission.HITL_REQUIRED,
}

async def call_tool(name: str, args: dict):
    perm = TOOL_PERMISSIONS[name]
    if perm == ToolPermission.HITL_REQUIRED:
        return await hitl_queue.enqueue(name, args)
    return await tools[name](**args)
```

OpenAI 在 GPT-5 system card 强调：**任何会产生不可逆 / 高影响后果的工具调用都应该有 user / operator 的明确 confirm**。我们的做法是把这一原则前置到 Tool Permission Registry。

---

## 9. 评测：Trajectory + Outcome 双指标

详见主文 Q9。核心要点：

- **Decision accuracy** 看最终对错。
- **Tool selection recall/precision** 看 Agent 选工具是否合理。
- **Tool efficiency** 看是否过度调用。
- **Reason faithfulness** 看 reason_codes 是否被 evidence 支持。
- **pass^k**：连续 k 次都对的概率，比 pass@k 更接近线上 SLA。

---

## 10. 向量数据库选型补录：为什么 phone_lookup_rag 用 Milvus

UGC Audit Agent 的所有「向量召回」类工具（电话行为池、image_reverse_search、similar_poi_geo_cluster、user_behavior_sequence 聚类）统一走 Milvus。原因：

1. **十亿级规模 + 分布式**：Faiss 单机扛不住电话池 + 图片 + 用户行为的合计规模，Milvus 原生支持分布式 + 水平扩展。
2. **Hybrid Search（filter + ANN 同步执行）**：电话场景按「大区」filter，图片场景按「图类型 + 上传时段」filter，pgvector / ES Dense 都是先 ANN 后过滤，召回会塌；Milvus 的 `expr` 在 search 时同步执行，召回不掉。
3. **Collection / Partition / Alias**：行为向量模型升级（v2 → v3）用 Collection Alias 切换，零下线灰度。Faiss / pgvector 做版本切换都要手工导。
4. **实时增量 + DML**：黑名单标签每天滚动入库，Milvus 的 upsert 友好，索引秒级生效。
5. **元数据 output_fields**：ANN 结果直接带 `blacklist_label / cluster_id / first_seen`，省一次回表。

调参实战：

| 索引类型 | 参数 | 适用场景 |
|---|---|---|
| HNSW | M=32, efConstruction=200, online ef=64 | 高召回 + 低延迟（电话行为池、图片反查） |
| IVF_PQ | nlist=4096, nprobe=32, m=16 | 大规模 + 内存敏感（用户行为 ~10 亿条 fingerprint） |
| DISKANN | search_list_size=100 | 超大规模冷数据 |

> Anthropic 没有专门给「向量 DB 该用哪个」的规范，但 *Building Effective Agents* 反复强调 **「工具实现层的质量决定 Agent 上限」**。Milvus 选对，电话池识别召回率直接 +60%；选错（比如硬扛 Faiss），Agent 看到的全是失真证据。

---

## 11. 一句话总结

> **UGC 机审之所以适合上 Agent，不是因为「LLM 厉害」，而是因为「每条上报需要的证据组合不一样，必须动态决定调什么工具」**。这是 Anthropic 给 Agent 适用场景的硬判据，我们的实践完全契合。
>
> Agent 的能力上限 = **工具集质量 × Orchestrator 调度能力 × Evaluator 独立性**。三者缺一不可，**工具实现层（包括 Milvus 这类向量基建）的质量决定上限里的工具集那一项**。
