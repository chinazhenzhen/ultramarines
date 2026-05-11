# RAG、混合检索与医疗问答复习

## 1. RAG 的本质

RAG 不是“把文档塞进 prompt”，而是把外部知识作为可更新、可追溯的 non-parametric memory，与模型的 parametric memory 结合。经典 RAG 论文强调两个价值：

- 模型参数里的知识难以及时更新，外部检索可更新。
- 知识密集任务需要 provenance，检索片段能提供证据来源。

面试里要把 RAG 拆成四段：**query understanding -> retrieval -> reranking/context assembly -> grounded generation**。

## 2. 医疗 RAG 链路图

```mermaid
flowchart LR
  Q[User Query] --> I[Intent + Risk Classifier]
  I -->|medical QA| RQ[Query Rewrite\nsymptom/entity/department]
  I -->|high risk| Safe[Safety Policy\nreject/ER/manual]
  RQ --> B[BM25 Retrieval]
  RQ --> D[Dense Retrieval]
  B --> M[Merge + Deduplicate]
  D --> M
  M --> RR[bge-reranker\ncross encoder]
  RR --> C[Context Builder\ncitation/window/metadata]
  C --> G[Grounded Answer]
  G --> V[Safety + Citation Check]
  V --> A[Final Answer]
  V --> BC[Badcase Store]
```

## 3. BM25、Dense、Rerank 怎么讲

### BM25

适合：

- 疾病名、药品名、检查指标、医学术语。
- 精确关键词匹配。
- 可解释性较强。

短板：

- 同义词、口语化表达泛化弱。
- 对“我喘不上气，胸口发闷”这类表达可能不如 dense。

### Dense Retrieval

适合：

- 语义相近但字面不同。
- 用户口语、长问题、隐含意图。

短板：

- 专业名词、数字、否定、药品禁忌可能召回不稳。
- 向量分数解释性较弱。

### Reranker

适合：

- 对 Top-100/Top-200 候选做精排。
- 判断 query-doc 是否真正相关。
- 降低“语义像但医学关系不对”的候选。

面试金句：

> Bi-encoder 负责大规模召回，cross-encoder 负责小规模精排。RAG 质量不是单点模型决定，而是召回覆盖、重排精度、上下文组织和生成约束共同决定。

## 4. 混合检索融合策略

| 策略 | 优点 | 风险 |
|---|---|---|
| 分数归一加权 | 简单可控 | 不同检索器分数不可比 |
| RRF | 不依赖原始分数尺度 | rank 参数需要理解 |
| 分路召回 + rerank | 工程常用，效果稳定 | reranker 成本上升 |
| 按意图路由 | 对垂直场景更精细 | 分类错误影响召回 |

你可以说：医疗场景我倾向“分路召回 + 去重 + rerank + 分桶评测”，因为不同 query 类型差异很大，先保证候选覆盖，再用 reranker 提升 Top-K。

## 5. Chunking 与上下文组织

### Chunking 关键点

- 不按固定 token 机械切，尽量保留标题、疾病、药品、适应症、禁忌、剂量等结构边界。
- chunk 太小会丢上下文，太大会引入噪声。
- 医疗知识要保留 source、更新时间、适用人群、风险等级。
- 同一疾病/药品的多个字段可做 parent-child 检索：小 chunk 召回，大 context 回填。

### Context Builder 要做什么

- 按 rerank 分数和多样性选择片段。
- 合并同源相邻片段。
- 去掉互相冲突或低权威来源。
- 保留引用 id，生成答案时强制引用。
- 对证据不足的 query 标记 low evidence。

## 6. 医疗安全策略

### 高风险意图

- 急症：胸痛、呼吸困难、意识丧失、大出血、中风迹象。
- 处方/剂量：处方药怎么吃、儿童/孕妇剂量、药物混用。
- 诊断结论：让模型直接判断“我是不是某病”。
- 高危人群：孕妇、儿童、老人、慢病患者。
- 自伤/精神危机。

### 策略设计

```mermaid
flowchart TD
  A[Medical Query] --> B{Risk Level}
  B -->|low| C[Normal RAG Answer\nwith citations]
  B -->|medium| D[Conservative Answer\nrecommend doctor + citations]
  B -->|high| E[Safety Response\nurgent offline care/manual]
  C --> F[Post-generation Safety Check]
  D --> F
  E --> Log[Risk Trace + QA Audit]
  F -->|unsafe| E
  F -->|safe| G[Final]
```

面试重点：

- 医疗安全优先召回率，不追求少拦截。
- 不能只靠 LLM 判断，必须规则 + 模型 + 人工质检。
- 拒答要有帮助性，不是简单“我不能回答”。

## 7. RAG 评测体系

### Retrieval 评测

- Recall@K：正确证据是否在 K 个候选里。
- MRR：正确证据排得是否靠前。
- Top-3 Hit Rate：业务可感知的高位命中率。
- 分桶指标：疾病科普、症状咨询、药品问答、报告解读、科室推荐、高风险。

### Generation 评测

- Faithfulness：答案是否被证据支持。
- Citation Coverage：关键结论是否有引用。
- Helpfulness：是否解决用户问题。
- Safety：是否越过医疗边界。
- Refusal Accuracy：该拒答是否拒答，不该拒答是否正常回答。

### Badcase 闭环

```mermaid
flowchart LR
  Online[Online Query] --> Trace[Trace + User Feedback]
  Trace --> Label[Human Label\nfailure type]
  Label --> Eval[Eval Dataset]
  Eval --> Fix[Retrieval/Prompt/Safety Fix]
  Fix --> Experiment[Offline Experiment]
  Experiment --> AB[A/B or Gray Release]
  AB --> Online
```

失败类型要分类：

- 召回失败。
- 重排失败。
- 上下文噪声。
- 生成误读。
- 引用缺失。
- 风控漏判。
- 过度拒答。

## 8. 向量数据库与索引速记

### Faiss

- `IndexFlatL2/IP`：精确搜索，适合小规模或评测基准。
- `HNSW`：图索引，召回高、查询快，内存开销较高。
- `IVF`：倒排聚类，适合大规模，需要训练和调参。
- `PQ/SQ`：压缩向量，省内存但可能损失召回。

### HNSW 参数

- `M`：图连接数，越大召回越好、内存越高。
- `ef_construct`：建图搜索宽度，越大构建慢但质量高。
- `ef_search`：查询宽度，越大召回好但延迟高。

### Elasticsearch

- BM25 是传统强项。
- dense vector / kNN 支持语义检索。
- RRF 可融合多个 retriever，不需要直接比较原始分数。

### Qdrant/Milvus/pgvector

面试中如果被问选型：

- 已有 ES 文档生态和关键词检索，先考虑 Elasticsearch 混合检索。
- 需要独立向量库、过滤和高性能 ANN，可考虑 Qdrant/Milvus。
- 数据量不大、业务强依赖 PostgreSQL、希望架构简单，可考虑 pgvector。

## 9. 必背问题

### 为什么 Top-3 比 Top-10 更重要？

因为最终给 LLM 的上下文有限，用户也只感知高位证据。Top-10 召回高但 Top-3 差，生成仍可能引用错误片段。医疗问答尤其要关注高位命中和引用质量。

### RAG 什么时候不适合？

- 问题不依赖外部知识，直接模型即可。
- 知识源质量差或互相冲突，检索会放大问题。
- 需要严格事务数据，应该查数据库/API 而不是文档检索。
- 用户要的是操作执行，不是知识回答，应走 tool calling。

### 如何处理检索不到？

不要让模型硬答。可以：

- 改写 query 再检索。
- 放宽过滤或切换检索策略。
- 返回证据不足并建议补充信息。
- 高风险医疗问题直接安全兜底。

## 10. 官方与高质量资料

- RAG NeurIPS 2020：<https://papers.nips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html>
- BGE Reranker：<https://bge-model.com/bge/bge_reranker.html>
- Faiss Indexes：<https://github.com/facebookresearch/faiss/wiki/Faiss-indexes>
- Elasticsearch kNN：<https://www.elastic.co/guide/en/elasticsearch/reference/current/knn-search.html>
- Elasticsearch RRF：<https://www.elastic.co/guide/en/elasticsearch/reference/current/rrf.html>
- Qdrant Indexing：<https://qdrant.tech/documentation/concepts/indexing/>
- Qdrant Search：<https://qdrant.tech/documentation/search/search/>
