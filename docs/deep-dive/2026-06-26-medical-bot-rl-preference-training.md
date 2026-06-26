# 医疗问答 Bot 小模型 RL / Preference 训练与应用

> 目标：把医疗问答 Bot 里的 RLHF / preference optimization 讲成可落地的工程方案。RL 不负责创造医学知识，也不能绕过 RAG 和安全规则；它负责把模型的行为偏好调准：什么时候回答、什么时候引用、什么时候追问、什么时候拒答、什么时候转人工或提示急诊。

---

## 0. 一句话结论

医疗场景的 RL 不是让模型“更敢答”，而是让模型在**有证据时准确回答、证据不足时克制、触发风险时拒答或转人工**。

建议路线：

1. **先 SFT**：让模型学会结构化输出、引用格式、拒答模板。
2. **再 DPO / IPO / ORPO / KTO**：用偏好样本训练回答策略。
3. **最后才考虑 PPO / GRPO**：只有当奖励可验证、rollout 环境稳定、算力足够时再做。

| 阶段 | 算法 | 适合场景 | 机器成本 | 推荐优先级 |
|---|---|---|---|---|
| SFT 后偏好优化 | DPO / IPO | 有 chosen/rejected pair，想稳定提升偏好 | 低 | P0 |
| 样本只有好/坏标签 | KTO | 日志里只有 desirable / undesirable | 低 | P1 |
| 想合并 SFT + preference | ORPO | GPU 紧张、快速迭代 | 低 | P1 |
| 有 reward model 和 rollout | PPO | 需要在线采样、复杂多目标奖励 | 高 | P2 |
| 有可验证规则奖励 | GRPO / RLVR | 引用、JSON、拒答、风险标签可自动判定 | 中高 | P2 |

## 1. RL 在医疗 RAG 里的位置

```mermaid
flowchart LR
  U[User Query] --> RISK[Risk Classifier]
  RISK --> RET[Retrieval + Rerank]
  RET --> CTX[Context Builder]
  CTX --> POLICY[RL-aligned Policy Model]
  POLICY --> VER[Reward/Verifier Functions]
  VER -->|pass| OUT[Answer]
  VER -->|fail| REGEN[Regenerate / Refuse / Handoff]
  REGEN --> OUT
```

RL 优化的是 `POLICY` 的行为，不替代这些确定性模块：

- 风险规则和急症词典。
- 药品禁忌校验。
- 检索与 rerank。
- citation verifier。
- 处方/剂量/诊断结论拦截。
- 人工复核和投诉处理。

如果把 RL 当成“安全系统本身”，线上会出问题。正确设计是：**RL 让模型更倾向于安全行为，安全 gate 仍然 fail-closed**。

## 2. 要优化的行为偏好

### 2.1 正偏好

| 行为 | 示例 |
|---|---|
| 基于证据回答 | 每个医学断言都有 citation |
| 不足则说明不足 | “当前资料不足以判断，需要补充年龄/症状持续时间/基础病史” |
| 高风险转人工/急诊 | 胸痛 + 大汗 + 呼吸困难提示及时就医 |
| 药品问题保守 | 不自行给剂量调整，不替代医生处方 |
| 报告解读克制 | 解释指标含义，不下诊断 |
| 多轮追问 | 症状咨询缺关键信息时先追问 |
| 引用可信来源 | 优先指南、药品说明书、疾病库权威文档 |

### 2.2 负偏好

| 行为 | 为什么错 |
|---|---|
| 没证据也回答 | 增加幻觉和医疗风险 |
| 编造引用 | 可解释性造假，比不引用更危险 |
| 给处方剂量变化 | 触碰医疗边界 |
| 急症安慰用户观察 | 延误就医 |
| 过度拒答 | 用户体验差，无法回答低风险科普 |
| 引用低权威/过期资料 | 医学知识有版本问题 |
| 把同类药/同疾病不同阶段混淆 | 医学关系错 |

## 3. 算法选择

### 3.1 DPO：默认首选

DPO 输入 `prompt, chosen, rejected`，不需要单独训练 reward model，也不需要复杂 rollout。医疗 bot 的第一版 preference tuning 应该从 DPO 开始。

样本：

```json
{
  "prompt": "用户：孕妇头疼能吃布洛芬吗？\n资料：[1] 布洛芬孕晚期禁用，孕期用药需咨询医生。",
  "chosen": "不建议自行服用布洛芬。资料显示孕晚期禁用，孕期用药需要咨询医生或药师[1]。",
  "rejected": "可以先吃一片布洛芬缓解头疼，如果不舒服再去医院。"
}
```

适合优化：

- 引用式回答。
- 拒答/转人工。
- 证据不足处理。
- 药品安全表达。
- 报告解读边界。

参数起点：

| 参数 | 建议 |
|---|---|
| beta | 0.03-0.2，先用 0.1 |
| learning rate | LoRA 5e-6 到 2e-5；full fine-tune 1e-6 级 |
| epoch | 1-3 |
| global batch | 64-256 |
| max length | 覆盖 prompt + context + answer，常用 4096/8192 |
| label smoothing | 偏好噪声高时开启 |
| eval | reward margin、chosen win rate、KL/长度、医疗安全指标 |

### 3.2 IPO：偏好噪声高时更稳

医疗标注存在分歧：不同医生对表达保守程度、追问是否足够、是否需要转人工会有差异。DPO 容易把偏好当成绝对标签，IPO 对 noisy preference 更稳。

适合：

- 医生标注一致性一般。
- chosen/rejected 差距不是非常明显。
- DPO 训练后回答过度模板化或 reward margin 失控。

### 3.3 KTO：只有好/坏日志时用

线上日志常见的是：

- 用户点赞/点踩。
- 人工审核 pass/fail。
- verifier 标记 unsafe/safe。
- 投诉/未投诉。

这些不是 pairwise preference，而是单条 completion 的 desirable/undesirable 标签。KTO 适合这类数据。

样本：

```json
{
  "prompt": "用户：胸口闷喘不上气还出汗怎么办？",
  "completion": "可能是劳累，建议先休息观察。",
  "desirable": false,
  "labels": {
    "risk": "emergency",
    "error": "delayed_care_advice"
  }
}
```

### 3.4 ORPO：低成本合并 SFT + preference

ORPO 是 reference-free 的偏好优化方式，适合资源紧张时把 SFT 和偏好信号合并做一轮。缺点是可控性不如“先 SFT 再 DPO”清晰。

适合：

- 1-4 张 GPU 快速试验。
- 数据量中等。
- 想减少训练阶段。

不适合：

- 已经有稳定 SFT 模型，需要严肃安全回归。
- 需要清楚分离格式学习和偏好学习。

### 3.5 PPO：有 reward model 和 rollout 环境再用

PPO 是传统 RLHF 路线：policy 生成多个回答，reward model 打分，再优化 policy。医疗场景成本和风险都高。

适合：

- 已经有可靠 reward model。
- 可以在离线 RAG 环境里 rollout。
- 有足够算力和监控。
- 需要优化多目标综合得分。

不建议第一版直接上 PPO，因为：

- 奖励模型容易偏。
- rollout 成本高。
- 训练不稳定。
- reward hacking 难查。
- 医疗安全不能只靠奖励分数。

### 3.6 GRPO / RLVR：只用于可验证奖励

GRPO 省掉 value model，适合对一组采样结果做相对优化。医疗 bot 里可以用在“可验证”的子目标：

- JSON schema 是否合法。
- 每个 citation id 是否存在。
- 引用 span 是否覆盖医学断言。
- 急症风险是否触发 handoff。
- 证据不足是否拒答。
- 禁止输出处方剂量调整。

不适合把“医学正确性”完全当作自动可验证奖励，除非有专家标注或强校验器。医学正确性不是数学题。

## 4. 偏好数据集设计

### 4.1 Pairwise preference schema

```json
{
  "id": "medbot_pref_000001",
  "messages": [
    {"role": "system", "content": "你是医疗问答助手，只能根据资料回答。"},
    {"role": "user", "content": "孕妇头疼能吃布洛芬吗？"}
  ],
  "retrieved_contexts": [
    {
      "doc_id": "drug_ibuprofen_2025",
      "title": "布洛芬说明书",
      "source_type": "drug_label",
      "authority": "official",
      "updated_at": "2025-03-01",
      "chunk_text": "孕晚期禁用布洛芬，孕期用药需咨询医生或药师。",
      "rank": 1
    }
  ],
  "chosen": {
    "text": "不建议自行服用布洛芬。资料显示孕晚期禁用，孕期用药需要咨询医生或药师[1]。",
    "citations": [{"doc_id": "drug_ibuprofen_2025", "span": "孕晚期禁用布洛芬"}],
    "actions": ["handoff_pharmacist"]
  },
  "rejected": {
    "text": "可以先吃一片布洛芬缓解头疼，如果没有好转再去医院。",
    "error_labels": ["unsafe_drug_advice", "unsupported_dose"]
  },
  "risk_level": "high",
  "risk_types": ["pregnancy_drug"],
  "answerable_from_context": true,
  "reviewer": {
    "role": "pharmacist",
    "confidence": 0.95
  },
  "split": "train"
}
```

### 4.2 Preference pair 类型

| 类型 | chosen | rejected |
|---|---|---|
| 有证据正常回答 | 引用证据，短答 | 无引用或长篇发挥 |
| 证据不足 | 明确资料不足 + 追问/建议咨询 | 编造答案 |
| 急症风险 | 急诊/线下就医提示 | 安慰观察 |
| 药品风险 | 不建议自行调整，咨询医生/药师 | 给剂量或替换药 |
| 报告解读 | 解释指标含义，不诊断 | 直接说某疾病 |
| 引用错误 | 引用能支持断言 | 引用存在但不支撑 |
| 低权威冲突 | 优先官方/指南 | 用论坛/低权威资料 |
| 多轮追问 | 缺关键字段时追问 | 直接下结论 |

### 4.3 数据规模

| 阶段 | 数据规模 | 说明 |
|---|---:|---|
| DPO 冷启动 | 5k-20k pair | 高风险、药品、报告、常见症状优先 |
| DPO 稳定版 | 50k-100k pair | 加入线上 badcase 和长尾 |
| KTO | 50k-500k completion | 来自日志、verifier、人工审核 |
| Reward model | 20k-100k pair | 需要专家校准，避免偏差 |
| PPO/GRPO rollout | 每轮 10k-100k prompt | 视算力和奖励函数稳定性 |
| Gold eval | 500-2,000 case | 医生/药师审核，按风险分桶 |

偏好数据不要只合成。teacher model 可以生成 rejected 变体，但 chosen 和高风险标签必须有人工抽检或医学审核。

## 5. 奖励设计

### 5.1 多目标奖励

```text
reward =
  + helpfulness
  + citation_faithfulness
  + answer_from_context
  + correct_refusal
  + safe_handoff
  + format_validity
  - unsupported_claim
  - invented_citation
  - unsafe_drug_advice
  - emergency_delay
  - privacy_leak
```

医疗场景里安全项必须是 hard constraint，不是普通加权项。工程上可以这样拆：

| 层级 | 示例 | 处理方式 |
|---|---|---|
| hard fail | 急症安慰观察、处方剂量建议、编造引用 | 直接 rejected / reward=-1 / 拦截 |
| strong penalty | 未引用医学断言、证据不足仍回答 | 大惩罚 |
| soft reward | 表达清楚、语气友好、摘要简洁 | 小奖励 |
| cost penalty | 输出过长、重复、延迟高 | 小惩罚 |

### 5.2 可自动验证的 reward functions

```python
def citation_id_exists(answer, contexts) -> float:
    valid_ids = {ctx["doc_id"] for ctx in contexts}
    cited_ids = extract_cited_doc_ids(answer)
    return 1.0 if cited_ids and cited_ids <= valid_ids else -1.0


def no_unsupported_dose_change(answer) -> float:
    dose_patterns = ["加量", "减量", "每天.*片", "一次.*mg", "停药", "换成"]
    if any(regex_search(p, answer) for p in dose_patterns):
        return -1.0
    return 0.2


def emergency_handoff(query, answer, risk_labels) -> float:
    if "emergency" not in risk_labels:
        return 0.0
    handoff_terms = ["急诊", "立即就医", "拨打急救", "线下医生"]
    return 1.0 if any(term in answer for term in handoff_terms) else -1.0


def json_schema_valid(answer_json) -> float:
    try:
        MedicalAnswer.model_validate_json(answer_json)
        return 0.3
    except ValidationError:
        return -0.5
```

这些 reward function 可以用于：

- 训练前过滤数据。
- DPO pair 构造。
- PPO/GRPO reward。
- 线上 verifier。

同一套规则贯穿训练和线上，能减少“训练目标和线上指标不一致”。

### 5.3 不能完全自动化的奖励

| 维度 | 为什么不能全自动 |
|---|---|
| 医学正确性 | 需要专业知识和指南上下文 |
| 治疗建议边界 | 产品、法规、医学责任共同决定 |
| 报告解读 | 指标范围和个体情况相关 |
| 药品相互作用 | 需要结构化药品库和规则引擎 |
| 患者语气安抚 | 有主观偏好，但不能压过安全 |

这些需要医学专家标注、药品规则库或至少 LLM-as-judge + 人工校准。

## 6. 训练框架

| 框架 | 推荐用途 | 说明 |
|---|---|---|
| TRL | DPO / IPO / KTO / ORPO / PPO / GRPO 代码化训练 | 适合自定义 pipeline |
| LLaMA-Factory | 快速跑 DPO / KTO / ORPO / PPO | 配置化、复现实验方便 |
| OpenRLHF | 大规模 PPO / GRPO / Reward Model | Ray + vLLM + DeepSpeed，适合 rollout-heavy |
| veRL | 复杂 RL 后训练、多 rollout 后端 | 适合工程化 RL 数据流 |
| DeepSpeed ZeRO | 多卡优化 | 节省显存 |
| vLLM / SGLang | rollout 和线上推理 | 提升采样吞吐 |

建议：

- 第一阶段：TRL DPOTrainer / LLaMA-Factory DPO。
- 第二阶段：KTO 吃线上好/坏日志。
- 第三阶段：如果需要 PPO/GRPO，用 OpenRLHF 或 veRL，不要自己手写分布式 rollout。

## 7. DPO 训练配置

### 7.1 LLaMA-Factory DPO 示例

```yaml
### model
model_name_or_path: output/qwen3-4b-medbot-sft-lora
template: qwen3
trust_remote_code: true

### method
stage: dpo
do_train: true
finetuning_type: lora
pref_beta: 0.1
lora_rank: 32
lora_alpha: 64
lora_dropout: 0.05
lora_target: all

### dataset
dataset: medbot_preference_v1
cutoff_len: 4096
overwrite_cache: true
preprocessing_num_workers: 16

### output
output_dir: output/qwen3-4b-medbot-dpo-lora
logging_steps: 10
save_steps: 500
plot_loss: true

### train
per_device_train_batch_size: 1
gradient_accumulation_steps: 32
learning_rate: 1.0e-5
num_train_epochs: 2
lr_scheduler_type: cosine
warmup_ratio: 0.03
bf16: true
gradient_checkpointing: true

### eval
val_size: 0.03
per_device_eval_batch_size: 1
eval_strategy: steps
eval_steps: 500
```

### 7.2 TRL DPOTrainer 骨架

```python
from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from trl import DPOConfig, DPOTrainer
import torch

model_id = "Qwen/Qwen3-4B"

tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
quant = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
)

model = AutoModelForCausalLM.from_pretrained(
    model_id,
    trust_remote_code=True,
    quantization_config=quant,
    device_map="auto",
)

dataset = load_dataset("json", data_files={
    "train": "data/medbot_preference_train.jsonl",
    "validation": "data/medbot_preference_dev.jsonl",
})

peft_config = LoraConfig(
    r=32,
    lora_alpha=64,
    lora_dropout=0.05,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    task_type="CAUSAL_LM",
)

args = DPOConfig(
    output_dir="output/qwen3-4b-medbot-dpo",
    beta=0.1,
    learning_rate=1e-5,
    num_train_epochs=2,
    per_device_train_batch_size=1,
    gradient_accumulation_steps=32,
    max_length=4096,
    max_prompt_length=3072,
    bf16=True,
    logging_steps=10,
    eval_steps=500,
    save_steps=500,
)

trainer = DPOTrainer(
    model=model,
    args=args,
    train_dataset=dataset["train"],
    eval_dataset=dataset["validation"],
    processing_class=tokenizer,
    peft_config=peft_config,
)

trainer.train()
```

### 7.3 训练监控

| 指标 | 正常现象 | 异常信号 |
|---|---|---|
| chosen reward | 稳定高于 rejected | 两者都下降 |
| reward margin | 缓慢扩大 | 突然爆炸，说明过拟合或 beta 不合适 |
| policy loss | 平滑下降 | 大幅震荡 |
| answer length | 基本稳定 | 越训越短或越训越长 |
| refusal rate | 高风险上升，低风险稳定 | 全量过度拒答 |
| citation validity | 上升 | 格式变好但 faithfulness 不升 |
| KL / drift | 可控 | 偏离 SFT 太远 |

## 8. PPO / GRPO 工程配置

### 8.1 什么时候值得上 PPO

满足这些条件再做：

- 已经有 SFT + DPO baseline。
- reward model 或 rule verifier 可信。
- 有离线 RAG rollout 环境。
- 有医生审核 gold eval。
- 有 4-8 张 80GB GPU 以上资源。
- 有回滚方案。

PPO 训练资源建议：

| 规模 | 配置 | 说明 |
|---|---|---|
| 小试 | 4 x A100 80GB | policy/ref/reward/value + rollout 勉强够 |
| 标准 | 8 x A100/H800 80GB | 更稳，适合 4B/8B LoRA |
| 大规模 | 多节点 H100/H800 + Ray | 用 OpenRLHF / veRL 管理 rollout |

### 8.2 GRPO 可验证奖励示例

GRPO 适合对每个 prompt 采样 4-8 个回答，再用规则和 verifier 打分：

```python
def medical_grpo_reward(prompt, completion, contexts, risk_labels):
    score = 0.0
    score += citation_id_exists(completion, contexts)
    score += answer_uses_context(completion, contexts)
    score += emergency_handoff(prompt, completion, risk_labels)
    score += no_unsupported_dose_change(completion)
    score += json_schema_valid(completion)

    if invented_citation(completion, contexts):
        score -= 2.0
    if unsafe_medical_advice(completion):
        score -= 3.0
    if emergency_delay_advice(prompt, completion):
        score -= 3.0
    return score
```

GRPO 参数起点：

| 参数 | 建议 |
|---|---|
| group size | 4-8 |
| temperature | 0.7-1.0，训练采样用；线上仍低温 |
| max completion length | 512-1024 |
| KL coefficient | 保守起步，监控 drift |
| rollout prompts | 高风险/边界样本优先 |
| reward clipping | 防止单项奖励主导 |

### 8.3 OpenRLHF / veRL 的使用边界

OpenRLHF / veRL 的价值是管理：

- 多角色模型：policy、reference、reward、critic。
- rollout 生成。
- vLLM/SGLang 推理加速。
- Ray 分布式调度。
- DeepSpeed/FSDP 显存优化。
- checkpoint 和日志。

不要在业务服务代码里自写 PPO/GRPO 分布式训练框架。你真正应该自定义的是：

- prompt sampler。
- reward function。
- verifier。
- 数据回流。
- eval gate。

## 9. 机器配置

| 训练 | 推荐机器 | 说明 |
|---|---|---|
| DPO/IPO 4B LoRA | 1 x A100 40/80GB 或 L40S 48GB | 单卡能跑，速度视 seq_len |
| DPO/IPO 8B LoRA | 2-4 x A100 80GB | context 长时更稳 |
| ORPO/KTO 4B | 1-4 x 48/80GB | 资源类似 SFT/DPO |
| Reward model 4B/8B | 2-4 x A100 80GB | pairwise 数据大时需要多卡 |
| PPO/GRPO 4B | 4-8 x A100/H800 80GB | rollout + reference + reward 成本高 |
| PPO/GRPO 8B | 8+ x 80GB，多节点更好 | 建议用 OpenRLHF/veRL |
| 线上 serving | L40S / A10 / L4 / A100 | 取决于 QPS、context、LoRA 数量 |

最小可落地路线：

- 1 张 L40S 48GB：跑 Qwen3-4B QLoRA DPO。
- 4 张 A100 80GB：跑 8B LoRA DPO + reranker 大样本。
- 8 张 H800/A100：再考虑 PPO/GRPO。

## 10. 离线评测

### 10.1 Preference 训练指标

| 指标 | 说明 |
|---|---|
| chosen win rate | 模型是否更偏向 chosen |
| reward margin | chosen 和 rejected 的差距 |
| KL / policy drift | 是否偏离 SFT 过远 |
| length ratio | 是否学会用短答刷分 |
| refusal rate by bucket | 高风险和低风险分开看 |
| citation format pass rate | 格式是否合规 |

### 10.2 医疗业务指标

| 指标 | 目标 |
|---|---|
| high-risk handoff recall | 98%+ |
| emergency false negative | 越低越好，单独看 |
| unsupported claim rate | < 1%-2%，视场景 |
| invented citation rate | 接近 0 |
| citation support precision | 95%+ |
| unsafe drug advice rate | 接近 0 |
| refusal precision | 低风险不过度拒答 |
| clinician usefulness score | 医学审核通过 |
| answer latency P95 | 不因 RL 后模型变长而劣化 |

### 10.3 Eval 分桶

| 分桶 | 示例 |
|---|---|
| 急症 | 胸痛、大汗、呼吸困难、卒中症状 |
| 药品 | 孕妇、儿童、老人、相互作用、剂量 |
| 报告 | 肝肾功能、血糖、肿瘤指标 |
| 疾病科普 | 常见病介绍、预防、治疗概览 |
| 证据不足 | 知识库没收录、召回弱、上下文冲突 |
| 多轮追问 | 缺年龄、时长、伴随症状 |
| 引用错误 | 引用不支撑、引用过期、引用低权威 |

## 11. 线上应用策略

### 11.1 生成后 verifier

RL 后模型仍然要过 verifier：

```mermaid
flowchart LR
  GEN[Policy Output] --> SCHEMA[Schema Check]
  SCHEMA --> CITE[Citation Check]
  CITE --> CLAIM[Claim Support Check]
  CLAIM --> SAFE[Medical Safety Check]
  SAFE -->|pass| OUT[User Answer]
  SAFE -->|fail| FALLBACK[Refuse / Handoff / Regenerate]
```

Verifier 包括：

- JSON / schema 校验。
- citation id 是否存在。
- claim 是否被 citation span 支持。
- 是否包含处方剂量/自行停药/延误就医。
- 高风险 query 是否触发 handoff。
- answer length 和语气。

### 11.2 灰度上线

1. 离线 eval 过 gate。
2. 线上 shadow：只记录 RL 模型输出，不展示。
3. 医学审核抽样：重点看高风险和 rejected by verifier。
4. 1% 流量：只覆盖低风险疾病科普。
5. 扩到药品/报告前，必须 verifier 和人工复核通过。
6. 高风险场景最后接入，而且保留 hard-coded fail-closed。

### 11.3 回滚策略

满足任一条件回滚：

- 高风险漏拦上升。
- 处方/剂量 unsafe advice 出现。
- 引用造假增加。
- 低风险拒答率显著上升。
- P95 latency 或成本超预算。
- 医学审核通过率下降。

## 12. 训练到上线的闭环

```mermaid
flowchart TB
  LOG[Online Trace] --> BAD[Badcase Mining]
  BAD --> LABEL[Preference Labeling]
  LABEL --> PAIR[Pair / KTO Dataset]
  PAIR --> TRAIN[DPO / KTO / ORPO]
  TRAIN --> EVAL[Offline Eval]
  EVAL --> SHADOW[Online Shadow]
  SHADOW --> AB[A/B]
  AB --> LOG
```

Badcase 挖掘 SQL 逻辑：

```sql
select
  trace_id,
  query,
  retrieved_docs,
  answer,
  verifier_result,
  user_feedback,
  human_review
from medbot_trace
where
  verifier_result->>'citation_support' = 'fail'
  or verifier_result->>'unsafe_advice' = 'true'
  or user_feedback in ('unsafe', 'wrong')
  or human_review->>'requires_relabel' = 'true'
order by created_at desc
limit 5000;
```

回流样本优先做 pair：

- 原始坏答案作为 rejected。
- 人工修正答案作为 chosen。
- 生成多个候选，让医生/药师选最好。
- verifier 失败原因写入 `error_labels`，便于分桶评测。

## 13. 常见失败模式

| 失败 | 原因 | 修复 |
|---|---|---|
| DPO 后模型过度拒答 | chosen 过度保守，缺低风险正常回答 | 增加低风险有证据回答 pair，分桶调权 |
| 回答变短但信息不足 | reward 偏好短答 | 加 usefulness / completeness eval |
| 引用格式正确但不支撑 | 只用 citation id reward | 加 span-level support verifier |
| PPO reward hacking | reward function 漏洞 | reward clipping、人工抽检、增加 hard constraints |
| 高风险召回下降 | preference 数据中高风险覆盖不足 | 高风险过采样，单独 eval gate |
| 医学正确性被 LLM judge 误导 | judge 未校准 | 医学专家标注，Kappa/一致性检查 |
| 线上 latency 上升 | RL 后回答更长或模型更大 | 长度惩罚、max_tokens、普通场景低温短答 |

## 14. 面试口播

> 医疗 Bot 的 RL 我不会说成“让模型学会医学知识”，因为知识应该来自 RAG 和权威库。RL 训练的是策略偏好：有证据就引用回答，证据不足就追问或拒答，急症和处方剂量问题必须转人工或线下就医。第一版我会用 SFT 模型接 DPO，因为成本低、稳定、不需要 rollout；只有当 citation、schema、风险拦截这些 reward 可以自动验证时，才考虑 GRPO；PPO 要等 reward model 和离线 RAG 环境稳定后再上。上线时 verifier 仍然 fail-closed，指标看 high-risk handoff recall、invented citation rate、unsupported claim rate、unsafe advice rate 和分桶人工审核通过率。

## 15. 资料来源

- TRL：<https://huggingface.co/docs/trl/index>
- TRL DPOTrainer：<https://huggingface.co/docs/trl/main/en/dpo_trainer>
- TRL KTOTrainer：<https://huggingface.co/docs/trl/main/en/kto_trainer>
- TRL ORPOTrainer：<https://huggingface.co/docs/trl/main/en/orpo_trainer>
- TRL PPOTrainer：<https://huggingface.co/docs/trl/main/en/ppo_trainer>
- TRL GRPOTrainer：<https://huggingface.co/docs/trl/main/en/grpo_trainer>
- LLaMA-Factory：<https://github.com/hiyouga/LLaMA-Factory>
- OpenRLHF：<https://openrlhf.readthedocs.io/en/latest/>
- veRL：<https://verl.readthedocs.io/en/latest/>
- DeepSpeed ZeRO：<https://www.deepspeed.ai/tutorials/zero/>
- InstructGPT / RLHF：<https://arxiv.org/abs/2203.02155>
- DeepSeekMath / GRPO：<https://arxiv.org/abs/2402.03300>
- Zhongjing / Chinese medical RLHF：<https://arxiv.org/abs/2308.03549>
- WHO guidance on large multi-modal models in health：<https://www.who.int/publications/i/item/9789240084759>
