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

- 程序员Carl：Vibe Coding 时代工程师优势访谈题：<https://mp.weixin.qq.com/s/TD4QN-14GGTWdUHK5E9Dxw>
  看 AI 辅助编程下的问题定义、上下文构建、结果验证、技术决策和 Token 成本控制。

- LangChain how_to_fix_your_context：<https://github.com/langchain-ai/how_to_fix_your_context>
  看 6 种上下文工程方法如何用 LangGraph notebook 实现。

- Drew Breunig How to Fix Your Context：<https://www.dbreunig.com/2025/06/26/how-to-fix-your-context.html>
  看 RAG、Tool Loadout、Context Quarantine、Pruning、Summarization、Offloading 的原始分类。

- Chroma Context Rot：<https://research.trychroma.com/context-rot>
  看长上下文性能退化和 context rot 的实验背景。

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

## Medical Bot SFT / RL Training

- TRL SFTTrainer：<https://huggingface.co/docs/trl/sft_trainer>
  看 instruction tuning 数据格式、chat template、assistant-only loss 和训练配置。

- TRL DPOTrainer：<https://huggingface.co/docs/trl/main/en/dpo_trainer>
  看 DPO / IPO 等偏好优化 loss、chosen/rejected 数据格式和 beta 参数。

- TRL KTOTrainer：<https://huggingface.co/docs/trl/main/en/kto_trainer>
  看只有 desirable / undesirable 单样本标签时如何做偏好优化。

- TRL ORPOTrainer：<https://huggingface.co/docs/trl/main/en/orpo_trainer>
  看 reference-free 的 SFT + preference 合并路线。

- TRL PPOTrainer：<https://huggingface.co/docs/trl/main/en/ppo_trainer>
  看传统 RLHF 的 policy / reward / value 训练形态。

- TRL GRPOTrainer：<https://huggingface.co/docs/trl/main/en/grpo_trainer>
  看 group relative policy optimization，适合 citation/schema/refusal 等可验证 reward。

- PEFT：<https://huggingface.co/docs/peft/en/index>
  看 LoRA / QLoRA adapter 的训练和合并方式。

- LLaMA-Factory：<https://github.com/hiyouga/LLaMA-Factory>
  看 SFT、reward modeling、PPO、DPO、KTO、ORPO 等训练任务的配置化实践。

- OpenRLHF：<https://openrlhf.readthedocs.io/en/latest/>
  看 Ray + vLLM + DeepSpeed 的大规模 RLHF / PPO / GRPO 工程化。

- veRL：<https://verl.readthedocs.io/en/latest/>
  看复杂 RL 后训练、多 rollout 后端和 FSDP/Megatron/vLLM/SGLang 的组合。

- vLLM：<https://docs.vllm.ai/en/latest/>
  看小模型 serving、LoRA adapter、prefix caching 和高吞吐推理。

- DeepSpeed ZeRO：<https://www.deepspeed.ai/tutorials/zero/>
  看 ZeRO-2/3 如何做优化器、梯度和参数分片。

- Qwen3：<https://qwenlm.github.io/blog/qwen3/>
  看 0.6B / 1.7B / 4B / 8B 等小模型尺寸和部署建议。

- Qwen3 Embedding：<https://arxiv.org/abs/2506.05176>
  看 Qwen3 embedding / reranker 系列的多语言检索训练背景。

- Huatuo-26M：<https://arxiv.org/abs/2305.01526>
  中文医疗问答/指令数据，可用于冷启动和风格预热。

- CMExam：<https://arxiv.org/abs/2306.03030>
  中文医学考试 benchmark，可做医学知识 sanity check。

- CMB：<https://arxiv.org/abs/2308.08833>
  中文医学综合 benchmark，适合作为离线评测补充。

- Zhongjing / Chinese medical RLHF：<https://arxiv.org/abs/2308.03549>
  看中文医疗多轮对话和 RLHF 思路。

- WHO guidance on large multi-modal models in health：<https://www.who.int/publications/i/item/9789240084759>
  看医疗 AI 使用中的风险、治理和人类监督要求。

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

- Kubernetes Scheduling Framework：<https://kubernetes.io/docs/concepts/scheduling-eviction/scheduling-framework/>
  看 QueueSort、PreFilter、Filter、Score、Reserve、Permit、Bind 等 scheduler 扩展点。

- Kubernetes Dynamic Resource Allocation：<https://kubernetes.io/docs/concepts/scheduling-eviction/dynamic-resource-allocation/>
  看 DeviceClass、ResourceClaim、ResourceClaimTemplate、ResourceSlice 的新资源分配模型。

- NVIDIA GPU Operator：<https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/overview.html>
  看 GPU driver、container toolkit、device plugin、GFD、DCGM、MIG Manager 的统一生命周期管理。

- NVIDIA k8s-device-plugin：<https://github.com/NVIDIA/k8s-device-plugin>
  看 MIG strategy、time-slicing、MPS、CDI 和 `nvidia.com/gpu` 资源暴露方式。

## Code Practice / Engineering Skeletons

- Python dataclasses：<https://docs.python.org/3/library/dataclasses.html>
  适合写算法题和轻量工程题的结构化数据模型。

- Pydantic Models：<https://docs.pydantic.dev/latest/concepts/models/>
  看 schema、validation、model_dump、错误处理，适合 structured output 代码题。

- Kubernetes Controller Runtime：<https://book.kubebuilder.io/cronjob-tutorial/controller-implementation>
  看 Reconcile、Status、Finalizer、OwnerReference 的 controller 骨架。

- Kubernetes Client Python：<https://github.com/kubernetes-client/python>
  用来快速写 K8s API 查询、watch、调试脚本。

## GitHub Pages / Actions

- GitHub Pages 官方文档：<https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site>  
  看 Pages 发布、Actions workflow 和静态站点说明。

- actions/upload-pages-artifact：<https://github.com/actions/upload-pages-artifact>  
  看如何打包 Pages artifact。

- actions/deploy-pages：<https://github.com/actions/deploy-pages>  
  看 Pages deployment job 所需 permissions 和 environment。
