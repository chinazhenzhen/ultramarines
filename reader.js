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
    title: "AI Agent 与 LangGraph 工程化",
    tag: "Agent Runtime",
    path: "./docs/review/01-ai-agent-langgraph.md",
    cover: "./assets/article-agent-runtime-v2.png",
    summary: "基于 dag_engine 源码拆解双运行时架构：底层 DAG 执行器与上层 LangGraph Agent Runtime 的边界、实践和优化点。",
    meta: ["32 min", "Architecture", "LangGraph"],
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
    summary: "pgvector / Milvus / Qdrant / ES+Faiss 对比，HNSW vs IVF 调参，bge-reranker 训练与混合分数融合（RRF / Weighted）。",
    meta: ["22 min", "Retrieval", "Selection"],
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

  "interview-qa": {
    title: "AI Agent 岗位深度追问手册",
    tag: "Interview",
    path: "./docs/interview-qa.md",
    cover: "./assets/article-agent-runtime.png",
    summary: "把简历项目转译成面试官会深挖的工程问题，并给出可直接复述的答法、追问与指标口径。",
    meta: ["45 min", "Interview", "追问链路"],
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
    docs: ["agent-runtime", "planner-deterministic"],
  },
  {
    key: "retrieval",
    title: "Retrieval · RAG",
    tone: "#f59e0b",
    docs: ["rag-retrieval", "vector-db-reranker"],
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
    docs: ["cloud-native"],
  },
  {
    key: "interview",
    title: "Interview",
    tone: "var(--tone-interview)",
    docs: ["interview-qa"],
  },
  {
    key: "meta",
    title: "Meta",
    tone: "var(--ink-3)",
    docs: ["review-index", "references"],
  },
];

const params = new URLSearchParams(window.location.search);
const selectedId = articles[params.get("doc")] ? params.get("doc") : "interview-qa";
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

function renderMarkdown(markdown) {
  const normalizedMarkdown = markdown.replace(/\]\((?:\.\.\/)+assets\//g, "](./assets/");

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
    ["docs/review/README.md", "review-index"],
    ["docs/review/01-ai-agent-langgraph.md", "agent-runtime"],
    ["docs/review/02-rag-retrieval.md", "rag-retrieval"],
    ["docs/review/03-llm-engineering-observability.md", "llm-observability"],
    ["docs/review/04-backend-cloud-native.md", "cloud-native"],
    ["docs/review/05-transformer-fundamentals.md", "transformer-fundamentals"],
    ["docs/review/06-planner-deterministic-assembly.md", "planner-deterministic"],
    ["docs/review/07-vector-db-reranker.md", "vector-db-reranker"],
    ["docs/review/08-tool-calling-mcp.md", "tool-calling-mcp"],
    ["docs/review/references.md", "references"],
    ["interview-qa.md", "interview-qa"],
    ["README.md", "review-index"],
    ["01-ai-agent-langgraph.md", "agent-runtime"],
    ["02-rag-retrieval.md", "rag-retrieval"],
    ["03-llm-engineering-observability.md", "llm-observability"],
    ["04-backend-cloud-native.md", "cloud-native"],
    ["05-transformer-fundamentals.md", "transformer-fundamentals"],
    ["06-planner-deterministic-assembly.md", "planner-deterministic"],
    ["07-vector-db-reranker.md", "vector-db-reranker"],
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
