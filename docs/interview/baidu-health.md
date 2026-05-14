# 百度健康助手 · 医疗 RAG 多轮 Bot 面试 Q&A

> 这块面试主要考三件事：**多轮状态机怎么建**、**RAG 召回质量怎么提**、**医疗安全边界怎么守**。在这三件事里再扣细节：意图分桶、混合检索的融合公式、bge-reranker 的训练数据、引用溯源的做法、{{HITL|人机协同}}和拒答策略。

![百度健康助手 RAG 管线：User Query → Intent Classifier(rule + LLM) → Hybrid Retrieval(BM25 + Dense) → BGE Reranker → Citation-aware LLM Generator → Safety Gate → User，下方接 Medical Knowledge Base（disease / drug / clinical guidelines）](../../assets/interview-baidu-health-architecture.png)

---

## 0. 一分钟项目介绍

百度健康助手是面向 C 端的医疗对话 Bot，覆盖**症状咨询、疾病科普、用药建议、报告解读、挂号导诊**等场景，**日均十万级 query**。我在里面**主导多轮状态机设计 + 参与 RAG 召回链路重构 + 医疗安全兜底体系**。

技术决策上的三个关键点：

1. **多轮状态机不是 chat loop**：按意图（症状咨询 / 疾病科普 / 药品问答 / 报告解读 / 导诊）做路由，每类意图维护独立的「症状上下文 + 已确认信息 + 待追问字段」。**多轮意图识别准确率 92%+，平均对话深度 3.5 轮**。
2. **RAG 不止是 vector search**：医学场景里术语、剂量、禁忌、并发症对召回精确度极敏感。我们用 **BM25（保术语）+ Dense（保语义）+ bge-reranker（保相关性）+ 引用溯源（保可信）** 四件套，**Top-3 命中率从 ~70% 到 88%+**。
3. **安全是召回率优先而不是准确率优先**：医疗场景宁可多拦也不能漏。我们用 **规则层（明确高危词模式）+ LLM 层（隐晦组合上下文）** 双层风控，**高风险命中召回率 98%+**，并按急症 / 处方 / 诊断三类分级处理。

工程化层面，配套有：Prompt 版本管理、千级标注的医学评测集、Badcase 回流、多模型路由、限流降级、A/B 实验、链路 trace。整体让 RAG + LLM 系统**稳定支撑 C 端高并发，主链路 SLA 99.9%+**。

> **发散 tip：**
> - 「医疗 RAG 和通用 RAG 最大的区别不在召回算法，而在**评测标准和安全边界**。可以从『召回质量』『生成质量』『安全合规』『可解释』四个维度展开聊。」
> - 「我特别想强调一点：医疗场景的 RAG 评测如果只看 Top-K 命中率，会严重低估错误代价。我们后来把指标重做成『按风险加权的召回率』。」

---

## 1. 多轮状态机：从「单轮问答」到「连续问诊」

### Q1：医疗 Bot 多轮怎么建？为什么不直接让 LLM 跑 chat loop？

**核心论点：** 医疗对话是「连续问诊」，不是「闲聊」。**状态显式化** 才能保证「该追问的字段被追问、已确认的信息不会被忘」。

**意图分桶（state machine 第一层）：**

```
用户输入 → 意图分类器（规则 + LLM）→
  ┌─ 症状咨询（symptom）→ 症状状态机
  ├─ 疾病科普（disease_qa）→ RAG-only
  ├─ 药品问答（drug_qa）→ RAG + 风控
  ├─ 报告解读（report）→ 多模态/结构化
  ├─ 导诊推荐（dept_doctor）→ 业务系统
  └─ 闲聊兜底（chitchat）→ 拒答模板
```

**症状咨询的核心 state（举例最复杂的一类）：**

```python
class SymptomContext(BaseModel):
    chief_complaint: str | None        # 主诉
    confirmed_symptoms: list[Symptom]  # 已确认症状（部位、性质、时长、伴随）
    pending_questions: list[str]       # 待追问字段
    risk_flags: list[RiskFlag]         # 触发的风险点
    candidate_conditions: list[Condition]  # 候选疾病
    suggested_actions: list[Action]    # 当前建议（继续问 / 就医 / 拒答）
    turn_count: int
    last_user_intent: str
```

**为什么不直接 chat loop？**

| 维度 | Chat loop（直接 LLM） | 显式状态机 |
|---|---|---|
| 上下文一致性 | 长会话容易遗忘前面确认的信息 | 结构化字段永远存在 |
| 可追问字段 | LLM 自己决定问什么，常漏 | 业务可控（按部位 → 性质 → 时长 → 伴随顺序） |
| 安全策略 | 高风险词检测难做 | 每轮跑一次 risk_flags 计算 |
| 评测 | 没有客观指标 | 可看「追问命中率」「确诊路径长度」 |
| 可解释 | 用户问「为啥让我去医院」答不上来 | suggested_actions 带 reason |

**状态转移逻辑（伪代码）：**

```python
def next_turn(state: SymptomContext, user_msg: str) -> Response:
    # 1. 抽取本轮新信息
    new_facts = extractor.run(user_msg, state)
    state.confirmed_symptoms = merge(state.confirmed_symptoms, new_facts.symptoms)

    # 2. 风控前置（高风险词命中 / 风险组合）
    state.risk_flags = risk_engine.check(state)
    if state.risk_flags.has_emergency:
        return SafetyResponse(action="emergency_redirect", reason=state.risk_flags)

    # 3. 看是否已经够触发候选疾病检索
    if confidence(state.confirmed_symptoms) > 0.6:
        state.candidate_conditions = condition_retriever.run(state)

    # 4. 决定本轮回应：追问 / 给答案 / HITL
    return decide_response(state)
```

> **发散 tip：**
> - 「这套 state machine 本质上是把『医生问诊路径』做成代码——主诉 → 系统性追问 → 鉴别诊断 → 处置建议。如果想偷懒只用 LLM 也能跑，但每条线都会漏。」
> - 「Anthropic 在 Building Effective Agents 里强调 prompt chaining 和 routing 这两种 workflow pattern 适用于结构化领域，医疗对话刚好是典型。」

#### 🛠 多轮状态机的具体技术方案

| 维度 | 主推库 / 方案 | 备选 | 一句话理由 |
|---|---|---|---|
| State schema | `pydantic` 2.5+ + `Literal` enum + `field_validator` | `attrs` + `cattrs` / dataclass | Pydantic 自带 JSON 序列化、API 上下行直通 |
| State 持久化 | `redis.asyncio` HSET（每个 `session_id` 一个 hash）+ TTL 24h | Postgres jsonb / `langgraph.checkpoint` | Redis 满足 P95 < 5ms，会话特性匹配 |
| FSM 引擎 | `transitions` (pytransitions/transitions) | XState（前端） / 自写 dict-based dispatcher | `transitions` 自带可视化（GraphMachine）+ HierarchicalMachine |
| 跨阶段编排 | 自写 dict-based dispatcher（适合<10 阶段）/ `langgraph.StateGraph` | `prefect` workflow | 简单场景 dict 即可，复杂的上 LangGraph |
| 命名实体抽取 | `gliner-py`（zero-shot NER, 中文支持） + 医学词典 | `spacy` + `zh_core_web_sm` / `hanlp` | gliner 不用标注训练数据，医学场景大量长尾术语 |
| 症状归一化 | 自建症状词典 `pydantic-extra-types` + `pyahocorasick` 多模匹配 | rule + `jieba` | ahocorasick 微秒级，10w+ 词典也稳 |
| 候选疾病检索 | Elasticsearch BM25 + Qdrant dense + RRF（见 Q3） | 自建倒排 | 同主 RAG 链路复用 |
| 置信度计算 | EWMA + 规则加权 + sklearn `IsotonicRegression` 做 calibration | 自建 Bayesian | calibration 让"模型说 0.9"真的接近 90% |
| 状态可视化（内部调试） | `transitions.extensions.GraphMachine` 输出 PNG / `mermaid-py` | graphviz 手画 | 自动出图，PR review 友好 |
| 单元测试 | `pytest` + `pytest-asyncio` + `hypothesis` 状态机性质测试 | unittest | hypothesis 自动生成状态转移序列穷举 |

**关键代码：用 `transitions` + Pydantic 做症状状态机**

```python
from transitions import Machine
from pydantic import BaseModel
from typing import Literal

class SymptomContext(BaseModel):
    chief_complaint: str | None = None
    confirmed_symptoms: list = []
    pending_questions: list[str] = []
    risk_flags: list = []
    candidate_conditions: list = []
    turn_count: int = 0
    stage: Literal["intake", "followup", "differential", "advice", "emergency"] = "intake"

class SymptomMachine:
    states = ["intake", "followup", "differential", "advice", "emergency"]
    transitions = [
        {"trigger": "user_msg",   "source": "intake",       "dest": "followup",     "conditions": "has_chief_complaint"},
        {"trigger": "user_msg",   "source": "followup",     "dest": "differential", "conditions": "enough_symptoms"},
        {"trigger": "user_msg",   "source": "differential", "dest": "advice",       "conditions": "diagnosis_confident"},
        {"trigger": "risk_hit",   "source": "*",            "dest": "emergency"},   # 全局逃生
    ]

    def __init__(self, ctx: SymptomContext):
        self.ctx = ctx
        self.machine = Machine(model=self, states=self.states,
                               transitions=self.transitions, initial=ctx.stage,
                               auto_transitions=False)

    # conditions
    def has_chief_complaint(self) -> bool:
        return bool(self.ctx.chief_complaint)

    def enough_symptoms(self) -> bool:
        # 部位 + 性质 + 时长 + 伴随 四个维度都齐
        return len(self.ctx.confirmed_symptoms) >= 4
```

**为什么不直接上 LangGraph**：百度健康助手对话深度平均 3.5 轮、状态简单（5 个），`transitions` 已经够；LangGraph 的 checkpoint / interrupt 在 IM 形态对话里反而 overkill（用户重连用 Redis state 恢复即可）。**如果业务往"长任务异步问诊"演进**，再切 LangGraph + AsyncPostgresSaver。

引用：

- pytransitions/transitions: <https://github.com/pytransitions/transitions> （30k+ stars，Python FSM 事实标准）
- GLiNER zero-shot NER: <https://github.com/urchade/GLiNER>
- hypothesis stateful testing: <https://hypothesis.readthedocs.io/en/latest/stateful.html>

---

### Q2：意图识别怎么做？92% 准确率怎么测？

**两层意图识别：**

1. **规则前置**：高频明确意图（「我感冒了」/「咨询药品」/「想挂号」）用关键词 + 正则命中，置信度高的直接 dispatch。
2. **LLM 分类兜底**：规则不命中的，过文心 ERNIE 做多标签分类（输出 intent_label + confidence + 备选 intent）。

**评测怎么算 92%？**

- 标注集：从线上日志按意图分布抽 5000 条 query，由 3 个医学 + 工程标注员投票，得到 gold label。
- 指标：
  - **整体准确率**：92%+
  - **按意图召回率**：症状 95%、疾病 90%、药品 93%、报告 88%、导诊 96%、闲聊 80%
  - **混淆矩阵**：症状和疾病误分类率 4%（最常见错误，因为用户描述边界模糊）

**误分类典型 case + 修复策略：**

| 用户表达 | 错分类 | 正确 | 修复 |
|---|---|---|---|
| 「头疼是什么病」 | 疾病科普 | 症状咨询 | 加规则：症状词 + 「是什么」→ 症状 |
| 「氯雷他定」（单纯药品名） | 闲聊 | 药品问答 | 命名实体识别前置 |
| 「我血压 160」 | 闲聊 | 报告解读 | 数字模式匹配 |

> **发散 tip：**
> - 「意图分类我用的是文心，不是 BERT。原因：医学 vocab 在 BERT 上需要额外预训练，文心做 zero-shot 多标签分类，prompt 一行话就能调，迭代速度快得多。Karpathy 在 Software 3.0 里说『一行 prompt 替代百行代码』，这块就是典型。」

#### 🛠 意图识别两层每层用什么

| 阶段 | 主推库 / 方案 | 备选 | 备注 |
|---|---|---|---|
| 文本归一化 | `unicodedata.normalize("NFKC")` + `opencc-python-reimplemented`（繁→简） + 自建脏字符表 | regex 手撸 | 用户输入混杂全角/emoji/标点变种 |
| 正则匹配 | `regex` 包（支持 \p{Han} Unicode 属性）> 标准 `re` | `re2`（C++ 安全） | 中文范围用 `regex.findall(r"\p{Han}+")` 干净 |
| 多模式 / 词典匹配 | `pyahocorasick`（Aho-Corasick 自动机） | flashtext | 10w+ 词典 P99 < 100µs |
| 中文分词 | `jieba` 0.42+ + 自建医学词表 | `pkuseg` / `hanlp` | 加 `jieba.load_userdict(medical_vocab)` |
| 实体识别（药品/症状/检查） | `gliner-py`（zero-shot，无需训练） / `LAC`（百度 NLP 套件） | `spacy` + 自训 zh model | gliner 一行 prompt 就能加新类别 |
| 第二层模型分类 | 文心 ERNIE `ernie-bot-turbo` via `qianfan` SDK | OpenAI gpt-4o-mini / Gemini Flash via litellm | ERNIE 中文医学 zero-shot 强 |
| Embedding 路由（推荐补一层） | `semantic-router`（aurelio-labs）+ `bge-small-zh` | 自写余弦 + 阈值 | 比规则灵活，比 LLM 便宜 50× |
| 多标签分类（如同时"症状+用药"） | ERNIE prompt 输出 `intent_labels: list[str]` + `instructor` 结构化校验 | 自训 multi-label BERT | 多标签场景 prompt 比训练快 |
| Calibration | `sklearn.calibration.CalibratedClassifierCV` 拟合规则置信度 → 真实概率 | Platt scaling | 让"规则说 0.95"真的对应 95% accuracy |
| 评测集采样 | 按线上意图分布**分层抽样**（`sklearn.model_selection.StratifiedShuffleSplit`） | 简单随机抽 | 保头部 + 长尾意图都被覆盖 |
| 标注 | `Label Studio` 自托管 + 3 人投票，`cohen_kappa_score` 看一致性 | doccano / Argilla | Label Studio 中文支持好，免费 |
| 混淆矩阵分析 | `sklearn.metrics.confusion_matrix` + `pandas` pivot | seaborn heatmap | 找最容易混淆的两类 |
| 自动 calibration drift 检测 | langfuse 抽样 + `ks_2samp`（Kolmogorov-Smirnov） | manual | 月度发分布漂移告警 |

**为什么没用 BERT 分类器（面试金句）**：

1. **维护成本**：BERT 要标 ~1w 条训练数据 + 训练 pipeline + 模型版本管理 + GPU 部署，新增意图要重训。
2. **冷启动**：ERNIE zero-shot prompt 改一行就上线，规则同理。
3. **覆盖率**：高频意图（70%）规则吃掉，长尾用 ERNIE 兜底，BERT 在中间反而尴尬。
4. **性价比**：日均十万级 query 里，70% 规则、25% ERNIE、5% fallback，**实际 LLM 调用约 2.5w 次/天**，按 ERNIE-turbo 价格不过百元。

**Semantic Router 中间层补一手（强烈推荐）**：

```python
from semantic_router import Route, RouteLayer
from semantic_router.encoders import HuggingFaceEncoder

routes = [
    Route(name="drug_qa", utterances=[
        "氯雷他定的禁忌症", "布洛芬怎么吃", "这个药能配阿司匹林吗",
        "氟康唑成人剂量", "孩子能用美林吗",
    ]),
    Route(name="symptom", utterances=[
        "我头疼", "嗓子干痒", "胸闷气短", "肚子绞痛", "持续低烧",
    ]),
    # ... 其他意图
]
rl = RouteLayer(encoder=HuggingFaceEncoder(name="BAAI/bge-small-zh-v1.5"), routes=routes)

hit = rl("最近一直胸口不舒服喘不上气")
# → 'symptom'，~15ms，比 ERNIE 快 30×、便宜 ~100×
```

这一层补上去之后，**ERNIE 调用量再砍 60%**，整体成本和延迟都更稳。

引用：

- 文心 ERNIE / Qianfan SDK: <https://github.com/baidubce/bce-qianfan-sdk>
- semantic-router: <https://github.com/aurelio-labs/semantic-router>
- Label Studio: <https://labelstud.io/>
- 百度 LAC（中文词法分析）: <https://github.com/baidu/lac>

---

## 2. RAG 链路重构：从 70% 到 88% 怎么干

### Q3：为什么要做 BM25 + Dense 混合检索？单独一种不行吗？

**核心论点：** 单一检索方法在医学场景都有结构性短板。**BM25 保术语精确，Dense 保语义泛化**，必须 hybrid。

**典型 case 对比：**

| Query | BM25 召回 | Dense 召回 | Hybrid 命中 |
|---|---|---|---|
| 「氯雷他定的禁忌症」 | ✅（药名精确） | ❌（语义模糊到「过敏药」） | ✅ |
| 「胸口闷喘不上气」 | ❌（口语化，文档里是「胸闷气短」） | ✅ | ✅ |
| 「孕妇能吃布洛芬吗」 | ✅（药名）| ✅（孕期用药） | ✅✅（双路加权） |
| 「儿童剂量怎么算」 | ❌（太泛）| 部分 | 还需要 rerank 拉精 |

**召回阶段的具体做法：**

```python
def hybrid_retrieve(query: str, kb: str, top_k: int = 50) -> list[Doc]:
    # 1. Query 改写（normalize、纠错、扩展同义词）
    q_norm = query_rewriter.run(query)

    # 2. 并行召回
    bm25_results = es_client.search(
        index=kb, body={"query": {"match": {"content": q_norm}}, "size": 80}
    )
    dense_results = faiss_client.search(
        embedding=embedder.encode(q_norm), top_k=80,
    )

    # 3. 融合：RRF
    fused = rrf_merge(bm25_results, dense_results, k=60)

    # 4. 截断 Top-50 给 rerank
    return fused[:top_k]
```

**RRF 公式 + k 取值：**

```
score(d) = Σ_i  1 / (k + rank_i(d))
```

- `k=60` 是社区共识默认值，Elasticsearch、Vespa 都用这个。
- 我们试过加权融合（`α * bm25 + (1-α) * dense`，α=0.5），但需要分数归一化，对不同 query 长度敏感；RRF 不需要分数，鲁棒性更好。

> **发散 tip：**
> - 「RRF 的好处是 rank-based，不需要 score 归一化，跨检索器异构时特别稳。Elastic 官方就推这个。」
> - 「我们试过 ColBERT-style 的 late interaction，效果好但运维复杂度（GPU / 索引大小）翻倍，性价比不够。」

#### 🛠 混合检索每一段的具体方案

| 阶段 | 主推库 / 服务 | 备选 | 备注 |
|---|---|---|---|
| BM25 后端 | **Elasticsearch 8.x**（已有集群）/ `OpenSearch 2.x` | Vespa / Tantivy（Rust） | ES 自带 BM25 + 同义词 + 同库 RRF |
| ES Python client | `elasticsearch[async]` 8.x | `httpx` 直调 | async client 与 FastAPI 同步 event loop |
| 中文分词器 | ES `ik` 插件（ik_max_word + ik_smart）+ 医学自定义词典 | jieba analyzer | ik 是中文 ES 事实标准 |
| 同义词扩展 | ES `synonym_graph` filter + 医学同义词表（在线热更）| 自建 query 改写 | "氯雷他定 → 抗组胺药" |
| Embedding 模型 | `BAAI/bge-large-zh-v1.5`（1024 维）/ `bge-m3`（多向量+长文）| `m3e-base` / OpenAI `text-embedding-3-large` | bge-large-zh 是中文 RAG 事实标准，开源 |
| Embedding 推理服务 | **HuggingFace TEI**（Text Embeddings Inference, Rust） | Triton / vLLM | TEI Docker 一行起，FP16，3-5× 快于纯 Python |
| Embedding 客户端 | `httpx.AsyncClient` 直调 TEI HTTP | `sentence-transformers`（同进程） | 服务化才能多业务复用 |
| Vector DB | **Qdrant**（推荐迁移目标）/ Faiss（早期自建）| Milvus / pgvector / Weaviate | Qdrant payload filter + HNSW 双强 |
| Faiss → Qdrant 迁移 | `qdrant-client[fastembed]` 异步 + 批量 upsert | manual | 详见 [Vector DB 选型 + Reranker 深入](../review/07-vector-db-reranker.md) |
| 索引类型 | HNSW（`M=24, ef_construct=200, ef_search=128`）| IVF + PQ（内存紧张时） | 在线查询首选 HNSW |
| Query 改写 | ERNIE prompt 输出"normalize / typo fix / 同义扩展"三元组 | T5 / mT5 自训 query rewriter | prompt 方案对长尾更鲁棒 |
| Query 纠错 | `pycorrector` + `jieba` 分词 | 自训 SoftMaskedBERT | 纠错只对低置信 query 触发 |
| RRF 融合 | 自写 50 行 Python 即可 / ES 8.8+ 原生 `retriever.rrf` | LangChain `EnsembleRetriever` | ES 8.8 原生 RRF 是简化首选 |
| 并发召回 | `asyncio.gather(bm25_task, dense_task, return_exceptions=True)` | trio | 单路 fail 不阻塞另一路 |
| 检索缓存 | `redis.asyncio` `SETEX` + `(query_hash, kb_version)` key | `aiocache` | 10min TTL，~12% 命中率 |
| Embedding 缓存 | Redis `(text_hash) → vector bytes`（pickle / orjson） | local LRU `cachetools` | 30d TTL，30%+ 命中 |
| 元数据过滤 | Qdrant `Filter(must=[FieldCondition(...)])` pre-filter | ES filter context | 关键：HNSW 必须 pre-filter，post-filter 会被滤穿 |
| Chunking | `langchain_text_splitters.RecursiveCharacterTextSplitter` + 中文 separators `["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""]` | LlamaIndex `SentenceSplitter` | 中文标点必须放前面 |
| 父子 chunk | `langchain.retrievers.ParentDocumentRetriever` | 自建 parent map | 小 chunk 召回 + 大 chunk 喂 LLM |
| Contextual Retrieval | 离线 Claude Haiku + prompt caching 给每个 chunk 加 doc-level 摘要 | 自建 LLM 跑批 | 详见 [Chunking 策略](../review/11-chunking-strategy.md) |

**ES 8.8+ 原生 RRF retriever（最干净的写法，省去自写融合）**：

```python
from elasticsearch import AsyncElasticsearch
es = AsyncElasticsearch(["http://es:9200"])

async def hybrid_search(query: str, q_vec: list[float], size: int = 50):
    res = await es.search(
        index="medical_kb",
        retriever={
            "rrf": {
                "retrievers": [
                    {"standard": {"query": {"match": {"content": query}}}},        # BM25
                    {"knn": {"field": "embedding", "query_vector": q_vec,
                              "k": 80, "num_candidates": 200}},                       # Dense
                ],
                "rank_window_size": 100,
                "rank_constant": 60,                                                 # k=60，社区共识
            }
        },
        size=size,
    )
    return [{"id": h["_id"], "score": h["_score"], **h["_source"]} for h in res["hits"]["hits"]]
```

为什么是 ES + Qdrant 双栈而不是单一：

- **ES 既能 BM25 也能 dense_vector + native RRF**，单一栈最省事。
- **Qdrant 在多约束 pre-filter + HNSW 上更强**，业务"按药品 + scope=elderly + 3 年内"这种多过滤非常多。
- 实际架构：ES 主用做"BM25 + 一路 dense 兜底"，Qdrant 专门承担"多 metadata filter 的精细路由"。

引用：

- HuggingFace TEI: <https://github.com/huggingface/text-embeddings-inference>
- ES Native RRF retriever (8.8+): <https://www.elastic.co/guide/en/elasticsearch/reference/current/rrf-retriever.html>
- bge 模型卡: <https://huggingface.co/BAAI/bge-large-zh-v1.5>
- ParentDocumentRetriever: <https://python.langchain.com/docs/how_to/parent_document_retriever/>
- 本站姊妹篇：[RAG 混合检索](../review/02-rag-retrieval.md)、[Vector DB + Reranker](../review/07-vector-db-reranker.md)、[Chunking 策略](../review/11-chunking-strategy.md)

---

### Q4：bge-reranker 为什么有效？怎么部署？

**核心区别（必背的一段）：**

| 模型类 | 结构 | 用途 | 复杂度 |
|---|---|---|---|
| Embedding 模型（bi-encoder） | 双塔，query 和 doc 独立编码 | 大规模召回 | O(N) 向量检索 |
| Reranker（cross-encoder） | 单塔，query+doc 拼接进 transformer | 精排小集合 | O(K) 全 transformer forward |

bge-reranker 把 query 和候选 doc 一起喂给模型，每对生成一个相关性分数。它**能看到 query-doc 之间的细粒度 token 交互**，对医学场景里「症状-病因」「药品-禁忌症」这类语义关系判断更准。

**部署 + 调优经验：**

- 模型：bge-reranker-large（中文），FP16 推理。
- 输入：Top-50 候选，每条 (query, doc_chunk)，最长 512 token。
- 部署：4 卡 T4 + Triton Inference Server，batch=32，P95 延迟 80ms。
- 调优：Top-K 从 50 砍到 20 后准确率没掉太多但延迟降一倍，最终选 K=30。

**rerank 阶段的二次约束：**

```python
def rerank_with_constraints(query: str, candidates: list[Doc]) -> list[Doc]:
    pairs = [(query, c.chunk) for c in candidates]
    scores = bge_reranker.score(pairs)

    reranked = []
    for c, s in zip(candidates, scores):
        # 业务约束加在 rerank score 上：
        # 1. 来源权威性 boost（医学百科 > 论坛 > 用户评论）
        # 2. 时间衰减（药品库新版本 > 旧版本）
        # 3. 风险关键词命中加分
        final_score = s + source_boost(c) + recency_boost(c) + risk_boost(c, query)
        reranked.append((c, final_score))
    return sorted(reranked, key=lambda x: -x[1])[:5]
```

> **发散 tip：**
> - 「bge-reranker 我们没自己 fine-tune，因为效果已经够；但如果场景特别窄（比如只做药品禁忌），fine-tune 几千条标注数据，准确率还能再上 3-5 个点。这是后续可以聊的方向。」

#### 🛠 Reranker 部署 + 训练 + 业务约束

| 维度 | 主推方案 | 备选 | 备注 |
|---|---|---|---|
| 主模型 | `BAAI/bge-reranker-large`（中文）/ `bge-reranker-v2-m3`（多语长文）| `jina-reranker-v2` / `mxbai-rerank-large` | bge 中文最稳 |
| 推理服务 | **HuggingFace TEI** `--model-id BAAI/bge-reranker-v2-m3 --max-batch-tokens 16384` | Triton Inference Server / vLLM | TEI Rust 实现，比 Triton Python backend 快 1.5-2× |
| 客户端 | `httpx.AsyncClient` POST `/rerank` | 自封 grpc | TEI 是 REST，简单 |
| 动态 batching | TEI 自带 `--max-concurrent-requests 256` | 自写 asyncio queue + window | TEI 内置已经够，避免重复造轮子 |
| FP16 推理 | TEI 默认 FP16；自建则 `torch.amp.autocast("cuda", dtype=torch.float16)` | INT8 量化 `bitsandbytes` | FP16 性能/精度甜点 |
| GPU 选型 | 4× T4 / 2× A10 / 1× A100 | L40S | T4 性价比最高，单卡 ~30ms/100 doc |
| 训练框架（如要 fine-tune） | `FlagEmbedding`（BAAI 官方仓库，含 reranker 训练脚本） | `sentence-transformers.CrossEncoder` | FlagEmbedding 是 bge 系列原厂代码 |
| Loss 函数 | Contrastive / Margin Ranking Loss | InfoNCE | margin=0.2 是经验值 |
| 负例挖掘 | In-batch + Hard negatives（用 v1 reranker 的 Top-K 错答案）+ Random | random only | hard negatives 提升最大 |
| 数据来源 | 标注集（query, gold_doc, hard_negative）2-5k 三元组 | 自动从线上 trace 挖 | 详见 [Vector DB + Reranker §3](../review/07-vector-db-reranker.md) |
| 业务约束 boost | 自建 score = rerank + source_authority + recency + risk_keyword | 直接乘加权 | 在 rerank 后做线性叠加，简单可控 |
| 缓存层 | Redis `(query_hash, passage_ids_joined) → scores` 15min TTL | local LRU | 命中率 ~20-30%，节省最大 |
| Shadow eval | 主路 v1，影子 v2 异步对比 | 直接 A/B | 重新训完必跑 shadow |
| 监控 | Prometheus `reranker_inference_latency_seconds_p99` / `reranker_gpu_utilization` | Datadog | 单独 dashboard |
| 压测 | `locust` 或 `k6` 模拟 P95 80ms 目标 | wrk | 提前发现 batch fill 不足问题 |

**TEI 一行 docker 起 reranker**：

```bash
docker run --gpus all -p 8080:80 \
  -v $PWD/data:/data \
  ghcr.io/huggingface/text-embeddings-inference:1.7 \
  --model-id BAAI/bge-reranker-v2-m3 \
  --max-batch-tokens 16384 \
  --max-concurrent-requests 256
```

```python
import httpx

async def rerank(query: str, passages: list[str]) -> list[float]:
    async with httpx.AsyncClient(base_url="http://reranker:8080") as cli:
        r = await cli.post("/rerank", json={"query": query, "texts": passages, "raw_scores": False})
        r.raise_for_status()
        return [item["score"] for item in r.json()]
```

**FlagEmbedding fine-tune 三元组样例**（如要 +5pp）：

```python
# 数据格式（jsonl）：每行一条 (query, positive_passage, negative_passages)
# {"query": "氯雷他定能否与西药一起吃", "pos": ["...禁忌症..."], "neg": ["...抗生素..."]}

# 训练命令（FlagEmbedding 仓库内）
# torchrun --nproc_per_node 2 -m FlagEmbedding.reranker.run \
#   --model_name_or_path BAAI/bge-reranker-large \
#   --train_data ./medical_triplets.jsonl \
#   --output_dir ./bge-reranker-medical \
#   --num_train_epochs 3 --per_device_train_batch_size 4 \
#   --learning_rate 6e-5 --max_len 512 --weight_decay 0.01
```

引用：

- TEI: <https://github.com/huggingface/text-embeddings-inference>
- FlagEmbedding (BAAI): <https://github.com/FlagOpen/FlagEmbedding>
- BGE Reranker 模型卡: <https://bge-model.com/bge/bge_reranker.html>

详细 RAG 工程见 [RAG 混合检索 + Rerank 工程实现](./notes/rag-hybrid-retrieval.md) 和 [Vector DB + Reranker 深入](../review/07-vector-db-reranker.md)。

---

### Q5：引用溯源具体怎么做？怎么避免「答案对但引用错」？

**核心论点：** 引用溯源不是「在答案后面附几个链接」，而是 **「答案的每个关键医学事实都必须能映射到具体的检索片段」**。

**两种方式对比：**

| 方案 | 做法 | 问题 |
|---|---|---|
| Post-hoc 引用 | 生成完答案，再用相似度匹配回 source | 容易「答案 ≠ 引用」 |
| 强制结构化引用 | 生成时就要求每个 fact 带 source_id | 准确但 token 成本高 |

**我们的做法（介于两者之间）：**

```python
class CitedAnswer(BaseModel):
    summary: str
    facts: list[Fact]

class Fact(BaseModel):
    text: str
    source_ids: list[str]   # 来自哪些 chunk
    confidence: Literal["high", "medium", "low"]
    risk: Literal["safe", "warn", "danger"]

PROMPT = """
你是医学问答助手。基于下面的检索片段回答用户问题。
每个医学事实必须标注来源 source_ids。
对证据不足的部分，必须明确说「现有资料不足以判断」。
对高风险结论必须标 risk="danger"。

[检索片段]
{passages_with_ids}

[用户问题]
{query}

请用 JSON 输出 CitedAnswer 结构。
"""
```

**校验后处理：**

```python
def validate_citations(answer: CitedAnswer, passages: dict[str, str]) -> ValidationResult:
    issues = []
    for fact in answer.facts:
        # 1. 引用 id 必须存在于检索集合
        if not all(sid in passages for sid in fact.source_ids):
            issues.append(InvalidSourceId(fact))
        # 2. fact 文本要和被引用 chunk 有词汇/语义重叠
        if not has_overlap(fact.text, [passages[sid] for sid in fact.source_ids]):
            issues.append(NoEvidence(fact))
    return ValidationResult(ok=not issues, issues=issues)
```

**没引用 / 引用错的处理：**

- 引用不合法 → 重新让 LLM 修正一次，第二次仍不合法 → 转「无法回答」模板。
- 高风险 fact 但 confidence=low → 直接转 HITL / 建议线下就医。

> **发散 tip：**
> - 「引用溯源最大的价值不是给用户看，而是给 **评测和审计** 看。我们把每条线上对话的引用合法率打成指标，每周看长尾。」
> - 「这块和 Anthropic Claude 的 citations API 思路一致——他们也是要求模型显式输出 source span，再 server 端校验。」

#### 🛠 Citation 实现的具体技术方案

| 维度 | 主推方案 | 备选 | 备注 |
|---|---|---|---|
| 输出 schema | `pydantic` `CitedAnswer { facts: list[Fact { text, source_ids, confidence, risk }] }` | dataclass + jsonschema | Pydantic 直接给 LLM 用 |
| 结构化输出 | `instructor.from_litellm` + `response_model=CitedAnswer` | langchain `with_structured_output` | instructor 自带 retry-with-feedback |
| Anthropic 原生 citations | Claude `client.messages.create(..., citations=...)` API（2025 GA） | 自建 | Claude server 端校验 span，最稳 |
| 词汇重叠校验 | `rapidfuzz.fuzz.partial_ratio(fact_text, passage_text) > 70` | `difflib.SequenceMatcher` | rapidfuzz 是 fuzzywuzzy 的快 10× 版 |
| 语义重叠校验 | `sentence-transformers` cosine `> 0.65` 或自建 NLI | nli-deberta-v3 | 词汇重叠不够时用 |
| NLI 蕴含校验 | `huggingface` `MoritzLaurer/mDeBERTa-v3-base-mnli-xnli` zero-shot NLI | 自训 | "fact 是否被 passage 蕴含"判断 |
| RAG faithfulness | `ragas` `faithfulness` 指标 | `trulens-eval` | RAG 业界标准评测库 |
| Citation 字段约束 | `Literal["high", "medium", "low"]` + `Field(min_length=1)` | str + validator | 强类型让模型不能瞎写 |
| Source ID 存在校验 | `set(fact.source_ids) <= set(passage_ids)` | 手写 for | 简单胜过复杂 |
| 引用失败重试 | `tenacity.retry(stop_after_attempt=2)` + 错误塞回 prompt | instructor 自动 | 第二次塞 ValidationError，第三次走 "资料不足" 模板 |
| Span 级引用（高级） | Anthropic citations 输出 `cited_text: str + start_char: int + end_char: int` | 自建索引匹配 | 精确到字符位置，审计无敌 |
| 抽样人审 | Label Studio + ETL pipeline 每天采 50 条 | 自建 admin UI | 给临床 + 工程双重审 |

**关键代码：instructor + Pydantic 强校验**

```python
import instructor
from litellm import acompletion
from pydantic import BaseModel, Field, model_validator
from typing import Literal

aclient = instructor.from_litellm(acompletion, mode=instructor.Mode.JSON)

class Fact(BaseModel):
    text: str = Field(min_length=5, max_length=500)
    source_ids: list[str] = Field(min_length=1)
    confidence: Literal["high", "medium", "low"]
    risk: Literal["safe", "warn", "danger"]

class CitedAnswer(BaseModel):
    summary: str
    facts: list[Fact]
    insufficient_evidence: bool = False        # 资料不足时模型自标
    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def ensure_facts_when_not_insufficient(self):
        if not self.insufficient_evidence and len(self.facts) == 0:
            raise ValueError("非'资料不足'时必须至少给一条 fact")
        return self


async def generate_cited_answer(query: str, passages: list[dict]) -> CitedAnswer:
    allowed_ids = {p["id"] for p in passages}
    answer: CitedAnswer = await aclient.chat.completions.create(
        model="gemini/gemini-2.5-pro",
        response_model=CitedAnswer,
        messages=[{"role": "user", "content": render_prompt(query, passages)}],
        max_retries=2,                          # instructor 自动 retry-with-feedback
    )
    # 二次校验：source_ids 必须在 allowed_ids 集合
    for fact in answer.facts:
        if not set(fact.source_ids) <= allowed_ids:
            raise ValueError(f"非法 source_id: {set(fact.source_ids) - allowed_ids}")
    return answer
```

**用 rapidfuzz 做词汇重叠 + NLI 双校验**：

```python
from rapidfuzz.fuzz import partial_ratio
from transformers import pipeline

nli = pipeline("zero-shot-classification",
               model="MoritzLaurer/mDeBERTa-v3-base-mnli-xnli")

def verify_fact(fact_text: str, passages: list[str]) -> tuple[bool, str]:
    # 1. 词汇重叠：> 70 直接通过
    for p in passages:
        if partial_ratio(fact_text, p) > 70:
            return True, "lexical"
    # 2. NLI 蕴含：候选 passage 拼接后做"是否蕴含 fact"判断
    joined = "\n".join(passages)[:2000]
    res = nli(joined, candidate_labels=[fact_text, f"NOT: {fact_text}"], multi_label=False)
    return res["labels"][0] == fact_text and res["scores"][0] > 0.65, "nli"
```

**Anthropic citations API（Claude 4 起 GA）—— 最干净的方案**：

```python
import anthropic
client = anthropic.Anthropic()

msg = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1500,
    system="你是医学问答助手。只根据 documents 中的内容回答。",
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "document",
                "source": {"type": "text", "media_type": "text/plain",
                           "data": passage_text},
                "title": "急性胰腺炎临床指南",
                "context": "来自人卫版内科学",
                "citations": {"enabled": True},
            },
            {"type": "text", "text": "急性胰腺炎主要症状是什么？"},
        ],
    }],
)
# msg.content[i].citations 自动带 cited_text + start_char + end_char
```

引用：

- Anthropic Citations API: <https://docs.anthropic.com/en/docs/build-with-claude/citations>
- ragas faithfulness: <https://docs.ragas.io/en/stable/concepts/metrics/faithfulness/>
- rapidfuzz: <https://github.com/rapidfuzz/RapidFuzz>
- mDeBERTa-v3 NLI: <https://huggingface.co/MoritzLaurer/mDeBERTa-v3-base-mnli-xnli>

---

### Q6：评测集怎么建？千级标注怎么不偏？

**评测集组成（关键的「分桶 + 加权」思路）：**

| 桶 | 数量 | 来源 | 难度 |
|---|---|---|---|
| 简单 FAQ | 200 | 高频 query | 低（保底） |
| 鉴别问题 | 200 | 易混淆症状 / 药品 | 中 |
| 长尾专业 | 150 | 罕见病、特定剂量 | 高 |
| 报告解读 | 100 | 真实化验单（脱敏） | 中 |
| 高风险陷阱 | 200 | 急症 / 自杀 / 处方 / 孕妇 / 儿童 | **必拦** |
| 边界 / 拒答 | 150 | 闲聊 / 非医疗 / 法律咨询 | 必拒 |
| **合计** | **1000** | | |

**指标分层：**

- **Retrieval eval**：Recall@3 / Recall@10 / MRR / 按桶分别看。
- **Answer eval**：事实正确性（人工） / 引用合法率（自动） / 风险拦截召回率（自动）。
- **风险加权指标**：高风险拦截漏一个 = 简单 FAQ 错 100 个。Dashboard 主指标改成 **risk-weighted error rate**，而不是 simple accuracy。

**Badcase 回流闭环：**

```
线上日志 → 低置信样本（confidence < 0.5）+ 用户负反馈 + 抽样人工审核
  → 标注（3 人投票）→ 加入评测集 → 触发评测失败分析
  → 看是召回失败 / rerank 失败 / 生成失败 / 风控漏判
  → 对应修：扩 chunk / 调 rerank / 改 prompt / 加规则
  → A/B 验证 → 上线
```

> **发散 tip：**
> - 「我特别想强调风险加权——这是医疗 RAG 和通用 RAG 最大的差异。可以由这块引到『Anthropic eval framework 里的 dimension-based grading』。」
> - 「评测集每季度做一次『反向偏差检查』——人工抽 50 条看分布是否还和线上一致，如果偏离就重采样。」

#### 🛠 评测平台 + 标注 + 闭环的全栈方案

| 维度 | 主推 | 备选 | 备注 |
|---|---|---|---|
| 标注平台 | **Label Studio**（自托管 + 中文 UI 好） | Argilla / Prodigy / doccano | Label Studio 开源、ML backend 接口完整 |
| 标注一致性 | `sklearn.metrics.cohen_kappa_score` 算 IAA（Inter-Annotator Agreement） | Krippendorff's alpha (`krippendorff` lib) | kappa < 0.6 → 标注规范要返工 |
| 分层采样 | `sklearn.model_selection.StratifiedShuffleSplit` + 桶 weight 配置 | pandas groupby 手撸 | 保证 6 桶按业务比例采 |
| Retrieval eval | 自建 + `ranx`（开源 IR eval 库）算 Recall@K / MRR / nDCG | `ir_measures` / `pytrec_eval` | ranx 是 Python IR 评测明星 |
| Answer eval (RAG) | **`ragas`** `faithfulness` / `answer_relevancy` / `context_recall` | `trulens-eval` / `phoenix.evals` | ragas 是 RAG 评测标杆 |
| LLM-as-judge | `langfuse.score()` 接口 + Claude/GPT-4 作为 judge model | `deepeval.metrics.GEval` | langfuse 自动落库 + UI 比较 |
| Judge 校准 | 月度抽 50 条人工 vs judge 对比 + `cohen_kappa_score` | manual | 防 judge drift |
| Agent trajectory eval | `inspect-ai`（UK AISI）/ langsmith trajectory eval | 自建 | trajectory grader 看中间步 |
| Eval dataset 版本化 | langfuse Datasets / langsmith Datasets / git + jsonl | manual S3 | langfuse UI 编辑 + diff |
| 跑评测 | `pytest` + `pytest-xdist` 并发 + `pytest-recording` mock LLM | shell + python script | pytest-xdist 并发跑 1k 条 ~5min |
| Regression 进 CI | GitHub Actions / GitLab CI 每次 merge 跑 100 条 regression | 手动 | 阈值不通过自动 block |
| 风险加权指标 | 自建 `risk_weighted_error_rate = Σ(error_i × weight_i) / Σ weight_i` | scikit-learn `sample_weight` | 高风险错 × 100，简单错 × 1 |
| 失败原因分类 | 自建 7 类 enum（召回/重排/上下文/生成/引用/风控/拒答）+ pandas pivot | manual | dashboard 按类看趋势 |
| Badcase 回流 | `arq` 定时任务 + Postgres `eval_dataset` 表 + Label Studio task webhook | celery | arq async 原生省心 |
| 偏差检测 | 月度 `ks_2samp`（Kolmogorov-Smirnov）对比线上 vs 评测集意图分布 | manual chi-square | 偏离 > 0.1 触发重采样 |

**ragas faithfulness 一行算的样例**：

```python
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_recall

ds = Dataset.from_dict({
    "question":     [q["text"] for q in cases],
    "answer":       [r["answer"] for r in results],
    "contexts":     [r["passages"] for r in results],
    "ground_truth": [q["gold_answer"] for q in cases],
})

scores = evaluate(ds, metrics=[faithfulness, answer_relevancy, context_recall])
print(scores)        # {'faithfulness': 0.91, 'answer_relevancy': 0.86, 'context_recall': 0.79}
```

**风险加权 error rate 实战代码**：

```python
import pandas as pd

WEIGHTS = {
    "emergency_miss":      100,    # 漏拦急症
    "prescription_miss":    50,    # 漏拦处方建议
    "dosage_wrong":         50,
    "citation_invalid":     10,
    "retrieval_miss":        3,
    "tone_off":              1,
}

df = pd.read_json("eval_results.jsonl", lines=True)
df["weight"] = df["error_type"].map(WEIGHTS).fillna(1)
df["weighted_err"] = (df["pass"] == False).astype(int) * df["weight"]

rwer = df["weighted_err"].sum() / df["weight"].sum()
print(f"Risk-weighted Error Rate: {rwer:.4f}")
```

**为什么不用 simple accuracy 当主指标**：医疗场景 1 个急症漏判的代价 = 100 个简单 FAQ 错答。**accuracy 会把急症漏判稀释成噪声**，dashboard 看不到危险。风险加权直接对齐业务代价。

引用：

- Label Studio: <https://labelstud.io/>
- ragas: <https://github.com/explodinggradients/ragas>
- ranx: <https://github.com/AmenRa/ranx>
- inspect-ai (UK AISI): <https://inspect.aisi.org.uk/>
- Anthropic Demystifying Evals: <https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents>

---

## 3. 医疗安全：宁可错杀，不可放过

### Q7：高风险问题怎么做 98%+ 召回率？

**核心论点：** **风险拦截看召回率，不看准确率**。宁可多拦（误判可以转人工解释），不能漏（漏一个出医疗事故）。

**两层风险识别：**

```python
# 第一层：规则（高置信、低成本、不能漏）
HIGH_RISK_PATTERNS = {
    "emergency": [
        r"(胸痛|胸闷).*?(出汗|放射|压榨)",   # 心梗
        r"突然.{0,5}(头痛|麻木|失语|偏瘫)",   # 卒中
        r"自杀|想死|不想活",
        r"过量|超量|吃了.{0,5}\d+\s*[片粒颗]",
    ],
    "prescription": [r"开.{0,3}处方|代替.{0,3}医生|不去医院"],
    "pediatric": [r"宝宝|婴儿|小孩|儿童.*(剂量|多少|能吃)"],
    "pregnancy": [r"(怀孕|孕妇|早孕).*(用药|能吃|吃)"],
    "dosage": [r"\d+\s*(mg|毫克|片|粒).*(行不行|能不能|多吗)"],
}

def rule_risk_check(text: str) -> list[RiskFlag]:
    flags = []
    for category, patterns in HIGH_RISK_PATTERNS.items():
        for p in patterns:
            if re.search(p, text):
                flags.append(RiskFlag(category=category, source="rule", confidence=0.95))
    return flags
```

第二层：LLM 兜底处理「隐晦组合」和「上下文累积」：

```python
RISK_PROMPT = """
你是医疗风险识别助手。判断用户输入是否属于以下风险类别：
- emergency（急症体征）
- prescription（要求开处方）
- pediatric / pregnancy（儿童 / 孕妇用药）
- self_harm（自伤）
- dangerous_dosage（异常剂量）
注意：
1. 单一症状不一定高危，但症状组合（如『胸闷 + 冷汗 + 持续 30 分钟』）必须标 emergency。
2. 输出 JSON：{risk: [...], confidence: 0-1, reason: ...}
"""
```

**两层合并 + 分级处理：**

```python
def safety_gate(user_msg: str, ctx: SessionContext) -> SafetyDecision:
    rule_flags = rule_risk_check(user_msg)
    llm_flags = llm_risk_check(user_msg, ctx)
    flags = merge(rule_flags, llm_flags)

    if any(f.category == "emergency" for f in flags):
        return SafetyDecision(
            action="emergency_redirect",
            message="您描述的症状可能需要立即就医，建议立即拨打 120 或前往就近急诊。",
            block_rag=True,
        )
    if any(f.category in ("prescription", "dangerous_dosage") for f in flags):
        return SafetyDecision(
            action="advise_offline",
            message="此问题涉及处方药使用，建议咨询医生或药师，本助手不能替代医生判断。",
            block_rag=False,  # RAG 仍可回答科普性内容
        )
    return SafetyDecision(action="proceed")
```

**98% 召回率怎么测？**

- 评测集 200 条高风险 case（每类 30-40 条）。
- 指标：高风险拦截召回率 ≥ 98%（漏拦超过 4 条触发告警）。
- 误拦（false positive）放在次要指标，但需要可控（< 15%，否则用户体验崩）。

> **发散 tip：**
> - 「医疗 LLM 的安全策略和通用安全不一样：通用 LLM 怕『说脏话』，医疗 LLM 怕『说错诊断 + 给错剂量』。所以我们的拦截策略偏向 medical content safety 而不是 toxic language safety。」
> - 「我看过 Anthropic 的 constitutional AI 思路——他们的拒答是模型自洽，我们这块更像 OpenAI 的 moderation API + 业务规则叠加。」

#### 🛠 安全两层 + 兜底的具体方案

| 维度 | 主推方案 | 备选 | 备注 |
|---|---|---|---|
| 高危词多模匹配 | `pyahocorasick`（Aho-Corasick 自动机）+ 热更新词典 | flashtext / re.findall 循环 | 10w+ 词典 P99 < 100µs |
| 正则模式 | `regex` 包（Unicode property `\p{Han}` 支持）+ `re2` 防 ReDoS | 标准 `re` | re2 防恶意输入正则爆炸 |
| 词典热更新 | etcd watch / Redis pub-sub / git webhook | 文件 mtime 轮询 | etcd 最快、强一致 |
| LLM 风险分类 | ERNIE `ernie-bot-turbo` via `qianfan` SDK + instructor 结构化输出 | OpenAI moderation API（中文弱）| ERNIE 中文医学敏感强 |
| Guardrails 框架 | `guardrails-ai` 0.5+ 自建 medical validators | `NeMo Guardrails`（NVIDIA） | guardrails-ai 装饰器风格优雅 |
| 急症体征识别 | 规则模式 + LLM 上下文累积判断 | 自训 BERT 多分类 | 模式覆盖明面，LLM 兜底隐晦组合 |
| 自伤识别 | OpenAI moderation API `self-harm` 类别 + 中文规则 + 心理热线模板 | Perspective API（谷歌） | 自伤场景必须立即降级到 12356 心理热线 |
| 上下文累积风险 | LangGraph state 里 `risk_flags: list[RiskFlag]` 跨轮累计 / Redis sorted set | manual | "胸闷 + 后续大汗 + 持续 30 分钟" 三轮组合命中 |
| 处方 / 剂量识别 | regex `\d+\s*(mg\|毫克\|片\|粒)` + 上下文判断（是否在询问） | 自训 | 数字必拦，问"能不能这样吃"才走风控 |
| 决策合并 | 自建 `merge(rule_flags, llm_flags) -> SafetyDecision` + 优先级表 | 多决策树 | 规则优先（高置信）→ LLM 兜底（隐晦） |
| 拒答模板 | `Jinja2` 模板 + 模板版本号 | 字符串拼接 | 模板版本进 git，PR review |
| 评测集 | 200 条高风险 case × 5 类（emergency/prescription/dosage/self_harm/pediatric） | 自建 | 每类 30-40 条 |
| 召回率监控 | Prometheus + Grafana alert：`safety_recall < 0.98` 持续 5min 立刻 page | 自建 alert | 漏 1 个上 dashboard |
| 误拦率监控 | 同上：`safety_precision < 0.85` 警告 | — | 误拦太多用户跑光 |
| HITL 通道 | Lark / 飞书 webhook + 人工复核工单系统 | 自建 admin | 复核员 SLA 30min 内回复 |
| 审计日志 | Postgres 单独 `safety_event` 表 + 不删 + WORM bucket 备份 | ELK | 合规要求医疗对话审计可追溯 |

**guardrails-ai 写医学 validator 的样例**：

```python
from guardrails import Guard
from guardrails.validators import Validator, register_validator, PassResult, FailResult

@register_validator(name="medical/no-dosage-recommendation", data_type="string")
class NoDosageRecommendation(Validator):
    def validate(self, value: str, metadata: dict):
        import re
        # 拒绝"建议 X mg / 片 / 粒"这类剂量推荐
        if re.search(r"(建议|应当|可以).{0,5}\d+\s*(mg|毫克|片|粒)", value):
            return FailResult(error_message="医学问答不能给出剂量推荐")
        return PassResult()

guard = Guard.from_string(
    validators=[NoDosageRecommendation()],
    description="医疗安全 guard",
)

raw_answer = await llm.generate(...)
validated = guard.parse(raw_answer)              # 失败时抛异常或走 reask
```

**ERNIE 风险分类 + instructor 结构化输出**：

```python
import instructor, qianfan
from pydantic import BaseModel
from typing import Literal

class RiskReport(BaseModel):
    risk: list[Literal["emergency", "prescription", "pediatric",
                       "pregnancy", "self_harm", "dangerous_dosage"]]
    confidence: float
    reason: str

# qianfan SDK 兼容 OpenAI 协议，instructor 可直接套
client = instructor.from_openai(
    qianfan.Qianfan(model="ernie-bot-turbo"),
    mode=instructor.Mode.JSON,
)

async def llm_risk_check(user_msg: str, ctx_summary: str) -> RiskReport:
    return await client.chat.completions.create(
        model="ernie-bot-turbo",
        response_model=RiskReport,
        messages=[
            {"role": "system", "content": RISK_PROMPT},
            {"role": "user", "content": f"上下文：{ctx_summary}\n本轮：{user_msg}"},
        ],
        max_retries=1,
    )
```

**为什么不直接用 OpenAI Moderation API 一把梭**：

1. 中文敏感词召回弱（尤其医学领域）。
2. 没有"急症体征 / 剂量推荐 / 处方建议"这种垂直分类。
3. 上下文累积识别能力差（只看单轮 API）。

引用：

- guardrails-ai: <https://github.com/guardrails-ai/guardrails>
- NeMo Guardrails: <https://github.com/NVIDIA/NeMo-Guardrails>
- Qianfan SDK（百度文心）: <https://github.com/baidubce/bce-qianfan-sdk>
- OpenAI Moderation API: <https://platform.openai.com/docs/guides/moderation>

---

### Q8：医疗幻觉怎么降？

**核心论点：** 幻觉是召回、生成、风控、评测四层叠出来的结果，**降幻觉就是降每一层的失败率**。

| 层 | 主要做法 |
|---|---|
| 召回 | 知识源权威 + chunk 粒度合适 + 混合检索 + 垂直库路由 |
| 生成 | 强制引用溯源 + 「证据不足时不回答」+ 关键事实结构化输出 |
| 风控 | 双层风险识别 + 急症 / 处方 / 剂量分级拒答 |
| 评测 | 高风险样本独立桶 + Badcase 回流 + 人工抽审 |

**生成层「证据不足时不回答」的具体做法：**

```python
PROMPT_HEAD = """
回答规则（必须遵守）：
1. 只用「检索片段」里的信息，不能凭模型先验回答。
2. 检索片段不足以回答时，必须说「目前资料不足，建议线下就医」。
3. 关键医学事实必须标注 source_ids。
4. 不能给出剂量、不能给出处方建议、不能给出诊断结论。
"""
```

**幻觉检测线上策略：**

- 答案生成后，再过一次「事实校验 LLM-as-judge」抽样 5%，判断答案中所有 medical claim 是否被引用片段支持。
- 不支持的 claim → 降级为「补充信息」或重新生成。

> **发散 tip：**
> - 「Anthropic 在 demystifying evals 里强调 LLM-as-judge 必须定期人工校准，否则 judge 模型自己也会 drift。我们每月抽 50 条 judge 结果人工复核。」

#### 🛠 降幻觉四层每层用什么

| 层 | 主推方案 | 备注 |
|---|---|---|
| 召回：知识源权威分层 | metadata `authority` 字段 + Qdrant payload filter（`authority IN [clinical_guideline, national_drug_administration]`）| 详见 [Chunking §6](../review/11-chunking-strategy.md) |
| 召回：chunk 边界保留 | 结构化字段切分（药品按"适应症/禁忌/用法用量/孕妇及哺乳期"独立成 chunk）| 详见 Q5 的 source_id 跟踪 |
| 召回：Contextual Retrieval | 离线 Claude Haiku + prompt caching 给每个 chunk 加 doc-level 摘要前缀 | Anthropic 实测 fail rate -35% |
| 生成：禁止凭先验 | system prompt 写死 "只用检索片段，不能凭模型先验" + `temperature=0.1` | 别开 temperature=0，会陷入死循环措辞 |
| 生成：低证据自我承认 | Pydantic schema `insufficient_evidence: bool` + `Field` 必填 | 模型必须显式标 |
| 生成：禁止剂量/诊断 | guardrails-ai validator 黑名单（见 Q7）| `NoDosageRecommendation` / `NoDiagnosisConclusion` validator |
| 生成：strict JSON schema | OpenAI `client.beta.chat.completions.parse(strict=True)` / instructor JSON mode | 见 [ArtArch §Q9 Structured Output 全光谱](./artarch-ai.md#q9json-schema-约束--llm-结构化输出怎么做才稳) |
| 风控：双层（规则 + LLM） | 见 Q7 |
| 评测：faithfulness 自动 | `ragas.metrics.faithfulness` 抽样 5% 评 | 落 langfuse 看 trend |
| 评测：LLM-as-judge | Claude Opus / GPT-5 作 judge，prompt "答案中每个 medical claim 是否被引用片段支持" | judge 模型必须比生成模型强 |
| Judge 校准 | 月度抽 50 条人工对比 + `cohen_kappa_score` < 0.7 触发重设计 prompt | 防 judge drift |
| 离线评测 → 线上 shadow | 1% 流量 shadow，新 prompt / 模型必跑 1 周 | 见 [ArtArch Q12 评测分层](./artarch-ai.md) |
| Trace 追溯 | langfuse trace `prompt_version + retrieval_passages + faithfulness_score` 全打通 | 出问题能立刻回放 |

**RAG faithfulness 怎么具体打分（ragas 工作原理一句话）**：

1. 把 answer 拆成原子 claim（一句一个事实）。
2. 对每个 claim，让 LLM 判断 "given these contexts, is this claim faithful (supported)?"
3. faithfulness = 被支持的 claim 数 / 总 claim 数。

这套抽样 5% 线上跑，每天 ~5k 条 trace 自动评分，**faithfulness < 0.85 的 case 入 review queue**。

引用：

- ragas faithfulness 原理: <https://docs.ragas.io/en/stable/concepts/metrics/faithfulness/>
- Anthropic Demystifying Evals: <https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents>
- Anthropic Citations API（最优解之一）: <https://docs.anthropic.com/en/docs/build-with-claude/citations>

---

## 4. 工程化：怎么撑住日均 10 万级 query

### Q9：日均十万级 query，怎么保 SLA？

**关键工程化点：**

1. **多模型路由 + Fallback**：文心 ERNIE 主、内部小模型兜底（intent / safety 用小模型省钱）。
2. **缓存**：
   - **Embedding 缓存**：相同 query 的 embedding 30 天 Redis 缓存。
   - **检索结果缓存**：相同 (query_hash, kb_version) 的 Top-K 30 分钟缓存。
   - **不缓存**：最终生成结果（会话上下文相关），但缓存「FAQ 模板答案」。
3. **限流降级**：
   - 用户级 QPS 限流（防滥用 / 爬虫）。
   - 总 LLM 调用预算超阈值时，自动把「闲聊」「重复 query」打到模板答案。
4. **超时降级**：
   - LLM 5s 超时 → fallback 模型。
   - Fallback 也超时 → 模板回复 + trace 标记。
5. **Trace + A/B**：
   - 每条 query 一个 trace_id，落 ES + Hadoop。
   - A/B 框架按 user_id 分桶，灰度策略变更不影响主流量。

**P95 延迟分解：**

```
总延迟 P95: 2.2s
├─ Intent classification: 80ms (规则) / 200ms (LLM)
├─ Hybrid retrieve:       180ms (BM25 + Faiss 并行)
├─ Reranker:              80ms (batched)
├─ LLM generation:        1.6s (含 streaming)
└─ Safety post-check:     60ms (抽样)
```

> **发散 tip：**
> - 「这套架构里特别值得聊的是缓存层级：从 embedding cache → retrieval cache → template cache 一层层往上，命中率分别是 30% / 12% / 5%，合并节省 LLM 调用约 40%。」

#### 🛠 撑住 10 万 query/天的具体技术栈

| 维度 | 主推方案 | 备选 | 备注 |
|---|---|---|---|
| Web 框架 | FastAPI 0.115+ + `uvicorn[standard]` workers=8 | Litestar | Pydantic v2 原生 + async-first |
| 异步 DB pool | `asyncpg` + `sqlalchemy[asyncio]` 2.0 `create_async_engine(pool_size=20)` | psycopg3 | asyncpg 性能最强 |
| 缓存层 | `redis.asyncio` 5.x + `aiocache` 多级 | memcached | Redis 8 多模 + 我们已有集群 |
| 缓存 key 设计 | `{cache_type}:{sha1(query + kb_version + filters)}` | naive query | SHA1 防 key 过长 |
| Embedding 缓存 | Redis 30d TTL，value 用 `orjson.dumps` + `zstandard` 压缩 | pickle | orjson + zstd 比 pickle 快 + 压缩比好 |
| Retrieval 结果缓存 | Redis 10min TTL，value 是 doc_ids list | manual | 命中率 ~12% |
| Template 答案缓存 | Redis 1h TTL + FAQ 模板系统 | manual | 命中率 ~5%，但全 short-circuit 不调 LLM |
| 限流 | `slowapi`（FastAPI 集成）+ Redis token bucket | aiolimiter | 用户级 + IP 级双层 |
| Provider 限流 | `litellm.Router(rpm_limit=..., tpm_limit=...)` | manual | Router 自带 |
| 重试 | `tenacity` `wait_exponential_jitter` + `retry_if_exception_type` | backoff | 装饰器 |
| 熔断 | `pybreaker` `CircuitBreaker(fail_max=10, reset_timeout=30)` | aiocircuitbreaker | error rate > 30% 跳熔断 |
| 多 Provider Fallback | `litellm.Router` 配 `fallbacks: {planner: [openai/gpt-5]}` | manual | 见 [ArtArch Q14](./artarch-ai.md#q14怎么做多模型路由--fallback) |
| Token 计数 | `tiktoken`（OpenAI）+ `qianfan.SDK.count_tokens`（ERNIE）+ `anthropic.count_tokens` | 估算 | 各家分别精算 |
| Cost 计算 | `litellm.completion_cost(completion_response=resp)` | 自建 pricing.yaml | 实时价格表内置 |
| 限速降级模板 | Jinja2 + 100 条 FAQ 模板 | 字符串 | 总预算超阈值时短路 |
| 后台任务 | `arq`（Redis-based async） | celery / dramatiq | 异步 trace 落库、warming cache |
| Trace 后端 | Langfuse 自托管 2.x + LangChain `CallbackHandler` 直接 hook | langsmith | 自托管 + open source |
| 日志 | `structlog` JSON 输出 + Loki / ELK | loguru | 结构化 + trace_id 关联 |
| 监控 | `prometheus-client` + Grafana / Apache Skywalking | Datadog | Prometheus 标签别过多 |
| 健康检查 | FastAPI `/healthz` + `/readyz` + 子组件 dependency check | manual | k8s liveness / readiness 一一对应 |
| 压测 | `locust`（Python，易写）/ `k6`（JavaScript，性能强）| wrk | locust 写场景方便 |
| ASGI worker | uvicorn `--workers $(nproc * 2)` + gunicorn `--worker-class uvicorn.workers.UvicornWorker` | hypercorn | gunicorn 是 prod 事实标准 |
| 部署 | K8s + HPA（CPU + RPS 双指标）+ PodDisruptionBudget | 裸 docker compose | 高并发必须 K8s |
| Service mesh / SLO | Istio + Grafana SLO dashboard / 自建 Prometheus alert | Linkerd | 99.9% SLA 需要熔断 + 流量控制 |
| Chaos 测试 | Chaos Mesh / `litmus` 定期注入网络抖动 | manual | 验证 fallback 真有效 |

**locust 压测脚本骨架**：

```python
from locust import HttpUser, task, between

class HealthBotUser(HttpUser):
    wait_time = between(1, 3)

    @task(7)                                  # 70% 流量是症状咨询
    def symptom(self):
        self.client.post("/v1/chat", json={"text": "胸闷气短两天了"})

    @task(2)                                  # 20% 药品问答
    def drug(self):
        self.client.post("/v1/chat", json={"text": "氯雷他定的禁忌症"})

    @task(1)                                  # 10% 高风险（必须被拦）
    def emergency(self):
        r = self.client.post("/v1/chat", json={"text": "胸口剧痛冒冷汗"})
        assert "急诊" in r.json().get("answer", ""), "急症必须被拦"
```

跑命令：`locust -f loadtest.py --headless -u 200 -r 20 --run-time 5m --host https://api.health`。

引用：

- locust: <https://locust.io/>
- arq: <https://github.com/python-arq/arq>
- LiteLLM Router: <https://docs.litellm.ai/docs/routing>
- Anthropic prompt caching（embedding cache 思想类似）: <https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching>

---

### Q10：怎么做 Prompt 版本管理？

**关键三件套：**

1. **Prompt 用代码管理（不是数据库）**：每个 prompt 是 `.j2` 模板文件，进 git。
2. **版本号 + Diff 评测**：每次改 prompt，CI 跑评测集对比新旧版本通过率。
3. **A/B 灰度**：新 prompt 先 5% 流量，看 trace + 评测指标，OK 再放量。

```python
# Prompt 注册
@register_prompt(name="diagnose.symptom_followup", version="v3.2.1")
def build_followup_prompt(state: SymptomContext) -> str:
    return env.get_template("symptom_followup.j2").render(state=state)

# Trace 里带 prompt_version，事后能精确回放
```

> **发散 tip：**
> - 「Prompt 版本化是 LLM 工程独有的事情，类似 sklearn model registry。我们后来引入 Langfuse 做 prompt management，效果更好。」

#### 🛠 Prompt 版本管理的具体方案

| 维度 | 主推 | 备选 | 备注 |
|---|---|---|---|
| Prompt 模板引擎 | `Jinja2` 3.x（业界标准）| `string.Template` / `chevron` (mustache) | Jinja2 支持 if / for / filter |
| 模板文件位置 | git 仓库 `prompts/*.j2` | DB / Notion | 进 git 强制 review |
| 版本号管理 | semver `v3.2.1` + git tag + 模板文件内 frontmatter | git commit hash | semver 直观 |
| Prompt 注册 | `@register_prompt(name=..., version=...)` 装饰器 + global registry | 全局 dict | 启动期收集 |
| 渲染 | `jinja2.Environment(loader=FileSystemLoader, autoescape=False)` + `select_autoescape` | 手撸 format | autoescape 防注入 |
| 多模型变体 | `prompts/diagnose.symptom_followup.{ernie,gpt4o,claude}.v3.2.1.j2` | 单模板 + if | 不同模型 prompt 表达差异大，分文件更清晰 |
| **Prompt 在线管理** | **Langfuse Prompt Management** 自托管 | Promptlayer / Helicone | langfuse 自带版本 + UI 编辑 + A/B 灰度 |
| Langfuse SDK | `langfuse-python` 2.x `langfuse.get_prompt(name, label="production")` | 自封 | label 走 "production" / "staging" |
| A/B 灰度 | Langfuse `production` / `staging` label 切流 + 自建 user_id 分桶 | LaunchDarkly | langfuse 自带流量切分 |
| Diff 评测 | CI 跑 100 条 regression 对比新旧 prompt pass rate | manual | merge 前阻塞 |
| Trace 关联 | 每条 trace 必带 `prompt_version` 字段（langfuse 自动） | manual | 出问题精确回放 |
| Rollback | 直接 git revert + 重 deploy / Langfuse UI 一键切回旧 label | manual | < 30s 完成回滚 |
| Prompt diff 工具 | `git diff` / Langfuse UI 自带 diff | promptfoo CLI | promptfoo 跨 prompt 多 provider 比 |
| Prompt 单元测试 | `pytest` + `pytest-recording` mock LLM + 预设 input/output 断言 | manual | "改 prompt 不能让 X case 退化" |
| Prompt 长度监控 | langfuse 自动统计 token 数 / 每个 version 平均 input | manual | prompt 突然变长立刻告警 |
| Few-shot 数据管理 | git 里 `prompts/few_shot/*.jsonl` + 模板里 `{% for ex in examples %}` 渲染 | 硬编码 | few-shot 也要版本化 |
| 多语言 Prompt | `prompts/{lang}/...` 目录结构 | i18n DB | 中文医学语料和英文不同 |

**Jinja2 + 自建 Registry 一段实战代码**：

```python
from jinja2 import Environment, FileSystemLoader, select_autoescape
from pathlib import Path
from typing import Callable

env = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "prompts"),
    autoescape=select_autoescape(disabled_extensions=("j2",)),
    trim_blocks=True, lstrip_blocks=True,
)

REGISTRY: dict[str, "PromptDef"] = {}

@dataclass
class PromptDef:
    name: str
    version: str
    template: str
    model_variant: str | None = None
    metadata: dict = field(default_factory=dict)

def register_prompt(name: str, version: str, model_variant: str | None = None):
    def deco(fn: Callable):
        REGISTRY[f"{name}@{version}"] = PromptDef(
            name=name, version=version, template=fn.__doc__ or "",
            model_variant=model_variant,
        )
        return fn
    return deco

@register_prompt(name="diagnose.symptom_followup", version="v3.2.1")
def build_followup_prompt(state) -> str:
    return env.get_template("diagnose/symptom_followup.j2").render(state=state)

# 调用时 trace 自带 version
prompt = build_followup_prompt(ctx)
trace.update(metadata={"prompt_version": "v3.2.1"})
```

**Langfuse Prompt Management 上线后的样子（最少代码）**：

```python
from langfuse import Langfuse
langfuse = Langfuse()

# Pull 在线管理的最新 production prompt
prompt_obj = langfuse.get_prompt("diagnose.symptom_followup", label="production")
# prompt_obj.prompt → 模板字符串
# prompt_obj.version → 自动版本号
# prompt_obj.config → JSON 配置（temperature / max_tokens 等）

compiled = prompt_obj.compile(state=ctx.model_dump())   # 自动 Jinja 渲染

# Trace 时把 prompt_obj 关联，UI 上 trace ↔ prompt 双向跳转
trace.update(prompt=prompt_obj)
```

**Langfuse 灰度切流**：在 UI 把 v3.3.0 标为 `staging`，业务侧自己写 5% 用户 hash 命中时 `langfuse.get_prompt(..., label="staging")`，其余走 production。**完全不动代码即可灰度**。

引用：

- Langfuse Prompt Management: <https://langfuse.com/docs/prompts/get-started>
- promptfoo: <https://www.promptfoo.dev/>
- Jinja2 docs: <https://jinja.palletsprojects.com/>

---

## 5. 行为面 & 反向引导

### Q11：你在这个项目里最大的收获是什么？

**模板回答：**

我最大的收获是想明白了一件事：**RAG 不是「向量检索 + 大模型生成」这么简单。RAG 是一条「数据 - 召回 - 重排 - 生成 - 风控 - 评测」的完整链路，链路上每一环都可能成为质量瓶颈。**

更深一层：医疗这种高风险领域 RAG 和通用 RAG 的差异不在算法，而在 **评测指标和安全边界**。Top-K 命中率高不代表系统可用——一个把「胸闷可能是心脏问题」漏拦的 90% 系统，比把所有问题都拒答的 50% 系统更危险。

这件事让我后来做 ArtArch.AI 时也很自然地把「评测优先」「风控独立」当成工程化默认，不是事后补的。

---

### Q12：踩过什么坑？

**三个真坑：**

1. **chunk 粒度选错**：早期按段落切，1 段 600 字。结果用户问「布洛芬禁忌症」，召回里禁忌症常被拆到下一段。后来按「语义边界 + 滑动窗口 100 字 overlap」重切，召回率涨了 6 个点。
2. **Embedding 模型升级踩 schema**：m3e 升级到 bge-large-zh，维度从 768 → 1024，没做版本兼容，线上一段时间 retrieval 命中率掉到 30%。教训：embedding 版本必须和索引版本绑定。
3. **风险规则误伤老人用户**：早期把「头疼 + 时间长」标 emergency，导致大量老人慢病头痛被误拦到急诊建议。后来把规则改成「头疼 + 急性发作 + 伴随症状」组合命中，误伤率下来 80%。

---

### Q13：反问？

- 当前医疗 / 健康业务的 RAG 主要瓶颈是召回质量、生成幻觉、风控漏判，还是评测体系？
- 是否有「按风险加权的评测指标」？还是按 accuracy 看？
- 多轮上下文是否独立成体系？还是塞 prompt？
- Prompt 是工程师维护还是医学专家维护？
- 高风险拦截后的人工通道是否打通？谁负责复核？

---

## 6. 反向引导地图

| 听到这种问 | 引到 |
|---|---|
| 「你们 RAG 怎么做的？」 | 「主要从混合检索 + rerank + 引用溯源 + 评测闭环四块讲」→ 任选一条展开 |
| 「医疗场景特殊在哪？」 | 「评测标准和安全边界，不在算法」→ 风险加权 |
| 「你测过哪些 embedding？」 | bge-large-zh / m3e / OpenAI ada 实测对比 |
| 「LLM 怎么不胡说？」 | 「四层：召回 / 生成 / 风控 / 评测」→ 任选一层 |
| 「多轮怎么管？」 | 「显式状态机 + 风控前置」→ Q1 那段 |
| 「日均 10 万 query 怎么撑？」 | 三级缓存 + 多模型路由 + Fallback |

---

## 7. 全局技术栈速查表（按问题域索引）

> 散在各 Q 的"🛠 具体技术方案"按问题域聚合一次，临场直接对照。

| 问题域 | 主推 | 备选 | 一句话理由 |
|---|---|---|---|
| 多轮状态机 | `transitions` (pytransitions) + Pydantic state | LangGraph / XState | Python FSM 事实标准，含可视化 |
| State 持久化 | `redis.asyncio` HSET + TTL | Postgres jsonb / langgraph checkpoint | 对话场景 Redis P95 < 5ms |
| 意图分类 - 规则 | `pyahocorasick` + `regex` 包 + 词典热更 | flashtext / 标准 re | AC 自动机 10w 词典 P99 < 100µs |
| 意图分类 - 模型 | 文心 ERNIE via `qianfan` SDK + `instructor` 结构化 | GPT-4o-mini / Gemini Flash via `litellm` | 中文医学 zero-shot 强 |
| 意图分类 - 中间层 | `semantic-router` + bge-small-zh | 自写余弦 | 比 LLM 便宜 50× |
| 命名实体 | `gliner-py` (zero-shot) / 百度 `LAC` | spacy + hanlp | gliner 不用训练数据 |
| 中文分词 | `jieba` + 医学词典 | pkuseg / hanlp | jieba 最广 |
| 文本归一化 | `unicodedata.normalize("NFKC")` + `opencc-python-reimplemented` | 手写 | 繁简 + 全角 |
| BM25 后端 | Elasticsearch 8.x + `ik` 分词 + `synonym_graph` | OpenSearch / Vespa | 同库 RRF + 同义词热更 |
| Embedding 模型 | `BAAI/bge-large-zh-v1.5` / `bge-m3` | OpenAI text-embedding-3-large | 中文 RAG 事实标准 |
| Embedding 推理 | HuggingFace **TEI** | Triton / vLLM | Rust + FP16，比 Python 快 3-5× |
| Vector DB | **Qdrant** (async client) | pgvector / milvus / Faiss | payload filter + HNSW 双强 |
| 索引 | HNSW `M=24, ef_construct=200, ef_search=128` | IVF+PQ | 在线查询首选 |
| RRF 融合 | ES 8.8+ native `retriever.rrf` | 自写 50 行 | 原生最干净 |
| Query 改写 | ERNIE prompt | 自训 mT5 | 长尾鲁棒性高 |
| Query 纠错 | `pycorrector` | SoftMaskedBERT | 仅低置信触发 |
| Chunking | `langchain_text_splitters.RecursiveCharacterTextSplitter` + 中文 separators | LlamaIndex SentenceSplitter | 中文标点必须放前 |
| Parent-child chunk | `langchain.retrievers.ParentDocumentRetriever` | 自建 parent map | 小 chunk 召回 + 大 chunk 喂 LLM |
| Contextual Retrieval | Claude Haiku + prompt caching 离线跑批 | 自建 | fail rate -35% |
| Reranker 模型 | `BAAI/bge-reranker-large` / `bge-reranker-v2-m3` | jina-reranker-v2 | 中文最稳 |
| Reranker 部署 | HF TEI（一行 docker） | Triton / vLLM | Rust + dynamic batching |
| Reranker 训练 | `FlagEmbedding`（BAAI 原厂） | sentence-transformers CrossEncoder | 三元组 + Margin Loss |
| 模糊字符串 | `rapidfuzz` | difflib | 比 fuzzywuzzy 快 10× |
| NLI 蕴含 | HF `mDeBERTa-v3-base-mnli-xnli` zero-shot | 自训 | "fact 是否被 passage 蕴含" |
| Citation schema | Pydantic + `instructor` | jsonschema | retry-with-feedback 自带 |
| Citation 原生 | Anthropic `citations` API（Claude 4 GA） | 自建 span 索引 | server 端校验 |
| RAG faithfulness | `ragas` | trulens-eval / phoenix | RAG 评测标杆 |
| Agent trajectory eval | `inspect-ai`（UK AISI） | langsmith | 设计完整 |
| Eval LLM-as-judge | Langfuse score + Claude/GPT judge | deepeval | 自托管 + UI |
| Judge 校准 | `cohen_kappa_score` 月度抽 50 条人工 | manual | 防 drift |
| 标注 | **Label Studio** 自托管 | Argilla / doccano | 中文 UI 好 |
| Eval CI | pytest + pytest-xdist + pytest-recording | manual | 并发跑 1k 用例 ~5min |
| 风险加权指标 | 自建 `risk_weighted_error_rate` 公式 | sklearn sample_weight | 急症错 ×100，简单错 ×1 |
| 偏差检测 | `scipy.stats.ks_2samp` | chi-square | 评测集 vs 线上分布漂移 |
| 安全规则 | `pyahocorasick` + `regex` + `re2` | flashtext | re2 防 ReDoS 攻击 |
| 安全 LLM 分类 | ERNIE via `qianfan` + instructor | OpenAI moderation | 中文医学敏感强 |
| Guardrails | `guardrails-ai` 装饰器风格 | NeMo Guardrails (NVIDIA) | guardrails-ai 优雅 |
| 自伤识别 | OpenAI moderation `self-harm` + 中文规则 | Perspective API | 必须降级到心理热线 |
| 上下文累积风险 | LangGraph state `risk_flags` 跨轮累计 + Redis sorted set | manual | 多轮组合命中 |
| Web 框架 | FastAPI + uvicorn workers | Litestar | Pydantic v2 原生 |
| Async DB | `asyncpg` + `sqlalchemy[asyncio]` 2.0 | psycopg3 | 性能最强 |
| 缓存 | `redis.asyncio` + `aiocache` + `orjson` + `zstandard` | memcached | 多级 + 压缩 |
| 限流 | `slowapi` + Redis token bucket + litellm Router rpm | aiolimiter | 用户级 + provider 级 |
| 重试 | `tenacity` `wait_exponential_jitter` | backoff | 装饰器优雅 |
| 熔断 | `pybreaker` | aiocircuitbreaker | error rate > 30% 跳 |
| 多 Provider | `litellm` Router | aisuite | 100+ provider |
| Token 计数 | `tiktoken` / `qianfan.count_tokens` / `anthropic.count_tokens` | 估算 | 各家分别精算 |
| Cost 计算 | `litellm.completion_cost` | manual | 实时价格 |
| 后台任务 | `arq`（Redis-based） | celery / dramatiq | async 原生 |
| Trace | `langfuse-python` 自托管 + LangChain CallbackHandler | langsmith / phoenix / weave | 自托管 + 直接 hook |
| OTel | `opentelemetry-api` + GenAI semantic convention | traceloop-sdk | 2025 1.0 稳定 |
| 日志 | `structlog` JSON | loguru | trace_id 关联 |
| 监控 | `prometheus-client` + Grafana | Skywalking / Datadog | 自托管 |
| 压测 | `locust`（Python） | k6（JS）/ wrk | 写场景方便 |
| 部署 | K8s + HPA + PodDisruptionBudget | docker compose | 高并发必须 |
| Chaos 测试 | Chaos Mesh | litmus | 验证 fallback |
| Prompt 模板 | Jinja2 + git | string.Template | autoescape 防注入 |
| Prompt 管理 | **Langfuse Prompt Management**（自托管 + label 灰度） | Promptlayer / Helicone | 自带版本 + UI + A/B |
| Prompt 诊断 | promptfoo CLI（多 prompt × 多 provider 矩阵评测） | manual | 改 prompt 必跑 |

---

## 8. 参考资料

**社区博客 + 论文：**

- [LangChain - Context Engineering for Agents](https://www.langchain.com/blog/context-engineering-for-agents)
- [Anthropic - Demystifying Evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Anthropic - Citations API](https://docs.anthropic.com/en/docs/build-with-claude/citations)
- [Anthropic - Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
- [Anthropic - Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Karpathy - Software 3.0](https://www.latent.space/p/s3)
- [Lilian Weng - LLM Powered Autonomous Agents](https://lilianweng.github.io/posts/2023-06-23-agent/)
- [RAG 原论文 (NeurIPS 2020)](https://papers.nips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html)
- [Liu et al. - Lost in the Middle](https://arxiv.org/abs/2307.03172)

**关键开源库（面试可直接报名字）：**

- 状态机：[pytransitions/transitions](https://github.com/pytransitions/transitions)
- 检索：[Elasticsearch RRF Retriever](https://www.elastic.co/guide/en/elasticsearch/reference/current/rrf-retriever.html) · [Qdrant async client](https://qdrant.tech/) · [HuggingFace TEI](https://github.com/huggingface/text-embeddings-inference)
- Embedding / Reranker：[BAAI FlagEmbedding](https://github.com/FlagOpen/FlagEmbedding) · [bge 模型卡](https://bge-model.com/bge/bge_reranker.html)
- 结构化输出：[instructor](https://github.com/instructor-ai/instructor) · [outlines](https://github.com/dottxt-ai/outlines) · [xgrammar](https://github.com/mlc-ai/xgrammar)
- 多 Provider：[LiteLLM Router](https://docs.litellm.ai/docs/routing) · [Qianfan SDK](https://github.com/baidubce/bce-qianfan-sdk) · [aisuite](https://github.com/andrewyng/aisuite)
- Guardrails：[guardrails-ai](https://github.com/guardrails-ai/guardrails) · [NeMo Guardrails](https://github.com/NVIDIA/NeMo-Guardrails)
- 评测：[ragas](https://github.com/explodinggradients/ragas) · [inspect-ai](https://inspect.aisi.org.uk/) · [deepeval](https://github.com/confident-ai/deepeval) · [promptfoo](https://www.promptfoo.dev/) · [ranx](https://github.com/AmenRa/ranx)
- 标注：[Label Studio](https://labelstud.io/) · [Argilla](https://argilla.io/)
- Tracing：[Langfuse](https://github.com/langfuse/langfuse) · [Arize Phoenix](https://github.com/Arize-ai/phoenix) · [OTel GenAI Spec](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- NLP 工具：[GLiNER](https://github.com/urchade/GLiNER) · [百度 LAC](https://github.com/baidu/lac) · [jieba](https://github.com/fxsjy/jieba) · [pycorrector](https://github.com/shibing624/pycorrector) · [rapidfuzz](https://github.com/rapidfuzz/RapidFuzz)
- 路由 / Semantic：[semantic-router (aurelio-labs)](https://github.com/aurelio-labs/semantic-router)
- 工程：[arq](https://github.com/python-arq/arq) · [tenacity](https://github.com/jd/tenacity) · [pybreaker](https://github.com/danielfm/pybreaker) · [sse-starlette](https://github.com/sysid/sse-starlette) · [locust](https://locust.io/)

**本站姊妹篇（深度延伸）：**

- [RAG 混合检索与医疗问答](../review/02-rag-retrieval.md)
- [Vector DB 选型 + Reranker 深入](../review/07-vector-db-reranker.md)
- [Chunking 策略：RAG 工程落地](../review/11-chunking-strategy.md)
- [LangGraph 上下文工程实战](./notes/langgraph-context-engineering.md)
- [ArtArch.AI 面试 Q&A](./artarch-ai.md)（同样按 "🛠 具体技术方案" 风格补全的姊妹篇）
