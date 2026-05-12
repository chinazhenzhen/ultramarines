# 资料来源与延伸阅读

> 这份清单优先放官方文档、论文、源码仓库和一线工程博客。复习时不要逐字读完，重点看概念定义、架构边界、示例和最佳实践。

## AI Agent / LangGraph

- LangGraph Thinking in LangGraph：<https://docs.langchain.com/oss/python/langgraph/thinking-in-langgraph>
  看如何把流程拆成 node、edge 和 shared state，以及 state 里应该存什么。

- LangGraph Graph API：<https://docs.langchain.com/oss/python/langgraph/graph-api>
  看 State、Node、Edge、reducer、Command、Send 这些底层概念。

- LangGraph Persistence：<https://docs.langchain.com/oss/python/langgraph/persistence>  
  看 checkpoint、thread、fault tolerance、human-in-the-loop 的关系。

- LangGraph Durable Execution：<https://docs.langchain.com/oss/python/langgraph/durable-execution>
  看 durable execution、determinism、idempotency、side effect 和 resume 的关系。

- LangGraph Interrupts：<https://docs.langchain.com/oss/python/langgraph/interrupts>
  看 interrupt/resume 的规则、Command 用法和 HITL 注意事项。

- LangGraph Streaming：<https://docs.langchain.com/oss/python/langgraph/streaming>
  看 stream modes，尤其是 custom stream 和 `get_stream_writer()`。

- LangGraph Workflows and agents：<https://docs.langchain.com/oss/python/langgraph/workflows-agents>
  看 workflow 与 agent 的边界，以及常见模式。

- LangGraph Human-in-the-loop：<https://docs.langchain.com/oss/python/langchain/frontend/human-in-the-loop>  
  看 interrupt/resume、approve/reject/edit/respond 的交互模型。

- LangGraph GitHub：<https://github.com/langchain-ai/langgraph>  
  面试前浏览 README、examples、checkpoint 相关代码结构。

- Building LangGraph: Designing an Agent Runtime from First Principles：<https://www.langchain.com/blog/building-langgraph>  
  用来解释为什么生产 Agent 需要 control 和 durability。

- LangChain and LangGraph 1.0：<https://www.langchain.com/blog/langchain-langgraph-1dot0>  
  用来区分 LangChain 和 LangGraph 的定位。

- Anthropic Building Effective Agents：<https://www.anthropic.com/engineering/building-effective-agents>  
  必读。重点看 workflow vs agent、prompt chaining、routing、parallelization、orchestrator-workers、evaluator-optimizer。

- 12 Factor Agents：<https://www.humanlayer.dev/blog/12-factor-agents>  
  适合补充“好的 Agent 往往是确定性代码 + 少量关键 LLM 步骤”的观点。

## Structured Output / Tool Calling / Models

- Gemini Structured Outputs：<https://ai.google.dev/gemini-api/docs/structured-output>  
  看 JSON Schema、Pydantic/Zod、streaming structured output、限制和 best practices。

- Gemini Function Calling：<https://ai.google.dev/gemini-api/docs/function-calling>  
  看 function declaration、AUTO/ANY/NONE、自动函数调用。

- OpenAI Agents SDK：<https://platform.openai.com/docs/guides/agents-sdk/>  
  看工具、handoff、streaming、trace 的官方抽象。

- OpenAI Agents SDK Tracing：<https://openai.github.io/openai-agents-python/tracing/>  
  看 trace/span、tool span、generation span、custom processors。

- Anthropic Writing Tools for Agents：<https://www.anthropic.com/engineering/writing-tools-for-agents>  
  看高质量工具设计、工具 eval、用 agent 优化工具。

## RAG / Retrieval

- Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks：<https://papers.nips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html>  
  RAG 经典论文。重点看 parametric memory + non-parametric memory、provenance 和 factuality。

- BGE Reranker：<https://bge-model.com/bge/bge_reranker.html>  
  看 cross-encoder reranker 为什么适合 Top-K 重排。

- FlagEmbedding GitHub：<https://github.com/FlagOpen/FlagEmbedding>  
  看 embedding / reranker 使用方式。

- Faiss Indexes：<https://github.com/facebookresearch/faiss/wiki/Faiss-indexes>  
  看 Flat、HNSW、IVF、PQ 等索引差异。

- Elasticsearch kNN：<https://www.elastic.co/guide/en/elasticsearch/reference/current/knn-search.html>  
  看 dense_vector / kNN 基本限制。

- Elasticsearch RRF：<https://www.elastic.co/guide/en/elasticsearch/reference/current/rrf.html>  
  看 reciprocal rank fusion 如何合并 BM25 和语义检索。

- Qdrant Indexing：<https://qdrant.tech/documentation/concepts/indexing/>  
  看 HNSW、filterable HNSW、payload index。

- Qdrant Search：<https://qdrant.tech/documentation/search/search/>  
  看 filter、hnsw_ef、score_threshold、payload/vector 返回。

## Eval / Observability

- Anthropic Demystifying Evals for AI Agents：<https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents>  
  必读。重点看 task/trial/grader/transcript、capability vs regression eval、agent eval roadmap。

- LangSmith Evaluation：<https://docs.langchain.com/langsmith/evaluation>  
  看 offline/online evaluation、dataset、evaluator、experiment、feedback loop。

- Langfuse Docs：<https://langfuse.com/docs/>  
  看 traces、sessions、prompt management、evaluation、datasets、experiments。

- OpenTelemetry Semantic Conventions：<https://opentelemetry.io/docs/concepts/semantic-conventions/>  
  看 trace/metric/log 命名标准化价值。

- OpenTelemetry GenAI Semantic Conventions：<https://opentelemetry.io/docs/specs/semconv/gen-ai/>  
  看 GenAI span/event/attribute 的标准化方向。

## Backend / SSE / Cloud Native

- MDN Server-Sent Events：<https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events>  
  看 EventSource、event stream format、event/data/id/retry、断线重连。

- FastAPI Custom Response / StreamingResponse：<https://fastapi.tiangolo.com/advanced/custom-response/>  
  看 StreamingResponse 如何接 async generator。

- Starlette Responses：<https://www.starlette.io/responses/>  
  看底层 ASGI response、StreamingResponse、EventSourceResponse 说明。

- Kubernetes Device Plugins：<https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/device-plugins/>  
  看 device plugin 如何向 kubelet 注册 GPU 等扩展资源。

- Kubernetes Schedule GPUs：<https://kubernetes.io/docs/tasks/manage-gpus/scheduling-gpus/>  
  看 GPU limits、node labels、device plugin 前置条件。

- Kubernetes Custom Resources：<https://kubernetes.io/docs/concepts/api-extension/custom-resources/>  
  看 custom resource 和 custom controller 的关系。

- Kubernetes Operator Pattern：<https://kubernetes.io/docs/concepts/extend-kubernetes/operator>  
  看 operator 如何把领域运维知识编码成控制循环。

## GitHub Pages / Actions

- GitHub Pages 官方文档：<https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site>  
  看 Pages 发布、Actions workflow 和静态站点说明。

- actions/upload-pages-artifact：<https://github.com/actions/upload-pages-artifact>  
  看如何打包 Pages artifact。

- actions/deploy-pages：<https://github.com/actions/deploy-pages>  
  看 Pages deployment job 所需 permissions 和 environment。
