# UGC LLM Judge · Prompt 设计与失败模式

> 配合 [baidu-map-ugc.md](../baidu-map-ugc.md) Q5/Q9 食用。

---

## 1. 设计目标

让 LLM 在 UGC 审核场景输出 **可解释、可校验、可回溯** 的决策。约束：

- 不能编造 reason。
- 不能在证据不足时硬决策。
- 输出必须 schema 合法。
- 高敏 case 必须 manual_review。

---

## 2. Prompt 模板（生产版骨架）

```text
# Role
你是百度地图 POI UGC 审核员，目标是判断用户上报是否应采纳。

# Decision Rules（必须遵守）

1. evidence_supports
   - 至少 2 类证据互相印证（用户文本、图片 OCR、同窗口其他用户上报、POI 历史变更）。
   - 高敏类（关停 / 转让 / 涉法）需要更强证据：图片 + 时间戳合理 + 至少 2 个独立用户。

2. evidence_insufficient
   - 单一来源、缺失关键字段、证据相互冲突 → manual_review。

3. user_description_inconsistent
   - 用户描述与 POI 现状冲突时按证据强度倾向：
     - 单用户独证 < POI 现有数据
     - 单用户 + 1 独立用户 + 图片 ≥ POI 现有数据
     - 2+ 独立用户 + 多张图片证据 > POI 现有数据

4. sensitive_no_evidence
   - 涉法 / 涉隐私 / 投诉 / 暴力 → manual_review，不要尝试判断。

5. ambiguous_intent
   - 不确定用户意图 → manual_review。

6. 拒答优先
   - 你不确定 → manual_review。confidence < 0.7 必须 manual_review。

# Input

POI 现有数据：
{poi_current_json}

用户上报字段：
{user_report_json}

用户描述文本：
{user_text}

证据图片 OCR / 描述：
{evidence_summary}

用户信誉：{user_trust:.2f}

该 POI 近 30 天历史变更：
{poi_history}

同窗口其他用户上报：
{similar_reports}

# Output JSON Schema
{schema_str}

# Examples（来自历史真实标注）
{few_shot_examples}

# Now decide
请按 schema 输出 JSON，不要写 JSON 之外的任何内容。
```

---

## 3. Schema 定义

```python
class LLMAuditDecision(BaseModel):
    decision: Literal["approve", "reject", "manual_review"]
    confidence: float = Field(ge=0, le=1)
    reason_codes: list[Literal[
        "evidence_supports",
        "evidence_insufficient",
        "user_description_inconsistent",
        "geo_inconsistent",
        "content_quality_low",
        "sensitive_no_evidence",
        "needs_human_judgment",
        "ambiguous_intent",
        "consensus_reached",
        "single_source_weak",
    ]]
    evidence: list[EvidenceRef]  # 引用的具体字段 / 文本片段
    risk_flags: list[Literal[
        "legal", "privacy", "complaint", "violence", "ad", "spam",
    ]] = Field(default_factory=list)
    manual_review_fields: list[str] = Field(default_factory=list)
    suggested_action: str | None = None
    decision_summary: str = Field(max_length=200)

class EvidenceRef(BaseModel):
    source: Literal["user_text", "image_ocr", "similar_report", "poi_history"]
    snippet: str = Field(max_length=200)
    weight: float = Field(ge=0, le=1)
```

---

## 4. Few-shot 选样原则

不要用合成 example，**全部从真实评测集挑边界 case**：

| 类别 | 数量 | 选样 |
|---|---|---|
| 明确 accept | 1 | 高置信、多证据一致 |
| 明确 reject | 1 | 黑产典型 |
| 边界 manual | 2 | LLM 历史误判过的 case |
| 高敏 manual | 1 | 涉法 / 涉隐私 |

少而精比 8 个堆叠更稳定。

---

## 5. 常见失败模式 + 修法

### 5.1 自信幻觉

模型输出 `decision=approve, confidence=0.9` 但证据其实不足。

**原因：**

- Prompt 没强调「拒答优先」。
- Few-shot 全是 approve / reject，缺 manual_review 案例。

**修法：**

1. Prompt 加 hard rule：`confidence < 0.7 → 必须 manual_review`。
2. 业务侧二次校验：confidence < 0.7 的 approve / reject 强制改成 manual_review。
3. Few-shot 必有 manual_review 案例。

### 5.2 reason_codes 编造

模型输出 reason_code 不在 enum 内。

**修法：**

- 用 strict JSON Schema（OpenAI strict mode / Gemini response_schema）。
- 二次 enum 校验，不合法的整条 retry。

### 5.3 evidence 引用错

模型给的 evidence 文本对，但 `source` 字段错（把 image_ocr 标成 user_text）。

**修法：**

- evidence 字段加二次 string match 校验：snippet 必须能在指定 source 字段里找到。
- 找不到→ retry-with-feedback。

### 5.4 用 Markdown / 自然语言包裹 JSON

```
某些情况下模型会输出：
```json
{...}
```
而不是纯 JSON。
```

**修法：**

- 用 `response_mime_type="application/json"` 强制（Gemini）。
- 客户端兜底用 robust JSON parser，能从 markdown code block 提取。

### 5.5 长 Context 失忆

Prompt 太长，模型忘了 Decision Rules。

**修法：**

- 控制 prompt 在 4-6k token。
- Rules 放在 prompt **末尾**（recency bias），比开头记得稳。
- 长字段（poi_history、similar_reports）做摘要 / 截断。

### 5.6 时间戳判断错

用户截图证据，EXIF 是截图时间不是拍摄时间。模型把截图当「最近变化」。

**修法：**

- 图片处理层标 `evidence_freshness: "screenshot" | "photo_taken" | "unknown"`。
- Prompt 里明确说明：「截图证据不能作为时效性参考」。

---

## 6. Retry with feedback 完整流程

```python
async def llm_judge(report, max_retry=3):
    last_error = None
    for attempt in range(max_retry):
        prompt = build_prompt(report)
        if last_error:
            prompt += f"\n\n上次输出错误：{last_error}，请修正后重新生成。"
        try:
            raw = await llm.generate(
                prompt,
                response_schema=LLMAuditDecision,
                temperature=0.2,
            )
            decision = LLMAuditDecision.model_validate_json(raw)
            # 二次校验
            validate_evidence(decision, report)
            validate_business_rules(decision, report)
            return decision
        except (ValidationError, BusinessRuleError) as e:
            last_error = str(e)
    # 所有重试失败 → 转 HITL
    return LLMAuditDecision(decision="manual_review",
                            confidence=0.0,
                            reason_codes=["needs_human_judgment"])
```

---

## 7. Prompt 版本管理

每次改 prompt：

1. 写新版本号（语义化：major.minor.patch）。
2. 跑评测集：和当前版本对比，准确率、manual_review 比例、错改率。
3. 影子流量：5% 流量并行跑，比较输出差异。
4. 灰度上线：5% → 25% → 50% → 100%。
5. 上线后看 dashboard：错改率、manual_review 占比、cost。

```python
@register_prompt(name="ugc.audit", version="v4.1.0")
def audit_prompt(ctx: AuditContext) -> str:
    return env.get_template("ugc_audit.j2").render(ctx=ctx)
```

---

## 8. 跨模型迁移

同一 prompt 在 Gemini / 文心 / GPT-4o 表现差异：

| 模型 | 优势 | 劣势 |
|---|---|---|
| Gemini 2.5 Pro | 长上下文 + multimodal + response_schema 友好 | 偶尔 over-cautious |
| 文心 ERNIE | 中文 vocab 强 + 国内合规 | response_schema 支持弱 |
| GPT-4o | strict JSON mode 最严 | 成本高 + 国内访问受限 |

**做法：**

- Provider 抽象 + retry 策略针对不同模型差异化。
- 评测集分模型跑，按模型选最优 prompt 微调。

---

## 9. 一句话总结

> **LLM Judge 的核心不是「让模型更聪明」，而是「让模型在不确定时学会说不」。** Prompt + Schema + Retry + Validate 四件套缺一不可。
