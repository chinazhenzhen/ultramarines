const focusItems = [
  {
    title: "Agent Runtime",
    body: "LangGraph 多阶段状态机、Checkpoint、Interrupt/Resume、SSE 事件流和 DAG 执行闭环。",
  },
  {
    title: "RAG 工程化",
    body: "BM25 + Dense 混合检索、bge-reranker、引用溯源、医疗安全兜底和 Badcase 回流。",
  },
  {
    title: "LLM 工程治理",
    body: "结构化输出、工具权限、模型路由、fallback、token/cost 审计与评测体系。",
  },
  {
    title: "云原生后端",
    body: "FastAPI/Golang/Kubernetes/GPU 调度/Operator/Redis/PostgreSQL/S3/CDN。",
  },
];

const qaItems = [
  {
    tag: "LangGraph",
    q: "为什么选择 LangGraph，而不是直接用 LangChain Agent 或自研状态机？",
    answer:
      "核心不是框架偏好，而是需求是长流程、强状态、可中断、可恢复。LangGraph 把阶段流转显式建模，并通过 checkpoint/thread 支持 human-in-the-loop、断线恢复和历史回放。自研也能做，但要补齐持久化、interrupt/resume、streaming 和 subgraph 的成本很高。",
    points: ["StateGraph 适合多阶段创作流程", "Checkpoint 支持 session 级恢复", "低层抽象允许插入规则、校验和确定性装配节点"],
  },
  {
    tag: "Agent DAG",
    q: "为什么用 Planner + 确定性装配，而不是让 LLM 直接生成 DAG？",
    answer:
      "LLM 直接生成完整 DAG 容易出现幻觉节点、非法 edge、targetHandle 错误和 slot 类型不匹配。我的设计是让 LLM 做语义规划和 workflow pattern 选择，再由 DraftGenerator 基于真实模板确定性装配，最后用 Registry Guard 校验。",
    points: ["模型做语义决策", "代码做结构正确性", "DAG 一次性可执行率从约 55% 到 95%+"],
  },
  {
    tag: "RAG",
    q: "为什么医疗 RAG 要用 BM25 + Dense + Reranker？",
    answer:
      "BM25 对疾病名、药品名、检查指标等精确术语强，Dense 对口语化症状和同义表达强。两路召回合并后，用 cross-encoder reranker 判断 query-doc 的真实相关性，能提升 Top-K 证据质量。",
    points: ["召回阶段保证覆盖", "rerank 阶段保证高位质量", "Top-3 命中率从约 70% 到 88%+"],
  },
  {
    tag: "SSE",
    q: "为什么 Agent 流式协议选择 SSE，而不是 WebSocket？",
    answer:
      "这个场景主要是服务端把 run event 推给前端，双向高频交互不是核心。SSE 基于 HTTP，EventSource 原生支持重连，和网关、鉴权、日志链路更容易集成。WebSocket 更适合协同编辑、游戏和双向控制。",
    points: ["text/event-stream", "事件 id + Last-Event-ID 恢复", "关闭反代 buffering 并发送 heartbeat"],
  },
  {
    tag: "K8s",
    q: "Kubernetes 如何调度 GPU？",
    answer:
      "Kubernetes 通过 Device Plugin Framework 支持 GPU。节点安装驱动和 NVIDIA device plugin 后，kubelet 暴露 nvidia.com/gpu 这类扩展资源，Pod 在 limits 中声明 GPU 数量，调度器据此分配到有资源的节点。",
    points: ["GPU limits/request 约束", "node label 区分 V100/T4", "平台层做配额、队列、状态同步和失败重试"],
  },
  {
    tag: "Eval",
    q: "如何评测一个生产级 Agent？",
    answer:
      "要区分 capability eval 和 regression eval，并且看完整 trajectory，而不是只看最终文本。确定性部分用 schema validation、DAG dry-run、工具调用断言；开放质量用 LLM judge，并定期人工校准。",
    points: ["任务、trial、grader、transcript 分离", "组件评测 + 端到端评测", "Badcase 进入回归集"],
  },
];

const reviewItems = [
  {
    tag: "Agent",
    title: "AI Agent 与 LangGraph",
    body: "Workflow vs Agent、StateGraph、checkpoint、interrupt/resume、Planner + deterministic assembly。",
    points: ["能解释为什么不是全自动", "能讲清 stage state schema", "能画出 Runtime 分层"],
    href: "./docs/review/01-ai-agent-langgraph.md",
  },
  {
    tag: "RAG",
    title: "RAG 与混合检索",
    body: "BM25、Dense、bge-reranker、引用溯源、医疗安全、RAG 评测与 Badcase 闭环。",
    points: ["能区分召回和重排", "能讲 Top-3 命中率", "能处理证据不足"],
    href: "./docs/review/02-rag-retrieval.md",
  },
  {
    tag: "LLM",
    title: "LLM 工程化",
    body: "结构化输出、工具调用、Provider 抽象、模型路由、fallback、token/cost 治理。",
    points: ["模型输出必须二次校验", "工具调用要权限和幂等", "prompt/version/trace 可回放"],
    href: "./docs/review/03-llm-engineering-observability.md",
  },
  {
    tag: "Eval",
    title: "评测与可观测",
    body: "离线评测、在线评测、trajectory、LangSmith/Langfuse、OpenTelemetry GenAI trace。",
    points: ["capability vs regression", "deterministic grader 优先", "人工校准 LLM judge"],
    href: "./docs/review/03-llm-engineering-observability.md",
  },
  {
    tag: "Infra",
    title: "后端与 SSE",
    body: "FastAPI StreamingResponse、SSE 事件协议、断线恢复、反代缓冲、长任务 API。",
    points: ["run_id + event stream", "Last-Event-ID 重放", "取消和幂等"],
    href: "./docs/review/04-backend-cloud-native.md",
  },
  {
    tag: "K8s",
    title: "K8s GPU 与 Operator",
    body: "Device Plugin、GPU limits、V100/T4 调度、多租户配额、CRD/Operator 控制循环。",
    points: ["GPU 作为扩展资源", "CRD 表达期望状态", "Operator 负责 reconcile"],
    href: "./docs/review/04-backend-cloud-native.md",
  },
];

const timeline = [
  {
    date: "2025.12 - 至今",
    title: "ArtArch.AI · AI Agent 平台研发",
    body: "LangGraph + Gemini + FastAPI + SSE + DAG 多模态创作 Agent。重点成果：DAG 可执行率 95%+，首 token <1.5s，LLM 成本下降约 40%。",
  },
  {
    date: "2020.08 - 2025.12",
    title: "百度 · 健康助手 / 地图 UGC / GPU 调度",
    body: "医疗 Bot RAG、POI UGC 机审、Kubernetes GPU 调度平台。重点成果：RAG Top-3 88%+，高风险拦截 98%+，管理 300+ V100/T4 GPU。",
  },
  {
    date: "2019.07 - 2020.07",
    title: "格灵深瞳 · ML 实验平台后端",
    body: "算法平台后端、模型能力服务化、实验流程支撑，为后续 AI 平台工程打底。",
  },
  {
    date: "2018.06 - 2018.10",
    title: "百度 · 搜索运维基础平台实习",
    body: "大型搜索系统运维平台经历，补足 Linux、自动化、稳定性和平台工具意识。",
  },
];

const docs = [
  {
    title: "原始 Markdown 简历",
    body: "完整简历正文，包含个人信息、优势、技能清单、工作经历与项目经历。",
    href: "./docs/马震-15253371862-后端研发工程师.md",
  },
  {
    title: "深度面试 Q&A",
    body: "按面试官追问链路组织，覆盖 Agent Runtime、RAG、UGC 机审、K8s GPU、行为面。",
    href: "./docs/interview-qa.md",
  },
  {
    title: "分类复习索引",
    body: "五天复习节奏、技术栈到能力映射、资料入口。",
    href: "./docs/review/README.md",
  },
  {
    title: "资料来源与延伸阅读",
    body: "官方文档、论文、源码仓库和一线工程博客。",
    href: "./docs/review/references.md",
  },
];

const architectureViews = {
  agent: [
    ["Intent Router", "规则层覆盖高频指令，歧义再交给 LLM Classifier。", ["70% 高频指令", "平均 <50ms", "成本下降约 40%"]],
    ["LangGraph Runtime", "多阶段状态机负责 checkpoint、interrupt/resume、阶段流转和事件输出。", ["thread_id=session_id", "50+ 轮上下文", "断线恢复 99%+"]],
    ["Gemini Planner", "负责创意理解、分镜规划和 workflow pattern 选择。", ["JSON Schema", "低温输出", "失败可重试"]],
    ["DraftGenerator", "基于真实模板确定性装配 DAG，避免模型猜 node/edge/slot。", ["真实模板蒸馏", "flow_info 布局", "slot schema"]],
    ["Registry Guard", "校验节点、边、handle、custom_config 和执行前约束。", ["非法节点归零", "dry-run", "错误分类"]],
    ["DAG Execution", "远程执行、状态轮询、trace、cancel、publish command。", ["30+ 节点类型", "6 大链路", "Canvas 真相源"]],
  ],
  rag: [
    ["Risk Classifier", "识别急症、处方、诊断、高危人群等医疗安全风险。", ["召回优先", "规则 + LLM", "98%+ 高危召回"]],
    ["Query Rewrite", "抽取症状、疾病、药品、检查指标和科室意图。", ["实体归一", "意图路由", "上下文补全"]],
    ["BM25 Retrieval", "保障专业名词、药品名、指标和精确关键词召回。", ["术语强匹配", "可解释", "低成本"]],
    ["Dense Retrieval", "覆盖口语化症状、同义表达和语义相近问题。", ["bge/m3e", "Faiss/ES", "语义泛化"]],
    ["Reranker", "对候选做 query-doc 交互式精排，提高 Top-K 证据质量。", ["Top-100 -> Top-3", "cross-encoder", "88%+ Top-3"]],
    ["Grounded Answer", "基于证据生成，引用溯源，并对证据不足保守回答。", ["citation", "faithfulness", "badcase 回流"]],
  ],
  infra: [
    ["FastAPI API", "提供 REST/SSE 接口、鉴权、限流、CORS 和错误码。", ["Responses-style", "StreamingResponse", "OpenAPI"]],
    ["Event Store", "保存 run event，用于前端恢复、重放和审计。", ["Last-Event-ID", "幂等重放", "UI 恢复"]],
    ["Redis", "短期状态、缓存、分布式锁、任务状态和 pubsub。", ["rate limit", "idempotency", "session cache"]],
    ["PostgreSQL", "保存 session/run/message/event/checkpoint 投影和配置。", ["JSONB", "索引字段列化", "事务状态"]],
    ["Kubernetes GPU", "Device Plugin 暴露 GPU 扩展资源，平台做队列和配额。", ["300+ V100/T4", "limits", "node label"]],
    ["Operator", "CRD 表达期望状态，控制器调和真实状态。", ["reconcile", "status", "failure retry"]],
  ],
};

function mountStaticContent() {
  document.getElementById("focusList").innerHTML = focusItems
    .map((item) => `<article class="focus-card"><h3>${item.title}</h3><p>${item.body}</p></article>`)
    .join("");

  document.getElementById("timelineList").innerHTML = timeline
    .map(
      (item) => `
        <article class="timeline-item">
          <div class="timeline-date">${item.date}</div>
          <div><h3>${item.title}</h3><p>${item.body}</p></div>
        </article>
      `,
    )
    .join("");

  document.getElementById("docsGrid").innerHTML = docs
    .map(
      (item) => `
        <article class="doc-card">
          <h3>${item.title}</h3>
          <p>${item.body}</p>
          <a class="doc-link" href="${item.href}" target="_blank" rel="noreferrer">
            <span data-icon="external-link"></span>
            <span>打开</span>
          </a>
        </article>
      `,
    )
    .join("");
}

function mountQa() {
  const qaList = document.getElementById("qaList");
  const answerPanel = document.getElementById("answerPanel");
  const search = document.getElementById("qaSearch");

  function select(item) {
    qaList.querySelectorAll(".qa-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.q === item.q);
    });
    answerPanel.innerHTML = `
      <span class="panel-label">${item.tag}</span>
      <h3>${item.q}</h3>
      <p>${item.answer}</p>
      <ul>${item.points.map((point) => `<li>${point}</li>`).join("")}</ul>
    `;
  }

  function render(filter = "") {
    const normalized = filter.trim().toLowerCase();
    const matched = qaItems.filter((item) =>
      [item.tag, item.q, item.answer, item.points.join(" ")].join(" ").toLowerCase().includes(normalized),
    );
    qaList.innerHTML = matched
      .map(
        (item) => `
          <button class="qa-item" data-q="${item.q}">
            <strong>${item.q}</strong>
            <span>${item.tag}</span>
          </button>
        `,
      )
      .join("");
    qaList.querySelectorAll(".qa-item").forEach((button) => {
      const item = matched.find((entry) => entry.q === button.dataset.q);
      button.addEventListener("click", () => select(item));
    });
    if (matched[0]) select(matched[0]);
  }

  search.addEventListener("input", (event) => render(event.target.value));
  render();
}

function mountReview() {
  const grid = document.getElementById("reviewGrid");
  const filters = document.getElementById("reviewFilters");
  const tags = ["All", ...new Set(reviewItems.map((item) => item.tag))];

  function render(tag = "All") {
    filters.querySelectorAll(".chip").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.tag === tag);
    });
    const visible = tag === "All" ? reviewItems : reviewItems.filter((item) => item.tag === tag);
    grid.innerHTML = visible
      .map(
        (item) => `
          <article class="review-card">
            <span class="tag">${item.tag}</span>
            <h3>${item.title}</h3>
            <p>${item.body}</p>
            <ul>${item.points.map((point) => `<li>${point}</li>`).join("")}</ul>
            <a class="doc-link" href="${item.href}" target="_blank" rel="noreferrer">
              <span data-icon="external-link"></span>
              <span>完整资料</span>
            </a>
          </article>
        `,
      )
      .join("");
    if (window.lucide) window.lucide.createIcons();
  }

  filters.innerHTML = tags.map((tag) => `<button class="chip" data-tag="${tag}">${tag}</button>`).join("");
  filters.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => render(chip.dataset.tag));
  });
  render();
}

function mountArchitecture(THREE) {
  const canvas = document.getElementById("architectureCanvas");
  const fallback = document.getElementById("canvasFallback");
  const nodeTitle = document.getElementById("nodeTitle");
  const nodeBody = document.getElementById("nodeBody");
  const nodeFacts = document.getElementById("nodeFacts");
  const segments = document.querySelectorAll(".segment");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const group = new THREE.Group();
  scene.add(group);
  camera.position.set(0, 2.2, 12.8);
  camera.lookAt(0, 0, 0);

  const light = new THREE.DirectionalLight(0xffffff, 2.4);
  light.position.set(5, 8, 8);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x7aa7b7, 1.2));

  const materials = [
    new THREE.MeshStandardMaterial({ color: 0x45d7ff, metalness: 0.2, roughness: 0.32 }),
    new THREE.MeshStandardMaterial({ color: 0x62e6a8, metalness: 0.18, roughness: 0.34 }),
    new THREE.MeshStandardMaterial({ color: 0xffbd59, metalness: 0.18, roughness: 0.38 }),
    new THREE.MeshStandardMaterial({ color: 0xff6f91, metalness: 0.14, roughness: 0.4 }),
    new THREE.MeshStandardMaterial({ color: 0xa78bfa, metalness: 0.12, roughness: 0.35 }),
    new THREE.MeshStandardMaterial({ color: 0xd8dee3, metalness: 0.1, roughness: 0.42 }),
  ];

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let activeView = "agent";
  let meshes = [];

  function setNode(data) {
    nodeTitle.textContent = data[0];
    nodeBody.textContent = data[1];
    nodeFacts.innerHTML = data[2].map((fact) => `<li>${fact}</li>`).join("");
  }

  function clearGroup() {
    while (group.children.length) {
      const child = group.children.pop();
      child.geometry?.dispose?.();
    }
    meshes = [];
  }

  function addLabel(text, x, y, z) {
    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = 512;
    spriteCanvas.height = 128;
    const ctx = spriteCanvas.getContext("2d");
    ctx.fillStyle = "rgba(13,15,18,0.78)";
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.strokeRect(1, 1, 510, 126);
    ctx.fillStyle = "#edf2f4";
    ctx.font = "700 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 64);
    const texture = new THREE.CanvasTexture(spriteCanvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    sprite.position.set(x, y, z);
    sprite.scale.set(1.58, 0.42, 1);
    group.add(sprite);
  }

  function build(view) {
    clearGroup();
    const data = architectureViews[view];
    const radius = 2.95;
    data.forEach((item, index) => {
      const angle = (index / data.length) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = index % 2 === 0 ? 0.42 : -0.42;
      const geometry = new THREE.BoxGeometry(0.82, 0.82, 0.82);
      const mesh = new THREE.Mesh(geometry, materials[index % materials.length]);
      mesh.position.set(x, y, z);
      mesh.rotation.set(0.4, angle, 0.2);
      mesh.userData = { item };
      group.add(mesh);
      meshes.push(mesh);
      addLabel(item[0], x, y + 0.88, z);
    });

    const points = meshes.map((mesh) => mesh.position);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x5a6670, transparent: true, opacity: 0.8 });
    for (let i = 0; i < points.length; i += 1) {
      const next = points[(i + 1) % points.length];
      const geometry = new THREE.BufferGeometry().setFromPoints([points[i], next]);
      group.add(new THREE.Line(geometry, lineMaterial));
    }
    setNode(data[1] || data[0]);
  }

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(rect.height, 1);
    camera.updateProjectionMatrix();
  }

  function animate() {
    requestAnimationFrame(animate);
    group.rotation.y += 0.003;
    meshes.forEach((mesh, index) => {
      mesh.rotation.x += 0.006 + index * 0.0005;
      mesh.rotation.y += 0.008;
    });
    renderer.render(scene, camera);
  }

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const [hit] = raycaster.intersectObjects(meshes);
    canvas.style.cursor = hit ? "pointer" : "default";
  });

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const [hit] = raycaster.intersectObjects(meshes);
    if (hit) setNode(hit.object.userData.item);
  });

  segments.forEach((segment) => {
    segment.addEventListener("click", () => {
      activeView = segment.dataset.view;
      segments.forEach((button) => button.classList.toggle("active", button === segment));
      build(activeView);
    });
  });

  window.addEventListener("resize", resize);
  resize();
  build(activeView);
  fallback.style.display = "none";
  animate();
}

mountStaticContent();
mountQa();
mountReview();

try {
  const threeModule = await import("https://unpkg.com/three@0.164.1/build/three.module.js");
  mountArchitecture(threeModule);
} catch (error) {
  document.getElementById("canvasFallback").style.display = "block";
  console.error(error);
}

if (window.lucide) {
  window.lucide.createIcons();
}
