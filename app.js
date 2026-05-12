const reader = (doc) => `./reader.html?doc=${encodeURIComponent(doc)}`;

const articles = [
  {
    id: "interview-qa",
    tag: "Q&A",
    title: "AI Agent 岗位深度追问手册",
    summary: "从开场自我介绍到 LangGraph、DAG、RAG、SSE、K8s GPU 与行为面，按面试官追问链路组织。",
    image: "./assets/article-agent-runtime.png",
    reading: "45 min",
    depth: "Interview",
  },
  {
    id: "agent-runtime",
    tag: "Agent",
    title: "AI Agent 与 LangGraph 工程化",
    summary: "Workflow vs Agent、StateGraph、checkpoint、interrupt/resume、Planner 与确定性装配的生产取舍。",
    image: "./assets/article-agent-runtime.png",
    reading: "18 min",
    depth: "Architecture",
  },
  {
    id: "rag-retrieval",
    tag: "RAG",
    title: "RAG、混合检索与医疗问答",
    summary: "BM25、Dense、bge-reranker、上下文构造、引用溯源、医疗安全和 Badcase 回流。",
    image: "./assets/article-rag-retrieval.png",
    reading: "22 min",
    depth: "Retrieval",
  },
  {
    id: "llm-observability",
    tag: "LLM Ops",
    title: "LLM 工程化、评测与可观测",
    summary: "结构化输出、工具权限、Provider 抽象、模型路由、Trace、Eval、成本治理与安全边界。",
    image: "./assets/article-llm-observability.png",
    reading: "20 min",
    depth: "Governance",
  },
  {
    id: "cloud-native",
    tag: "Backend",
    title: "后端架构、SSE、Kubernetes GPU 与 Operator",
    summary: "长任务 API、SSE 断线恢复、领域模型、GPU 调度、CRD/Operator 和中间件选型。",
    image: "./assets/article-cloud-native.png",
    reading: "20 min",
    depth: "Infra",
  },
  {
    id: "review-index",
    tag: "Index",
    title: "五天复习路线与资料索引",
    summary: "把所有资料按复习节奏、面试能力和技术栈映射起来，适合作为冲刺计划入口。",
    image: "./assets/hero-agent-atlas.png",
    reading: "8 min",
    depth: "Plan",
  },
];

const qaItems = [
  {
    tag: "LangGraph",
    q: "为什么选择 LangGraph，而不是直接用 LangChain Agent 或自研状态机？",
    answer:
      "核心不是框架偏好，而是任务形态：长流程、强状态、可中断、可恢复。LangGraph 把阶段流转显式建模，并通过 checkpoint/thread 支持 human-in-the-loop、断线恢复和历史回放。自研也能做，但要补齐持久化、interrupt/resume、streaming 和 subgraph 的成本很高。",
    points: ["StateGraph 适合多阶段创作流程", "Checkpoint 支持 session 级恢复", "低层抽象允许插入规则、校验和确定性装配节点"],
  },
  {
    tag: "Agent DAG",
    q: "为什么用 Planner + 确定性装配，而不是让 LLM 直接生成 DAG？",
    answer:
      "LLM 直接生成完整 DAG 容易出现幻觉节点、非法 edge、targetHandle 错误和 slot 类型不匹配。更稳的设计是让 LLM 做语义规划和 workflow pattern 选择，再由 DraftGenerator 基于真实模板确定性装配，最后用 Registry Guard 校验。",
    points: ["模型做语义决策", "代码做结构正确性", "DAG 一次性可执行率从约 55% 到 95%+"],
  },
  {
    tag: "RAG",
    q: "为什么医疗 RAG 要用 BM25 + Dense + Reranker？",
    answer:
      "BM25 对疾病名、药品名、检查指标等精确术语强，Dense 对口语化症状和同义表达强。两路召回合并后，用 cross-encoder reranker 判断 query-doc 的真实相关性，提升 Top-K 证据质量。",
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
    tag: "Eval",
    q: "如何评测一个生产级 Agent？",
    answer:
      "要区分 capability eval 和 regression eval，并且看完整 trajectory，而不是只看最终文本。确定性部分用 schema validation、DAG dry-run、工具调用断言；开放质量用 LLM judge，并定期人工校准。",
    points: ["任务、trial、grader、transcript 分离", "组件评测 + 端到端评测", "Badcase 进入回归集"],
  },
  {
    tag: "K8s",
    q: "Kubernetes 如何调度 GPU？",
    answer:
      "Kubernetes 通过 Device Plugin Framework 支持 GPU。节点安装驱动和 NVIDIA device plugin 后，kubelet 暴露 nvidia.com/gpu 这类扩展资源，Pod 在 limits 中声明 GPU 数量，调度器据此分配到有资源的节点。",
    points: ["GPU limits/request 约束", "node label 区分 V100/T4", "平台层做配额、队列、状态同步和失败重试"],
  },
];

const evidence = [
  {
    title: "Agent Runtime 项目",
    metric: "95%+",
    label: "DAG 一次性可执行率",
    body: "可讲主线：LangGraph 状态图、Planner、确定性 DAG 装配、Registry Guard、SSE 事件流和多模态执行闭环。",
  },
  {
    title: "RAG 医疗问答",
    metric: "88%+",
    label: "Top-3 命中率",
    body: "可讲主线：BM25 + Dense 混合召回、bge-reranker、引用溯源、证据不足保守回答与高风险医疗安全策略。",
  },
  {
    title: "UGC 机审与 LLM 审核",
    metric: "50-70%",
    label: "自动化覆盖",
    body: "可讲主线：规则 + 模型的分层审核、低置信人工复核、Badcase 回流、可解释审核结论和线上质量监控。",
  },
  {
    title: "K8s GPU 调度平台",
    metric: "300+",
    label: "V100/T4 GPU",
    body: "可讲主线：Device Plugin、任务队列、配额、公平调度、状态 watcher、日志与失败恢复。",
  },
];

const systemViews = {
  agent: {
    title: "Agent Runtime",
    body: "从意图解析、状态图、Planner、确定性装配、工具执行到观测评测，形成可恢复的生产级 Agent 运行时。",
    nodes: ["Intent", "StateGraph", "Planner", "Assembly", "Validation", "Execution"],
  },
  rag: {
    title: "RAG Retrieval System",
    body: "把 query understanding、BM25、Dense、Reranker、Context Builder 与 Citation Check 作为一条可评测链路，而不是简单拼 prompt。",
    nodes: ["Rewrite", "BM25", "Dense", "Merge", "Rerank", "Grounding"],
  },
  governance: {
    title: "LLM Governance",
    body: "结构化输出、工具权限、trace、eval、成本和安全策略共同组成上线后的治理系统，核心目标是让错误可定位、质量可回归。",
    nodes: ["Schema", "Tools", "Trace", "Eval", "Cost", "Safety"],
  },
  infra: {
    title: "Cloud Native Backend",
    body: "长任务 API、SSE event store、Redis/PostgreSQL、Kubernetes GPU 和 Operator 把 Agent 能力接入真实生产流量。",
    nodes: ["FastAPI", "SSE", "Store", "Queue", "GPU", "Operator"],
  },
};

function icon(name) {
  return `<span data-icon="${name}"></span>`;
}

function mountArticles() {
  const grid = document.getElementById("articleGrid");
  grid.innerHTML = articles
    .map(
      (article, index) => `
        <a class="article-card ${index === 0 ? "featured" : ""}" href="${reader(article.id)}">
          <img src="${article.image}" alt="" loading="${index < 2 ? "eager" : "lazy"}" />
          <div class="article-card-content">
            <div class="card-meta">
              <span>${article.tag}</span>
              <span>${article.reading}</span>
            </div>
            <h3>${article.title}</h3>
            <p>${article.summary}</p>
            <div class="card-footer">
              <span>${article.depth}</span>
              ${icon("arrow-up-right")}
            </div>
          </div>
        </a>
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
      <a class="inline-link" href="${reader("interview-qa")}">阅读全文追问 ${icon("arrow-up-right")}</a>
    `;
    if (window.lucide) window.lucide.createIcons();
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

function mountEvidence() {
  document.getElementById("evidenceGrid").innerHTML = evidence
    .map(
      (item) => `
        <article class="evidence-card">
          <div class="evidence-metric">
            <strong>${item.metric}</strong>
            <span>${item.label}</span>
          </div>
          <h3>${item.title}</h3>
          <p>${item.body}</p>
        </article>
      `,
    )
    .join("");
}

function mountSystemMap() {
  const panel = document.getElementById("nodePanel");
  const buttons = [...document.querySelectorAll(".segment")];
  const canvas = document.getElementById("systemCanvas");
  const fallback = document.getElementById("canvasFallback");
  let setViewForScene = null;

  function setView(view) {
    const data = systemViews[view];
    buttons.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    panel.innerHTML = `
      <span class="panel-label">当前视角</span>
      <h3>${data.title}</h3>
      <p>${data.body}</p>
      <div class="node-tags">${data.nodes.map((node) => `<span>${node}</span>`).join("")}</div>
    `;
    if (setViewForScene) setViewForScene(view);
  }

  buttons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  setView("agent");

  import("https://unpkg.com/three@0.164.1/build/three.module.js")
    .then((THREE) => {
      fallback.hidden = true;
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
      camera.position.set(0, 5.4, 10.8);
      camera.lookAt(0, 0, 0);

      const group = new THREE.Group();
      scene.add(group);
      scene.add(new THREE.AmbientLight(0xddeeff, 1.1));
      const key = new THREE.PointLight(0x69d7ff, 2.8, 28);
      key.position.set(-4, 5, 6);
      scene.add(key);
      const rim = new THREE.PointLight(0xffc15a, 2, 22);
      rim.position.set(5, 2, -4);
      scene.add(rim);

      const palette = {
        agent: [0x49d4ff, 0xffc15a, 0x78e6a4],
        rag: [0x4fd1ff, 0xffb547, 0x65e4b1],
        governance: [0x8bd3ff, 0xf5c451, 0x7df0c4],
        infra: [0x5eead4, 0xfbbf24, 0x60a5fa],
      };

      const coreMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x0f1720,
        metalness: 0.2,
        roughness: 0.22,
        transmission: 0.35,
        thickness: 0.6,
        emissive: 0x0b3b42,
        emissiveIntensity: 0.45,
      });

      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 2), coreMaterial);
      group.add(core);

      const nodes = [];
      const lines = [];
      for (let i = 0; i < 8; i += 1) {
        const angle = (Math.PI * 2 * i) / 8;
        const radius = i % 2 === 0 ? 3.55 : 4.25;
        const geometry = i % 2 === 0 ? new THREE.BoxGeometry(0.78, 0.78, 0.78) : new THREE.SphereGeometry(0.43, 24, 24);
        const material = new THREE.MeshStandardMaterial({
          color: palette.agent[i % 3],
          roughness: 0.34,
          metalness: 0.35,
          emissive: palette.agent[i % 3],
          emissiveIntensity: 0.18,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(Math.cos(angle) * radius, Math.sin(i * 0.7) * 0.55, Math.sin(angle) * radius);
        nodes.push(mesh);
        group.add(mesh);

        const points = [new THREE.Vector3(0, 0, 0), mesh.position.clone()];
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: palette.agent[i % 3], transparent: true, opacity: 0.65 }),
        );
        lines.push(line);
        group.add(line);
      }

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.95, 0.01, 12, 180),
        new THREE.MeshBasicMaterial({ color: 0x6ee7ff, transparent: true, opacity: 0.4 }),
      );
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      setViewForScene = (view) => {
        const colors = palette[view];
        nodes.forEach((node, index) => {
          node.material.color.setHex(colors[index % 3]);
          node.material.emissive.setHex(colors[index % 3]);
        });
        lines.forEach((line, index) => line.material.color.setHex(colors[index % 3]));
        ring.material.color.setHex(colors[0]);
      };

      function resize() {
        const rect = canvas.parentElement.getBoundingClientRect();
        renderer.setSize(rect.width, rect.height, false);
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
      }
      window.addEventListener("resize", resize);
      resize();

      function animate() {
        group.rotation.y += 0.004;
        core.rotation.x += 0.006;
        core.rotation.y -= 0.004;
        nodes.forEach((node, index) => {
          node.rotation.x += 0.006 + index * 0.0008;
          node.rotation.y += 0.009;
          node.position.y += Math.sin(Date.now() * 0.0015 + index) * 0.0016;
        });
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      }
      animate();
      setView("agent");
    })
    .catch(() => {
      fallback.hidden = false;
    });
}

mountArticles();
mountSystemMap();
mountQa();
mountEvidence();

if (window.lucide) {
  window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
}
