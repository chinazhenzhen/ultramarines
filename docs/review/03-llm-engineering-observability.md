# LLM 工程化、工具调用、评测与可观测复习

![图 1 - LLM Governance：结构化输出、工具权限、Trace、Eval 与成本治理](../../assets/article-llm-observability.png)

> 阅读目标：把 LLM 工程化讲成一套“可信执行边界”。模型输出永远不是事实本身，而是需要被 schema、权限、业务校验、trace 和 eval 接住的 proposal。

## 0. 本文地图

| 模块 | 核心问题 | 面试回答方向 |
|---|---|---|
| Structured Output | JSON 正确是否等于业务正确 | 解析、schema、业务校验三层分开 |
| Tool Calling | 模型是否能直接执行工具 | action proposal + policy gate + audit |
| Provider Abstraction | 为什么封装多模型 | 能力、成本、fallback、错误归一 |
| Eval | 怎么证明改动变好了 | capability vs regression |
| Trace | 怎么排查线上 badcase | run/stage/model/tool span |

## 1. Structured Output

结构化输出的目的不是“让 JSON 好看”，而是让 LLM 输出进入工程系统前可解析、可验证、可回放、可修复。

### 适用场景

- Planner 输出：故事结构、镜头列表、DAG pattern 选择。
- Classifier 输出：意图、风险等级、置信度。
- UGC 审核输出：决策、理由、需人工复核字段。
- RAG 安全判断：是否高风险、是否证据不足。

### 必须二次校验

即使模型支持 JSON Schema，也只能保证更接近结构约束，不能保证业务语义正确。应用层仍要校验：

- 枚举值是否合法。
- 数量范围是否符合业务。
- 引用的 node type / slot / tool 是否存在。
- confidence 是否和 reason 一致。
- 是否缺少必填业务字段。

### 源码形态：模型 schema 与业务校验分离

```python
from pydantic import BaseModel, Field, ValidationError


class PlannerShot(BaseModel):
    id: str
    subject: str
    motion: str
    duration_sec: int = Field(ge=1, le=12)


class PlannerOutput(BaseModel):
    workflow_pattern: str
    aspect_ratio: str
    shot_count: int = Field(ge=1, le=12)
    shots: list[PlannerShot]


def validate_planner_output(raw: str, registry: WorkflowRegistry) -> PlannerOutput:
    try:
        parsed = PlannerOutput.model_validate_json(raw)
    except ValidationError as exc:
        raise RetryableModelOutputError(exc)

    if parsed.workflow_pattern not in registry.patterns:
        raise BusinessValidationError("unknown workflow pattern")
    if len(parsed.shots) != parsed.shot_count:
        raise BusinessValidationError("shot_count does not match shots")
    return parsed
```

面试表达重点：

- Pydantic / JSON Schema 解决结构问题，不自动解决业务语义问题。
- registry 校验解决“模型引用了不存在的工具、节点、slot、pattern”。
- retry 只能处理可修复错误，业务冲突要澄清或 fallback。

## 2. Tool Calling 设计

### 工具声明

一个好工具应该：

- 名字明确，动作单一。
- 参数少而强类型。
- enum 优先于自由文本。
- description 给约束和例子。
- 返回结构稳定，有 error code。
- 对写操作支持 idempotency key。

### 工具执行边界

```mermaid
flowchart LR
  LLM[LLM Tool Proposal] --> S[Schema Validation]
  S --> P[Permission Check]
  P --> B[Business Validation]
  B --> R{Risk Level}
  R -->|safe| E[Execute Tool]
  R -->|dangerous| H[Human Approval]
  H --> E
  E --> A[Audit + Trace]
  A --> O[Tool Result to LLM]
```

### 面试金句

> Tool calling 不是让模型直接操作系统，而是让模型提出结构化 action proposal，系统再做权限、校验、幂等和审计。

### 工具调用的状态机

```text
LLM proposes tool_call
  -> parse arguments
  -> schema validation
  -> permission check
  -> business validation
  -> risk classification
  -> idempotency key
  -> execute
  -> audit log
  -> structured result back to model
```

如果面试官问“模型能不能删数据、发请求、发布内容”，不要只说“加人工审核”。更完整的回答是：

- 工具按风险分级，低风险只校验，高风险必须 review。
- 所有写操作要有 idempotency key，避免重试重复执行。
- 工具返回稳定结构，包含 `ok`、`error_code`、`retryable`、`audit_id`。
- 工具参数只允许 allowlist 资源，不让模型自由拼 URL、路径或 SQL。

## 3. 多模型 Provider 抽象

### 为什么需要

- 降低供应商锁定。
- 支持 Gemini、ERNIE、OpenAI compatible、Claude、DeepSeek、Qwen 等。
- 统一流式、结构化输出、tool calling、usage、error。
- 支持模型路由、fallback 和成本统计。

### Provider 接口建议

```text
generate(request) -> response
stream(request) -> event iterator
validate_capability(model, feature) -> bool
estimate_cost(model, tokens) -> money
normalize_error(error) -> ProviderError
```

### 路由策略

- 高频简单意图：规则或小模型。
- 复杂规划：强模型。
- JSON schema 要求高：选择结构化输出稳定的模型。
- 低延迟路径：预设超时 + fallback。
- 高风险场景：更强模型 + 人工审核。

### 错误归一：不要把 SDK 异常泄漏到业务层

```python
class ProviderError(Exception):
    def __init__(self, code: str, retryable: bool, provider: str, raw: Exception):
        self.code = code
        self.retryable = retryable
        self.provider = provider
        self.raw = raw


def normalize_error(provider: str, error: Exception) -> ProviderError:
    if is_rate_limit(error):
        return ProviderError("rate_limit", True, provider, error)
    if is_context_length(error):
        return ProviderError("context_length", False, provider, error)
    if is_schema_error(error):
        return ProviderError("schema_generation_failed", True, provider, error)
    return ProviderError("unknown_provider_error", False, provider, error)
```

这样模型路由、fallback 和告警系统才能用统一错误码，而不是散落在业务代码里判断各家 SDK 的异常类型。

## 4. Streaming 与用户体验指标

LLM 应用的延迟不能只看 total latency。要拆成：

- Queue latency：排队等待。
- First token latency：首 token 或首事件。
- Stage latency：每个图节点耗时。
- Tool latency：外部工具耗时。
- Retrieval latency：检索和 rerank。
- Total run latency：完整任务完成。

对于 Agent，前端体验依赖结构化进度事件，而不仅是 token：

- 告诉用户“正在识别意图”。
- 告诉用户“正在生成分镜”。
- 告诉用户“DAG 已更新 8 个节点”。
- 告诉用户“校验失败，正在修复”。

## 5. 评测体系

### Eval 分层

```mermaid
flowchart TD
  A[Unit Evals] --> B[Component Evals]
  B --> C[Trajectory Evals]
  C --> D[End-to-End Evals]
  D --> E[Online Monitoring]
  E --> F[Badcase Feedback]
  F --> B
```

| 层级 | 例子 | 评分方式 |
|---|---|---|
| Unit | JSON schema、正则意图 | deterministic |
| Component | RAG Top-K、Classifier | labeled dataset |
| Trajectory | Agent 是否正确调用工具 | trace assertions |
| E2E | DAG 是否可执行 | dry-run / execution |
| Online | 用户反馈、成本、延迟 | monitoring |

### Capability vs Regression

- Capability eval：衡量新能力上限，可以难，通过率不必高。
- Regression eval：防止老能力退化，应该高通过率，适合 CI。

面试里可以说：Agent 评测要看 transcript/trajectory，因为最终答案正确不代表过程安全；过程错误也可能因为运气得到正确答案。

### Trajectory Eval 的断言例子

```yaml
case_id: dag_generation_042
input: "生成 4 个镜头的赛博朋克竖屏短片"
assertions:
  - stage_sequence_contains:
      - intent
      - spec_confirm
      - planner
      - dag_assembly
      - validation
  - tool_call_allowed:
      tool: create_dag_draft
      max_calls: 1
  - json_schema_valid:
      target: planner_output
  - dag_guard_passed: true
  - cost_less_than_usd: 0.08
```

这类断言能证明 Agent 不是“最后文本看起来对”，而是过程也符合系统约束。

## 6. Trace 设计

### Trace Span 结构

```mermaid
flowchart TD
  R[run span] --> I[intent span]
  R --> G[graph stage span]
  G --> M[model call span]
  G --> T[tool call span]
  G --> V[validation span]
  G --> X[execution span]
  M --> U[usage/cost]
  T --> A[audit]
```

### 必备字段

- `session_id`, `run_id`, `user_id`
- `stage`, `node_name`, `thread_id`
- `provider`, `model`, `prompt_version`
- `input_tokens`, `output_tokens`, `cost`
- `latency_ms`, `first_event_ms`
- `tool_name`, `tool_args_hash`, `retry_count`
- `error_type`, `error_code`, `fallback_used`
- `eval_scores`, `user_feedback`

### 为什么要记录 prompt_version？

没有 prompt_version，就无法解释“同一个模型今天效果为什么变了”。Prompt 是代码的一部分，必须可版本化、可回滚、可对比指标。

### Trace 到排障的映射

| 线上症状 | 先看哪个 span | 可能原因 |
|---|---|---|
| 回答慢 | queue / model / tool / retrieval | 队列拥塞、provider 抖动、rerank 慢 |
| DAG 不可执行 | planner / validation / assembly | pattern 选错、slot 缺失、registry 版本不一致 |
| 成本突增 | usage / prompt_version | 上下文膨胀、fallback 频繁、重试循环 |
| 安全漏判 | risk classifier / post-check | 风险规则缺失、judge rubric 弱 |
| 用户刷新丢状态 | event / checkpoint | event store 缺失、thread_id 不一致 |

## 7. 成本治理

### 降成本手段

- 高频明确意图规则化。
- 小模型/便宜模型处理分类。
- 上下文压缩和结构化状态。
- RAG 只传必要片段。
- tool result 摘要化。
- cache 相似 case 和静态知识。
- 失败重试设置 budget。
- 离线评测比较 prompt/model 成本收益。

### 成本指标

- cost per run。
- cost per successful task。
- cost by stage。
- cost by model/provider。
- token by prompt version。
- fallback cost。

## 8. 安全与权限

### LLM 输出永远是不可信输入

即使是自己调用的模型，也要把它的输出当成外部输入：

- 参数校验。
- SQL/命令/API 注入防护。
- URL/domain allowlist。
- 文件路径限制。
- secret 不进 prompt。
- 高风险工具审批。

### Prompt Injection 防护

RAG 或网页内容里可能出现“忽略之前指令”。应对方式：

- 系统指令区分数据和指令。
- 检索内容加引用边界。
- 工具调用前做策略校验。
- 不把敏感工具暴露给所有上下文。
- 对外部内容来源打 trust level。

## 9. 必背问题

### LLM-as-a-judge 可靠吗？

可靠性取决于任务。它适合开放质量维度，比如相关性、完整性、语气，但不应替代确定性校验。关键要用人工标注校准 judge，并用固定 rubric、pairwise 或多次采样降低噪声。

### Agent 线上出了 badcase 怎么排？

先看 trace：意图是否错、检索是否命中、rerank 是否排错、prompt version、模型输出、工具参数、validation error、fallback。然后把 badcase 分类，加入 eval dataset，修复后跑离线实验，再灰度。

### 为什么只看用户点赞不够？

用户反馈稀疏且偏向极端，无法覆盖隐藏错误。需要自动评测、生产监控、人工抽检、A/B 测试多层信号。

## 10. 官方与高质量资料

- Gemini Structured Outputs：<https://ai.google.dev/gemini-api/docs/structured-output>
- Gemini Function Calling：<https://ai.google.dev/gemini-api/docs/function-calling>
- OpenAI Agents SDK：<https://platform.openai.com/docs/guides/agents-sdk/>
- OpenAI Agents SDK Tracing：<https://openai.github.io/openai-agents-python/tracing/>
- Anthropic Writing Tools for Agents：<https://www.anthropic.com/engineering/writing-tools-for-agents>
- Anthropic Agent Evals：<https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents>
- LangSmith Evaluation：<https://docs.langchain.com/langsmith/evaluation>
- Langfuse Overview：<https://langfuse.com/docs/>
- OpenTelemetry GenAI Semantic Conventions：<https://opentelemetry.io/docs/specs/semconv/gen-ai/>
