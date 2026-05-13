# 医疗 RAG · 混合检索 + Rerank 工程实现

> 配合 [baidu-health.md](../baidu-health.md) Q3/Q4 食用。

---

## 1. 整体链路

```
Query → Query Rewrite → Hybrid Retrieve (BM25 ∥ Dense)
       → RRF Fusion → Top-50 → BGE Reranker
       → Top-5 + 业务约束 boost → Context Builder
       → LLM (with citation schema) → Validator → User
```

每一段都有 Trace、可独立 evaluate。

---

## 2. Query Rewrite：被低估的一步

医疗 query 长尾大、口语化重。**不做 query rewrite，召回率直接掉 10+ 个点**。

```python
def rewrite_query(q: str, intent: Intent) -> RewrittenQuery:
    out = RewrittenQuery(original=q)
    # 1. 规范化：全角半角、繁简、错别字
    out.normalized = normalize(q)
    # 2. 实体抽取：药品 / 疾病 / 症状 / 检查指标
    out.entities = ner.run(out.normalized)
    # 3. 同义扩展：「胸口闷」→「胸闷」「胸部压迫」
    out.expansions = synonym_dict.expand(out.entities)
    # 4. 意图特定改写
    if intent == Intent.DRUG:
        out.bm25_query = f"{out.normalized} {' OR '.join(out.entities.drug_terms)}"
    elif intent == Intent.SYMPTOM:
        out.bm25_query = " OR ".join([out.normalized] + out.expansions)
    return out
```

**LLM rewrite vs 规则 rewrite：**

- 规则 rewrite：对实体类（药品、疾病）准确率高。
- LLM rewrite：对口语化症状描述更好。
- 我用 **规则前置 + LLM 兜底**：规则能解决就用规则，规则不命中（口语 / 长 query）走 LLM。

---

## 3. BM25 索引设计

```json
// ES mapping 关键字段
{
  "properties": {
    "title":   { "type": "text", "analyzer": "medical_synonym_zh" },
    "content": { "type": "text", "analyzer": "medical_synonym_zh" },
    "drug_names":    { "type": "keyword" },  // 精确匹配药名
    "disease_codes": { "type": "keyword" },  // ICD-10 编码
    "source_type":   { "type": "keyword" },  // encyclopedia / drug_db / guideline
    "authority":     { "type": "float" },    // 来源权威性 0-1
    "last_updated":  { "type": "date" }
  }
}
```

**自定义 analyzer 关键：**

- 中文分词用 ik + 医学专有词典（疾病、药品、症状词典）。
- Synonym filter 用医学同义词表。
- 数字归一化（剂量 "50mg" / "0.05g" 都索引）。

---

## 4. Dense 索引：bge-large-zh + Faiss

**Embedding 选型：**

| 模型 | 维度 | 中文表现 | 推理成本 |
|---|---|---|---|
| OpenAI ada-002 | 1536 | 一般 | 按 token 计费 |
| m3e-base | 768 | 中等 | 本地 GPU |
| bge-large-zh-v1.5 | 1024 | **强** | 本地 GPU |
| bge-m3 (multi-functional) | 1024 | 强 + 多语 + 多粒度 | 本地 GPU |

最终选 **bge-large-zh-v1.5**：

- 中文医学语料评测优于 m3e 4-6 个点。
- 支持长上下文（512 token），适合医学段落。
- 开源，无外发数据顾虑（医疗数据合规要求）。

**Chunk 策略：**

```python
def medical_chunk(doc: Document) -> list[Chunk]:
    # 1. 按语义边界切（标题层级、列表分隔）
    # 2. 滑动窗口 800 字 / overlap 150 字
    # 3. 元信息保留：标题路径、原始 doc_id、source_type、authority
    chunks = []
    for section in extract_sections(doc):
        for chunk in slide_window(section.text, size=800, overlap=150):
            chunks.append(Chunk(
                doc_id=doc.id,
                section_path=section.path,
                content=chunk,
                source_type=doc.source_type,
                authority=doc.authority,
            ))
    return chunks
```

**为什么 800 字 + 150 overlap？**

- 太小（200 字）→ 上下文不完整，禁忌症常被切断。
- 太大（1500 字）→ embedding 稀释，召回精度掉。
- 800 字 + 150 overlap 是医学语料实测最稳的。

**Faiss 索引：HNSW**

```python
import faiss
index = faiss.IndexHNSWFlat(dim=1024, M=32, metric=faiss.METRIC_INNER_PRODUCT)
index.hnsw.efConstruction = 200
index.hnsw.efSearch = 50  # 在线检索时调
```

HNSW vs IVF：

- HNSW：召回质量更高，内存占用大。
- IVF：速度快，需要训练，召回 ~95% recall@10。

我们医疗库 ~5M chunk，HNSW 内存可控（~10GB），优先选 HNSW。

---

## 5. RRF 融合

```python
def reciprocal_rank_fusion(
    result_sets: list[list[Doc]],
    k: int = 60,
) -> list[tuple[Doc, float]]:
    scores = {}
    for results in result_sets:
        for rank, doc in enumerate(results, start=1):
            scores[doc.id] = scores.get(doc.id, 0) + 1.0 / (k + rank)
    return sorted(
        [(doc_index[d_id], s) for d_id, s in scores.items()],
        key=lambda x: -x[1],
    )
```

**为什么 k=60？**

- k 越大，rank 越靠后的文档贡献越平均，融合越「宽容」。
- k 越小，差异放大，但对噪声敏感。
- Elasticsearch、Vespa 都默认 60，社区共识。

**RRF vs 加权融合：**

| 方法 | 优点 | 缺点 |
|---|---|---|
| Weighted（α·s_bm25 + (1-α)·s_dense） | 直观、可调 | 分数需归一化、不同 query 长度敏感 |
| RRF | rank-based、跨检索器异构鲁棒 | 不利用绝对分数信息 |

实测 RRF 在医学场景比 weighted 高 2-3 个点（rank-based 对术语 query 更稳）。

---

## 6. BGE Reranker 部署 + 调参

**为什么需要 reranker？**

Bi-encoder embedding 的 query-doc 相似度是粗粒度的语义距离，**对「症状-病因」「药品-禁忌」这种关系语义判断不够**。Cross-encoder（rerank）把 query+doc 一起进 transformer，每个 token 都能交互。

```python
class BGEReranker:
    def __init__(self):
        self.model = FlagReranker(
            "BAAI/bge-reranker-large",
            use_fp16=True,
        )

    def score(self, pairs: list[tuple[str, str]]) -> list[float]:
        # batched，max_length=512
        return self.model.compute_score(
            pairs, batch_size=32, max_length=512,
        )
```

**部署：**

- 4 卡 T4 + Triton Inference Server。
- Batch=32，FP16，P95 80ms。
- 输入 Top-50 → 输出 Top-5。

**为什么 Top-50 → Top-5？**

- 50 是 BM25+Dense 召回足以覆盖正例的安全阈值。
- 5 是 LLM context 预算的实测最优（再多 LLM 注意力会被稀释）。

---

## 7. 业务约束 boost

Reranker 的纯语义分数还不够，要叠业务约束：

```python
def apply_business_boost(query: Query, candidates: list[ScoredDoc]) -> list[ScoredDoc]:
    out = []
    for c in candidates:
        boost = 0.0
        # 1. 来源权威性
        boost += 0.1 * c.doc.authority  # 0 ~ 0.1
        # 2. 时间衰减（新版药品库 > 旧版）
        if c.doc.last_updated:
            days_old = (datetime.utcnow() - c.doc.last_updated).days
            boost += 0.05 * math.exp(-days_old / 365)
        # 3. 风险关键词 match boost
        if query.intent == Intent.SYMPTOM and contains_risk_term(c.doc.content):
            boost += 0.15
        # 4. 同 source type 偏好（drug 库优于一般科普）
        if query.intent == Intent.DRUG and c.doc.source_type == "drug_db":
            boost += 0.2
        out.append(c.with_score(c.score + boost))
    return sorted(out, key=lambda x: -x.score)
```

---

## 8. Top-3 命中率 70% → 88% 的归因

| 改动 | 增量 |
|---|---|
| BM25 加 medical synonym | +2.5% |
| Chunk 改 800 字 + overlap 150 字 | +3.0% |
| 加 Dense（bge-large-zh）混合 | +5.0% |
| RRF 替代 weighted | +1.5% |
| BGE Reranker | +4.0% |
| 业务约束 boost | +2.0% |
| 合计（从 70% baseline） | **+18% → 88%** |

每一项都是单独评测验证的，不是叠加才好。

---

## 9. 评测细节

```python
def evaluate_retrieval(eval_set: list[GoldQuery], retriever) -> Metrics:
    metrics = defaultdict(list)
    for q in eval_set:
        results = retriever.retrieve(q.text, top_k=10)
        result_ids = [r.id for r in results]
        # Recall@K
        metrics["recall@3"].append(any(g in result_ids[:3] for g in q.gold_ids))
        metrics["recall@10"].append(any(g in result_ids for g in q.gold_ids))
        # MRR
        for i, r in enumerate(results, 1):
            if r.id in q.gold_ids:
                metrics["mrr"].append(1.0 / i)
                break
        else:
            metrics["mrr"].append(0.0)
    return Metrics(
        recall_at_3=mean(metrics["recall@3"]),
        recall_at_10=mean(metrics["recall@10"]),
        mrr=mean(metrics["mrr"]),
    )
```

**按桶看（关键！）：**

| 桶 | recall@3 |
|---|---|
| 药品名 query | 95% |
| 疾病科普 query | 91% |
| 症状口语化 | 84% |
| 报告解读 | 80% |
| 长尾专业 | 78% |
| 综合 | 88% |

长尾专业是改进重点，对应做了术语词典扩展和小样本 fine-tune reranker。

---

## 10. 常见踩坑

- **Embedding 模型升级未做版本兼容**：m3e → bge，dim 变了，索引必须全量重建，灰度不能简单切。
- **多路召回去重**：BM25 / Dense 召回结果合并前必须按 chunk_id 去重，不然 RRF 分数失真。
- **Reranker batch 不足导致 GPU 利用率低**：上 batch=32 + dynamic batching。
- **chunk overlap 太大导致 Top-K 重复 chunk**：召回侧做 doc-level dedup（同一 doc 最多 2 个 chunk）。
