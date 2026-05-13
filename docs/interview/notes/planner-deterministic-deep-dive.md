# Planner + 确定性装配 深度拆解

> 配合 [artarch-ai.md](../artarch-ai.md) Q7/Q8 食用。这套模式是 ArtArch.AI 把 DAG 一次性可执行率从 ~55% 提升到 95%+ 的核心。

---

## 1. 一句话定义

> **让 LLM 做「IR 生成」，让代码做「codegen + type check」。**

把 LLM 工程当 compiler 工程来做：

```
用户自然语言
   ↓ (Lexer/Parser)
LLM Planner → 结构化 IR（受 JSON Schema 约束）
   ↓ (Codegen)
Deterministic DraftGenerator → DAG（受真实模板约束）
   ↓ (Type Checker)
Registry Guard → 校验 / 类型检查
   ↓
可执行 DAG → Remote Engine
```

---

## 2. 三层职责切分

### Layer 1：Planner（LLM）

**只做语义决策，不做结构装配。**

输入：自然语言 + 当前阶段上下文。
输出：受 JSON Schema 严格约束的 `WorkflowPlan`：

```python
class WorkflowPlan(BaseModel):
    # 闭集：只能从已注册的 workflow 中选
    workflow_ref: Literal[
        "t2i_basic", "i2i_style", "t2v_two_step",
        "first_last_frame_v2v", "music_compose",
        "video_concat_v2",
    ]
    # 结构化 shot 描述
    shots: list[ShotSpec] = Field(min_length=1, max_length=8)
    style: StyleSpec
    aspect_ratio: Literal["9:16", "16:9", "1:1"]
    total_duration_sec: float = Field(ge=5, le=60)
    music: MusicSpec | None = None

class ShotSpec(BaseModel):
    index: int
    duration_sec: float
    scene_description: str
    camera: Literal["wide", "medium", "close-up", "tracking", "dolly"]
    subject_action: str
    transition_to_next: Literal["cut", "fade", "dissolve", "wipe"] | None
```

**关键约束：**

1. **`workflow_ref` 是闭集（Literal）**，模型不能编造新名字。
2. **数值字段都带 `ge/le`**，模型不能输出负数 / 超长时长。
3. **必填字段一目了然**，缺失会被 ValidationError 拦住。

### Layer 2：DraftGenerator（代码）

**只做模板实例化，不做创意决策。**

```python
def assemble_dag(plan: WorkflowPlan) -> DAGDraft:
    template = TEMPLATES[plan.workflow_ref]
    nodes, edges = [], []
    layout = LayoutEngine()

    for i, shot in enumerate(plan.shots):
        # 模板按 shot index 实例化，节点 ID 确定性生成
        instance = template.instantiate(
            shot_index=i,
            shot=shot,
            style=plan.style,
            aspect_ratio=plan.aspect_ratio,
        )
        nodes.extend(instance.nodes)
        edges.extend(instance.edges)
        layout.place(instance, row=i)

    # 全局节点（背景音乐、视频拼接）
    if plan.music:
        music_node = MUSIC_TEMPLATES[plan.music.style].instantiate(plan.music)
        nodes.append(music_node)
        edges.extend(connect_music(music_node, nodes))

    return DAGDraft(
        nodes=nodes,
        edges=edges,
        flow_info=layout.export(),
        meta={"workflow_ref": plan.workflow_ref, "version": "v3.1"},
    )
```

**关键设计：**

1. **`TEMPLATES[ref]`** 是真实线上跑过的 pattern，已知一定能跑。
2. **节点 ID 由 `(template_name, shot_index, suffix)` 确定性生成**，永不冲突。
3. **edge 的 source/target/handle 全部由模板内部定死**，模型碰不到。

### Layer 3：Registry Guard（代码）

**Type checker，最后一道防线。**

```python
def validate_dag(dag: DAGDraft) -> ValidationReport:
    errors = []
    node_index = {n.id: n for n in dag.nodes}

    # 1. 节点类型校验
    for n in dag.nodes:
        spec = NODE_REGISTRY.get(n.type)
        if not spec:
            errors.append(NodeTypeError(n.type, n.id))
            continue
        # custom_config schema 校验
        if not spec.config_schema.is_valid(n.custom_config):
            errors.append(SchemaError(n.id, spec.config_schema.errors))

    # 2. Edge 校验
    for e in dag.edges:
        src = node_index.get(e.source)
        tgt = node_index.get(e.target)
        if not src or not tgt:
            errors.append(MissingNodeError(e))
            continue
        # source / target handle 必须在 spec 定义里
        if e.sourceHandle not in src.spec.output_handles:
            errors.append(InvalidHandleError(e, "source", e.sourceHandle))
        if e.targetHandle not in tgt.spec.input_handles:
            errors.append(InvalidHandleError(e, "target", e.targetHandle))
        # 类型兼容
        src_t = src.spec.output_handles[e.sourceHandle].type
        tgt_t = tgt.spec.input_handles[e.targetHandle].type
        if not is_compatible(src_t, tgt_t):
            errors.append(TypeMismatch(e, src_t, tgt_t))

    # 3. 图层校验
    if has_cycle(dag): errors.append(CyclicGraphError())
    orphans = find_orphans(dag)
    if orphans: errors.append(OrphanNodes(orphans))

    return ValidationReport(ok=not errors, errors=errors)
```

---

## 3. 真实模板蒸馏：从生产 DAG 反向抽 pattern

### 3.1 采集

```sql
-- 从 DAG truth source 取最近 30 天「执行成功 + 用户未再编辑」的 DAG
SELECT dag_json, workflow_signature
FROM dag_runs
WHERE status = 'success'
  AND created_at > NOW() - INTERVAL '30 days'
  AND user_edits_after_run = 0
  AND user_satisfaction > 0.7
```

### 3.2 聚类

按 **node type 序列哈希 + edge 拓扑相似度** 做 hierarchical clustering：

```python
def workflow_signature(dag: DAGDraft) -> str:
    # 简化：按拓扑顺序提 (node_type, in_degree, out_degree) 序列
    topo_order = topological_sort(dag)
    sig = [(n.type, in_deg(n), out_deg(n)) for n in topo_order]
    return hashlib.md5(json.dumps(sig).encode()).hexdigest()

clusters = hierarchical_cluster(
    samples,
    distance_fn=lambda a, b: jaccard_node_types(a, b) + edit_distance_edges(a, b),
    threshold=0.15,
)
# 实测出 ~30 个稳定 cluster，覆盖 90%+ 生产 DAG
```

### 3.3 抽象

每个 cluster 抽出 **skeleton + slot**：

```python
@dataclass
class WorkflowPattern:
    ref: str
    description: str  # 给 LLM Planner 看
    use_cases: list[str]
    constraints: dict
    # 骨架（固定的 node types + edge 关系）
    node_skeleton: list[NodeSkeleton]
    edge_skeleton: list[EdgeSkeleton]
    # 槽位（用户 / 模型可填的部分）
    slot_schema: dict
    # 实例化函数
    instantiate: Callable[..., DAGFragment]
    # 真实样例（few-shot）
    examples: list[dict]

@dataclass
class NodeSkeleton:
    role: str  # "scene_generator", "video_renderer", "audio_mixer", ...
    node_type: str  # 真实 registry 节点类型
    config_defaults: dict
    config_slots: list[str]  # 哪些字段由 plan 填
```

### 3.4 入库

Pattern 元数据写一个 schema 描述给 Planner 当 system prompt：

```
WORKFLOW PATTERNS AVAILABLE:

t2i_basic:
  description: 单镜头文生图，适合静态场景、概念图、人物肖像
  shot 数: 1
  必填: shot.scene_description, style.style_id, aspect_ratio
  限制: duration_sec 不适用

first_last_frame_v2v:
  description: 首尾帧驱动的短视频，适合 8-30 秒动态场景
  shot 数: 1-3
  必填: shot.scene_description, style.style_id, camera, duration_sec
  限制: total_duration_sec 最大 30
  ...

video_concat_v2:
  description: 多镜头视频拼接，适合 30-60 秒短片
  shot 数: 3-8
  必填: 每个 shot 的 transition_to_next
  限制: total_duration_sec 5-60
```

---

## 4. 失败模式 + 修复

### 4.1 Schema 输出失败

LLM 输出不合 Pydantic schema。

```python
async def generate_plan_with_retry(prompt: str, schema, max_retry=3):
    last_err = None
    for attempt in range(max_retry):
        try:
            raw = await llm.generate(prompt + (f"\n上次错误：{last_err}" if last_err else ""))
            return schema.model_validate_json(raw)
        except ValidationError as e:
            last_err = e.errors()  # 把 schema 错误塞回 prompt
    raise PlanGenFailed()
```

### 4.2 schema 合法但业务非法

模型输出符合 Pydantic，但 `workflow_ref` 选错了（比如静态场景选了 `t2v_two_step`）。

**修法**：在 prompt 里给「pattern 适用场景」描述，并加 critic node：

```python
async def _node_plan_critic(state: AgentGraphState):
    plan = state["draft_plan"]
    review = await llm.critic(
        plan=plan,
        spec=state["script_spec"],
        rubric=PATTERN_FITNESS_RUBRIC,
    )
    if review.fitness < 0.7:
        # 退回重 plan
        return Command(goto="planner", update={"hint": review.suggestion})
    return {"plan": plan}
```

### 4.3 DAG 装配后 Registry 报错

理论上模板装配的 DAG 不会失败，除非：

- 模板版本和 registry 版本对不上（部署 race）→ **CI 强制模板 + registry 同版本**。
- 模板内部 bug → 进 regression eval 集，下次部署前必过。

---

## 5. 度量「一次性可执行率」

定义：

```
first_pass_rate = #(first_validation_pass AND remote_engine_accepted)
                  / #(total_dag_generations)
```

按失败原因分桶：

| 失败原因 | 改进方向 |
|---|---|
| schema_validation_failed | retry-with-feedback / prompt 优化 |
| invalid_workflow_ref | 闭集 Literal 已防住 |
| invalid_node_type | DraftGenerator bug，CI 拦 |
| invalid_handle | DraftGenerator bug 或 registry 升级未同步 |
| type_mismatch | 模板设计问题，需要补 critic |
| cyclic_graph | DraftGenerator 严重 bug |
| remote_engine_reject | 远程引擎兼容性 |

每周看 dashboard，按失败类型加权排优先级。

---

## 6. 为什么这个 pattern 通用

> 这套模式不止适合多模态 DAG。任何「LLM 输出复杂结构」的场景都适用。

- **SQL Agent**：Planner 输出 `QueryPlan`（join 顺序、filter、聚合），代码装配成 SQL，executor 校验。
- **API Workflow**：Planner 输出 `WorkflowSpec`（步骤、依赖），代码装配成 actual workflow，runtime 校验。
- **UGC 审核**：Planner 输出 `DecisionPlan`（decision、reason_codes、evidence），代码校验 schema + 业务规则。

**核心抽象：**

```
LLM = 不确定的语义组件
代码 = 确定的结构组件
Registry = 类型系统

幻觉 = 跨过类型系统检查的语义错误
解法 = 让 LLM 只输出 IR，代码做 codegen + check
```

这套思路和 Anthropic Building Effective Agents 里讲的「prompt chaining + routing + evaluator-optimizer」是同一族。但比那套更狠：**LLM 不直接生产物，只生产 IR**。
