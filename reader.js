/* Atlas Reader — markdown viewer with category-grouped rail. */

const articles = {
  "resume-source": {
    title: "马震 · 后端研发工程师 / AI Agent 开发",
    tag: "Resume",
    path: "./docs/马震-15253371862-后端研发工程师.md",
    cover: "./assets/cover-resume.jpg",
    summary: "7 年后端与 AI 平台经验，近一年主线是 LangGraph、RAG、LLM Workflow、云原生调度。简历以工程指标为锚。",
    meta: ["10 min", "Resume", "北京 · 在职"],
  },

  "transformer-fundamentals": {
    title: "Transformer / Attention / Embedding 速通",
    tag: "Foundations",
    path: "./docs/review/05-transformer-fundamentals.md",
    cover: "./assets/cover-transformer.jpg",
    summary: "把面试 90% 必问的 Transformer 基础打通：scaled dot-product、multi-head、KV cache、位置编码、embedding 几何直觉。",
    meta: ["22 min", "Foundations", "必问"],
  },

  "agent-runtime": {
    title: "LangGraph 架构设计与 Agent Runtime 落地",
    tag: "Agent Runtime",
    path: "./docs/review/01-ai-agent-langgraph.md",
    cover: "./assets/article-agent-runtime-v2.png",
    summary: "系统拆解 LangGraph 的 StateGraph、Pregel super-step、checkpoint、interrupt/resume 与 streaming，并映射到 dag_engine/agent 的真实代码和面试问答。",
    meta: ["45 min", "Architecture", "LangGraph"],
  },

  "claude-code-architecture": {
    title: "Claude Code 源码分析与架构设计复盘",
    tag: "Agent Runtime",
    path: "./docs/review/13-claude-code-architecture.md",
    cover: "./assets/claude-code-architecture.png",
    summary: "基于公开源码分析论文和 Anthropic 官方文档，整理 Claude Code 的 agent loop、权限、hooks、subagent、上下文压缩、持久化与 JSON 结构化输出设计 tips。",
    meta: ["38 min", "Architecture", "Claude Code"],
  },

  "planner-deterministic": {
    title: "Planner + Deterministic Assembly 模式",
    tag: "Agent Runtime",
    path: "./docs/review/06-planner-deterministic-assembly.md",
    cover: "./assets/cover-planner.jpg",
    summary: "ArtArch.AI 95% 一次性可执行率背后的设计模式：LLM 做语义决策，代码做结构装配；Registry Guard、Draft Pattern、失败回流。",
    meta: ["24 min", "Architecture", "DAG"],
  },

  "rag-retrieval": {
    title: "RAG、混合检索与医疗问答",
    tag: "Retrieval",
    path: "./docs/review/02-rag-retrieval.md",
    cover: "./assets/article-rag-retrieval.png",
    summary: "从混合召回、rerank、context builder、citation 到医疗安全策略，讲清 RAG 质量为什么是一条链路。",
    meta: ["24 min", "Retrieval", "Safety"],
  },

  "vector-db-reranker": {
    title: "Vector DB 选型 + Reranker 深入",
    tag: "Retrieval",
    path: "./docs/review/07-vector-db-reranker.md",
    cover: "./assets/cover-vectordb.jpg",
    summary: "pgvector / Milvus / Qdrant / ES+Faiss 对比，HNSW vs IVF 调参，bge-reranker 训练与混合分数融合（RRF / Weighted），含 TEI/FastAPI 服务化部署与三层缓存实战。",
    meta: ["30 min", "Retrieval", "Selection"],
  },

  "chunking-strategy": {
    title: "Chunking 策略：RAG 里最被低估的工程模块",
    tag: "Retrieval",
    path: "./docs/review/11-chunking-strategy.md",
    cover: "./assets/article-rag-retrieval.png",
    summary: "Fixed/Recursive/Semantic/Structure/Agentic/Late 策略全谱，父子 chunk、Anthropic Contextual Retrieval、Metadata schema、表格/PDF/OCR 处理、A/B 评测代码，落地优先。",
    meta: ["32 min", "Retrieval", "Chunking"],
  },

  "elasticsearch-rag-agent": {
    title: "Elasticsearch 在 RAG 与 Agent 工程里的落地",
    tag: "Retrieval",
    path: "./docs/review/12-elasticsearch-rag-agent.md",
    cover: "./assets/article-rag-retrieval.png",
    summary: "ES 8.x 三件大事（dense_vector / retriever.rrf / ELSER）+ Agent 工具检索后端 + trace/memory/decision cache 五大场景 + 13 题面试 Q&A + ES vs Vector DB 选型决策树。",
    meta: ["35 min", "Retrieval", "Elasticsearch"],
  },

  "llm-observability": {
    title: "LLM 工程化、评测与可观测",
    tag: "LLM Ops",
    path: "./docs/review/03-llm-engineering-observability.md",
    cover: "./assets/article-llm-observability.png",
    summary: "结构化输出、工具调用、Provider 抽象、trace、eval、成本与安全边界，是 Agent 上线后的治理层。",
    meta: ["22 min", "Governance", "Eval"],
  },

  "tool-calling-mcp": {
    title: "Tool Calling、Structured Output、MCP 协议",
    tag: "LLM Ops",
    path: "./docs/review/08-tool-calling-mcp.md",
    cover: "./assets/cover-toolcall.jpg",
    summary: "function calling 在 OpenAI / Anthropic / Gemini 三家的形态差异，JSON Schema 约束、constrained decoding、MCP 协议详解。",
    meta: ["22 min", "LLM Ops", "Protocol"],
  },

  "vibe-coding-spec": {
    title: "Vibe Coding 时代的工程师优势",
    tag: "LLM Ops",
    path: "./docs/review/09-vibe-coding-requirement-spec.md",
    cover: "./assets/cover-toolcall.jpg",
    summary: "总结程序员Carl关于 Vibe Coding 的面试答法，并把“加个退款功能”拆成可执行需求规格、幂等和超时处理。",
    meta: ["24 min", "LLM Ops", "Requirements"],
  },

  "context-engineering": {
    title: "How to Fix Your Context：上下文工程六法",
    tag: "LLM Ops",
    path: "./docs/review/10-context-engineering-langgraph.md",
    cover: "./assets/context-engineering-drew.png",
    summary: "整理 how_to_fix_your_context：六种上下文工程方法、LangGraph 最佳实践、dag_engine/agent 落地架构和带中文注释的伪代码。",
    meta: ["50 min", "LLM Ops", "Context"],
  },

  "cloud-native": {
    title: "后端架构、SSE、Kubernetes GPU 与 Operator",
    tag: "Backend",
    path: "./docs/review/04-backend-cloud-native.md",
    cover: "./assets/article-cloud-native.png",
    summary: "把 Agent 服务放进真实生产系统：长任务 API、SSE event store、GPU 调度和 Operator 控制循环。",
    meta: ["22 min", "Infra", "Kubernetes"],
  },

  "k8s-gpu-scheduling": {
    title: "K8s GPU 调度二次开发深度复习",
    tag: "Backend",
    path: "./docs/deep-dive/2026-06-25-k8s-gpu-scheduling-development-review.md",
    cover: "./assets/k8s-gpu-scheduling-deep-dive.svg",
    summary: "从 Device Plugin、GPU Operator、MIG、DRA 到 Scheduler Framework 二次开发，串起架构设计、底层代码设计和常见 case 复盘。",
    meta: ["42 min", "Infra", "K8s GPU"],
  },

  "interview-qa": {
    title: "AI Agent 岗位深度追问手册（旧版总览）",
    tag: "Interview",
    path: "./docs/interview-qa.md",
    cover: "./assets/article-agent-runtime.png",
    summary: "把简历项目转译成面试官会深挖的工程问题，并给出可直接复述的答法、追问与指标口径。已按项目拆成 3 篇独立 Q&A，本篇保留作为快速索引。",
    meta: ["45 min", "Interview", "追问链路"],
  },

  "interview-artarch": {
    title: "ArtArch.AI · AI 智能创作平台 面试 Q&A",
    tag: "Interview",
    path: "./docs/interview/artarch-ai.md",
    cover: "./assets/interview-artarch-architecture.png",
    summary: "LangGraph 多阶段 Agent Runtime + Planner + 确定性装配 + SSE 协议 + Context Engineering + Eval 闭环。一次性可执行率 55% → 95%+ 的深度拆解。",
    meta: ["55 min", "Interview", "Agent Runtime"],
  },

  "interview-baidu-health": {
    title: "百度健康助手 · 医疗 RAG 多轮 Bot 面试 Q&A",
    tag: "Interview",
    path: "./docs/interview/baidu-health.md",
    cover: "./assets/interview-baidu-health-architecture.png",
    summary: "多轮状态机 + BM25/Dense 混合检索 + bge-reranker + 引用溯源 + 医疗安全双层兜底。Top-3 命中率 70% → 88%+，高风险拦截 98%+。",
    meta: ["40 min", "Interview", "RAG · Safety"],
  },

  "interview-baidu-map-ugc": {
    title: "百度地图 UGC + 大模型机审 面试 Q&A",
    tag: "Interview",
    path: "./docs/interview/baidu-map-ugc.md",
    cover: "./assets/interview-baidu-map-ugc-architecture.png",
    summary: "把简历四行话补全成完整方案：上报服务 + 工单流转 + 四层机审管线 + LLM Judge prompt + 评测灰度。机审自动化率 +50-70%。",
    meta: ["45 min", "Interview", "Moderation"],
  },

  "interview-note-langgraph-context": {
    title: "LangGraph 上下文工程实战（深度专题）",
    tag: "Interview · Notes",
    path: "./docs/interview/notes/langgraph-context-engineering.md",
    cover: "./assets/context-engineering-drew.png",
    summary: "双线索深扣：ArtArch.AI 实战（AssetRef 三层存储 / prompt_view / ConfirmedChoices / sub-graph）× Claude Code 对照（files-as-memory / TodoWrite / Auto-compaction / System Reminders / Task subagent）。含 4 级 cache_control 标注、UserMemory append-and-review、TurnReminder UI 事件隔离。",
    meta: ["45 min", "Notes", "Context Engineering"],
  },

  "interview-note-planner-deep-dive": {
    title: "Planner + 确定性装配 深度拆解",
    tag: "Interview · Notes",
    path: "./docs/interview/notes/planner-deterministic-deep-dive.md",
    cover: "./assets/cover-planner.jpg",
    summary: "把 LLM 工程当 compiler 工程做：Planner 输出 IR，DraftGenerator 做 codegen，Registry Guard 做 type check。",
    meta: ["20 min", "Notes", "Planner"],
  },

  "interview-note-rag-retrieval": {
    title: "医疗 RAG · 混合检索 + Rerank 工程实现",
    tag: "Interview · Notes",
    path: "./docs/interview/notes/rag-hybrid-retrieval.md",
    cover: "./assets/article-rag-retrieval.png",
    summary: "Query rewrite、BM25 mapping、bge-large-zh chunk 策略、RRF 公式、reranker 部署 + 业务约束 boost，每一步的实测增量。",
    meta: ["20 min", "Notes", "Retrieval"],
  },

  "interview-note-ugc-judge": {
    title: "UGC LLM Judge · Prompt 设计与失败模式",
    tag: "Interview · Notes",
    path: "./docs/interview/notes/ugc-llm-judge-prompt.md",
    cover: "./assets/cover-toolcall.jpg",
    summary: "结构化 Prompt 骨架 + Pydantic schema + retry-with-feedback + 6 类常见失败模式与修法。",
    meta: ["16 min", "Notes", "LLM Judge"],
  },

  "interview-note-ugc-agent": {
    title: "UGC Audit Agent · 工具集与多 Agent 编排",
    tag: "Interview · Notes",
    path: "./docs/interview/notes/ugc-audit-agent-tools.md",
    cover: "./assets/interview-baidu-map-ugc-architecture.png",
    summary: "Orchestrator-Workers + Evaluator-Optimizer 模式落地：12 个工具 spec、read/write 分级、Plan-and-Execute 升级路径、5 类 Agent loop 失败模式。",
    meta: ["20 min", "Notes", "Agent"],
  },

  "review-index": {
    title: "复习路线与资料索引",
    tag: "Index",
    path: "./docs/review/README.md",
    cover: "./assets/hero-agent-atlas.png",
    summary: "按复习节奏、技术域和面试能力建立导航，是整套资料的入口。",
    meta: ["8 min", "Plan", "Index"],
  },

  "references": {
    title: "资料来源与延伸阅读",
    tag: "References",
    path: "./docs/review/references.md",
    cover: "./assets/hero-agent-atlas.png",
    summary: "官方文档、论文、源码仓库和工程博客列表。",
    meta: ["10 min", "Sources", "Links"],
  },
};

/* Drawer groups — each group is a collapsible section in the left rail. */
const categoryGroups = [
  {
    key: "resume",
    title: "Resume",
    tone: "var(--tone-resume)",
    docs: ["resume-source"],
  },
  {
    key: "foundations",
    title: "Foundations",
    tone: "#6366f1",
    docs: ["transformer-fundamentals"],
  },
  {
    key: "agent",
    title: "Agent Runtime",
    tone: "var(--tone-review)",
    docs: ["agent-runtime", "claude-code-architecture", "planner-deterministic"],
  },
  {
    key: "retrieval",
    title: "Retrieval · RAG",
    tone: "#f59e0b",
    docs: ["rag-retrieval", "vector-db-reranker", "chunking-strategy", "elasticsearch-rag-agent"],
  },
  {
    key: "llmops",
    title: "LLM Ops",
    tone: "var(--tone-code)",
    docs: ["llm-observability", "tool-calling-mcp", "vibe-coding-spec", "context-engineering"],
  },
  {
    key: "infra",
    title: "Backend · Infra",
    tone: "#8b5cf6",
    docs: ["cloud-native", "k8s-gpu-scheduling"],
  },
  {
    key: "interview",
    title: "Interview · 项目 Q&A",
    tone: "var(--tone-interview)",
    docs: [
      "interview-artarch",
      "interview-baidu-health",
      "interview-baidu-map-ugc",
      "interview-qa",
    ],
  },
  {
    key: "interview-notes",
    title: "Interview · 技术专题",
    tone: "var(--tone-interview)",
    docs: [
      "interview-note-langgraph-context",
      "interview-note-planner-deep-dive",
      "interview-note-rag-retrieval",
      "interview-note-ugc-judge",
      "interview-note-ugc-agent",
    ],
  },
  {
    key: "meta",
    title: "Meta",
    tone: "var(--ink-3)",
    docs: ["review-index", "references"],
  },
];

const params = new URLSearchParams(window.location.search);
const selectedId = articles[params.get("doc")] ? params.get("doc") : "interview-artarch";
const selected = articles[selectedId];

function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/(^-|-$)/g, "");
}

const railStateKey = "atlas-rail-collapsed";

function getCollapsedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(railStateKey) || "[]"));
  } catch {
    return new Set();
  }
}

function saveCollapsedSet(set) {
  try {
    localStorage.setItem(railStateKey, JSON.stringify([...set]));
  } catch {
    // ignore storage failures
  }
}

function mountRail() {
  const rail = document.getElementById("articleRail");
  const collapsed = getCollapsedSet();
  const activeGroup = categoryGroups.find((g) => g.docs.includes(selectedId));
  if (activeGroup) collapsed.delete(activeGroup.key);

  rail.innerHTML = categoryGroups
    .map((group) => {
      const isCollapsed = collapsed.has(group.key);
      const items = group.docs
        .map((id) => {
          const article = articles[id];
          if (!article) return "";
          const active = id === selectedId ? "active" : "";
          return `
            <a class="rail-link ${active}" href="./reader.html?doc=${encodeURIComponent(id)}">
              <strong>${article.title}</strong>
              <span>${article.meta[0]} · ${article.tag}</span>
            </a>`;
        })
        .join("");
      return `
        <details class="rail-group" data-key="${group.key}" ${isCollapsed ? "" : "open"} style="--tone:${group.tone}">
          <summary>
            <span class="rail-group-name">${group.title}</span>
            <span class="rail-group-count">${group.docs.length}</span>
          </summary>
          <div class="rail-group-body">${items}</div>
        </details>`;
    })
    .join("");

  rail.querySelectorAll(".rail-group").forEach((details) => {
    details.addEventListener("toggle", () => {
      const set = getCollapsedSet();
      if (details.open) set.delete(details.dataset.key);
      else set.add(details.dataset.key);
      saveCollapsedSet(set);
    });
  });
}

function mountHero() {
  document.title = `${selected.title} · Atlas`;
  document.getElementById("articleHero").innerHTML = `
    <div class="article-cover"><img src="${selected.cover}" alt="" loading="eager" /></div>
    <div class="article-kicker">${selected.tag}</div>
    <h1>${selected.title}</h1>
    <p>${selected.summary}</p>
    <div class="article-meta">${selected.meta.map((item) => `<span>${item}</span>`).join("")}</div>
  `;
}

/** Replace {{term|译注}} with <abbr class="term-gloss" data-gloss="译注">term</abbr>.
 *  The replacement runs on the raw markdown string so it survives `marked` parsing.
 *  We deliberately do this *before* marked.parse — `{{...}}` doesn't clash with any
 *  GFM syntax, and emitting raw HTML keeps the tooltip working inside tables / lists. */
function annotateTerms(markdown) {
  return markdown.replace(/\{\{([^|{}\n]+)\|([^{}\n]+)\}\}/g, (_, term, gloss) => {
    const safeTerm = term.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const safeGloss = gloss.trim().replace(/"/g, "&quot;").replace(/</g, "&lt;");
    return `<abbr class="term-gloss" data-gloss="${safeGloss}" tabindex="0">${safeTerm}</abbr>`;
  });
}

function renderMarkdown(markdown) {
  const normalizedMarkdown = annotateTerms(
    markdown.replace(/\]\((?:\.\.\/)+assets\//g, "](./assets/"),
  );

  if (window.marked) {
    window.marked.setOptions({
      gfm: true,
      breaks: false,
      mangle: false,
      headerIds: false,
    });
    return window.marked.parse(normalizedMarkdown);
  }

  return normalizedMarkdown
    .split(/\n{2,}/)
    .map((block) => {
      if (block.startsWith("### ")) return `<h3>${block.slice(4)}</h3>`;
      if (block.startsWith("## ")) return `<h2>${block.slice(3)}</h2>`;
      if (block.startsWith("# ")) return `<h1>${block.slice(2)}</h1>`;
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

function enhanceHeadings(body) {
  const headings = [...body.querySelectorAll("h2, h3")];
  const used = new Map();
  headings.forEach((heading) => {
    const base = slugify(heading.textContent) || "section";
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    heading.id = count ? `${base}-${count + 1}` : base;
  });

  document.getElementById("tocList").innerHTML = headings
    .slice(0, 28)
    .map(
      (heading) =>
        `<a class="${heading.tagName.toLowerCase()}" href="#${heading.id}">${heading.textContent}</a>`,
    )
    .join("");
}

function enhanceCode(body) {
  body.querySelectorAll("pre").forEach((pre) => {
    const code = pre.querySelector("code");
    if (!code) return;

    const className = code.className || "";
    if (className.includes("language-mermaid")) {
      const mermaid = document.createElement("div");
      mermaid.className = "mermaid";
      mermaid.textContent = code.textContent;
      pre.replaceWith(mermaid);
      return;
    }

    const button = document.createElement("button");
    button.className = "copy-button";
    button.type = "button";
    button.textContent = "Copy";
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = "Copy";
        }, 1400);
      } catch {
        button.textContent = "Failed";
      }
    });
    pre.appendChild(button);
  });
}

function enhanceTablesAndImages(body) {
  body.querySelectorAll("table").forEach((table) => {
    if (table.parentElement.classList.contains("table-wrap")) return;
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  });

  body.querySelectorAll("p > img:only-child").forEach((img) => {
    const p = img.parentElement;
    const figure = document.createElement("figure");
    const clone = img.cloneNode(true);
    figure.appendChild(clone);
    if (img.alt) {
      const caption = document.createElement("figcaption");
      caption.textContent = img.alt;
      figure.appendChild(caption);
    }
    p.replaceWith(figure);
  });
}

function removeDuplicateLeadCover(body) {
  const firstFigure = [...body.children].find((element) => {
    if (element.tagName === "H1") return false;
    if (element.tagName === "FIGURE") return true;
    if (!element.textContent.trim()) return false;
    return true;
  });

  if (firstFigure?.tagName !== "FIGURE") return;
  const img = firstFigure.querySelector("img");
  if (!img) return;
  const coverName = selected.cover.split("/").pop();
  if (img.currentSrc.endsWith(coverName) || img.getAttribute("src")?.endsWith(coverName)) {
    firstFigure.remove();
  }
}

function normalizeInternalLinks(body) {
  const map = new Map([
    ["docs/interview-qa.md", "interview-qa"],
    ["docs/interview/artarch-ai.md", "interview-artarch"],
    ["docs/interview/baidu-health.md", "interview-baidu-health"],
    ["docs/interview/baidu-map-ugc.md", "interview-baidu-map-ugc"],
    ["docs/interview/notes/langgraph-context-engineering.md", "interview-note-langgraph-context"],
    ["docs/interview/notes/planner-deterministic-deep-dive.md", "interview-note-planner-deep-dive"],
    ["docs/interview/notes/rag-hybrid-retrieval.md", "interview-note-rag-retrieval"],
    ["docs/interview/notes/ugc-llm-judge-prompt.md", "interview-note-ugc-judge"],
    ["docs/interview/notes/ugc-audit-agent-tools.md", "interview-note-ugc-agent"],
    ["docs/review/README.md", "review-index"],
    ["docs/review/01-ai-agent-langgraph.md", "agent-runtime"],
    ["docs/review/13-claude-code-architecture.md", "claude-code-architecture"],
    ["docs/review/02-rag-retrieval.md", "rag-retrieval"],
    ["docs/review/03-llm-engineering-observability.md", "llm-observability"],
    ["docs/review/04-backend-cloud-native.md", "cloud-native"],
    ["docs/deep-dive/2026-06-25-k8s-gpu-scheduling-development-review.md", "k8s-gpu-scheduling"],
    ["docs/review/05-transformer-fundamentals.md", "transformer-fundamentals"],
    ["docs/review/06-planner-deterministic-assembly.md", "planner-deterministic"],
    ["docs/review/07-vector-db-reranker.md", "vector-db-reranker"],
    ["docs/review/11-chunking-strategy.md", "chunking-strategy"],
    ["docs/review/12-elasticsearch-rag-agent.md", "elasticsearch-rag-agent"],
    ["docs/review/08-tool-calling-mcp.md", "tool-calling-mcp"],
    ["docs/review/references.md", "references"],
    ["interview-qa.md", "interview-qa"],
    ["artarch-ai.md", "interview-artarch"],
    ["baidu-health.md", "interview-baidu-health"],
    ["baidu-map-ugc.md", "interview-baidu-map-ugc"],
    ["notes/langgraph-context-engineering.md", "interview-note-langgraph-context"],
    ["notes/planner-deterministic-deep-dive.md", "interview-note-planner-deep-dive"],
    ["notes/rag-hybrid-retrieval.md", "interview-note-rag-retrieval"],
    ["notes/ugc-llm-judge-prompt.md", "interview-note-ugc-judge"],
    ["notes/ugc-audit-agent-tools.md", "interview-note-ugc-agent"],
    ["../artarch-ai.md", "interview-artarch"],
    ["../baidu-health.md", "interview-baidu-health"],
    ["../baidu-map-ugc.md", "interview-baidu-map-ugc"],
    ["README.md", "review-index"],
    ["01-ai-agent-langgraph.md", "agent-runtime"],
    ["13-claude-code-architecture.md", "claude-code-architecture"],
    ["02-rag-retrieval.md", "rag-retrieval"],
    ["03-llm-engineering-observability.md", "llm-observability"],
    ["04-backend-cloud-native.md", "cloud-native"],
    ["2026-06-25-k8s-gpu-scheduling-development-review.md", "k8s-gpu-scheduling"],
    ["05-transformer-fundamentals.md", "transformer-fundamentals"],
    ["06-planner-deterministic-assembly.md", "planner-deterministic"],
    ["07-vector-db-reranker.md", "vector-db-reranker"],
    ["11-chunking-strategy.md", "chunking-strategy"],
    ["12-elasticsearch-rag-agent.md", "elasticsearch-rag-agent"],
    ["08-tool-calling-mcp.md", "tool-calling-mcp"],
    ["references.md", "references"],
  ]);

  body.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href");
    const normalized = href.replace(/^\.\//, "");
    if (map.has(normalized)) {
      link.setAttribute("href", `./reader.html?doc=${map.get(normalized)}`);
    }
  });
}

async function mountArticle() {
  const body = document.getElementById("articleBody");
  try {
    const response = await fetch(selected.path);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const markdown = await response.text();
    body.innerHTML = renderMarkdown(markdown);
    enhanceHeadings(body);
    enhanceCode(body);
    enhanceTablesAndImages(body);
    removeDuplicateLeadCover(body);
    normalizeInternalLinks(body);

    if (window.mermaid) {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: {
          background: "#ffffff",
          primaryColor: "#f4f4f0",
          primaryTextColor: "#111113",
          primaryBorderColor: "#d6d6cf",
          lineColor: "#9a9aa1",
          secondaryColor: "#eef0ff",
          tertiaryColor: "#fafaf7",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        },
      });
      // Render mermaid blocks one at a time so a single malformed diagram
      // doesn't blow up the whole article render.
      for (const el of body.querySelectorAll(".mermaid")) {
        try {
          await window.mermaid.run({ nodes: [el] });
        } catch (err) {
          el.outerHTML = `<pre class="mermaid-error" style="padding:14px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2);color:var(--ink-3);font-family:var(--font-mono);font-size:12.5px;white-space:pre-wrap;">Mermaid render failed:\n${String(err)}\n\n---\n${el.textContent.trim()}</pre>`;
        }
      }
    }

    // Re-trigger hash scroll after async markdown render — the target heading
    // didn't exist when the browser first parsed the URL fragment.
    if (window.location.hash) {
      const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  } catch (error) {
    body.innerHTML = `
      <div class="article-error">
        <h2>文章加载失败</h2>
        <p>无法读取 ${selected.path}。</p>
        <pre>${String(error)}</pre>
      </div>
    `;
  }
}

mountRail();
mountHero();
mountArticle();
