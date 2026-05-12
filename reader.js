const articles = {
  "interview-qa": {
    title: "AI Agent 岗位深度追问手册",
    tag: "Q&A",
    path: "./docs/interview-qa.md",
    cover: "./assets/article-agent-runtime.png",
    summary: "把简历项目转译成面试官会深挖的工程问题，并给出可直接复述的答法、追问与指标口径。",
    meta: ["45 min", "Interview", "追问链路"],
  },
  "agent-runtime": {
    title: "AI Agent 与 LangGraph 工程化",
    tag: "Agent Runtime",
    path: "./docs/review/01-ai-agent-langgraph.md",
    cover: "./assets/article-agent-runtime.png",
    summary: "围绕 Workflow vs Agent、StateGraph、checkpoint、interrupt/resume 与确定性装配，建立生产级 Agent Runtime 的回答框架。",
    meta: ["18 min", "Architecture", "LangGraph"],
  },
  "rag-retrieval": {
    title: "RAG、混合检索与医疗问答",
    tag: "RAG",
    path: "./docs/review/02-rag-retrieval.md",
    cover: "./assets/article-rag-retrieval.png",
    summary: "从混合召回、rerank、context builder、citation 到医疗安全策略，讲清 RAG 质量为什么是一条链路。",
    meta: ["22 min", "Retrieval", "Safety"],
  },
  "llm-observability": {
    title: "LLM 工程化、评测与可观测",
    tag: "LLM Ops",
    path: "./docs/review/03-llm-engineering-observability.md",
    cover: "./assets/article-llm-observability.png",
    summary: "结构化输出、工具调用、Provider 抽象、trace、eval、成本与安全边界，是 Agent 上线后的治理层。",
    meta: ["20 min", "Governance", "Eval"],
  },
  "cloud-native": {
    title: "后端架构、SSE、Kubernetes GPU 与 Operator",
    tag: "Backend",
    path: "./docs/review/04-backend-cloud-native.md",
    cover: "./assets/article-cloud-native.png",
    summary: "把 Agent 服务放进真实生产系统：长任务 API、SSE event store、GPU 调度和 Operator 控制循环。",
    meta: ["20 min", "Infra", "Kubernetes"],
  },
  "review-index": {
    title: "五天复习路线与资料索引",
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
  "resume-source": {
    title: "候选人原始项目材料",
    tag: "Evidence",
    path: "./docs/马震-15253371862-后端研发工程师.md",
    cover: "./assets/hero-agent-atlas.png",
    summary: "这部分只作为面试证据来源，不作为站点主视觉中心。",
    meta: ["10 min", "Resume", "Private Context"],
  },
};

const articleOrder = [
  "interview-qa",
  "agent-runtime",
  "rag-retrieval",
  "llm-observability",
  "cloud-native",
  "review-index",
  "references",
  "resume-source",
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

function mountRail() {
  const rail = document.getElementById("articleRail");
  rail.innerHTML = articleOrder
    .map((id) => {
      const article = articles[id];
      return `
        <a class="rail-link ${id === selectedId ? "active" : ""}" href="./reader.html?doc=${encodeURIComponent(id)}">
          <strong>${article.title}</strong>
          <span>${article.tag} · ${article.meta[0]}</span>
        </a>
      `;
    })
    .join("");
}

function mountHero() {
  document.title = `${selected.title} · AI Agent Interview Atlas`;
  document.getElementById("articleHero").innerHTML = `
    <img src="${selected.cover}" alt="" />
    <div class="article-hero-content">
      <div class="article-kicker">${selected.tag}</div>
      <h1>${selected.title}</h1>
      <p>${selected.summary}</p>
      <div class="article-meta">${selected.meta.map((item) => `<span>${item}</span>`).join("")}</div>
    </div>
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
    .slice(0, 24)
    .map((heading) => `<a class="${heading.tagName.toLowerCase()}" href="#${heading.id}">${heading.textContent}</a>`)
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
    ["docs/review/references.md", "references"],
    ["interview-qa.md", "interview-qa"],
    ["README.md", "review-index"],
    ["01-ai-agent-langgraph.md", "agent-runtime"],
    ["02-rag-retrieval.md", "rag-retrieval"],
    ["03-llm-engineering-observability.md", "llm-observability"],
    ["04-backend-cloud-native.md", "cloud-native"],
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
          background: "#fffaf0",
          primaryColor: "#ecdfc9",
          primaryTextColor: "#172027",
          primaryBorderColor: "#a96f13",
          lineColor: "#1f8fb5",
          secondaryColor: "#d9edf1",
          tertiaryColor: "#f7f3ea",
          fontFamily: "Inter, sans-serif",
        },
      });
      await window.mermaid.run({ querySelector: ".mermaid" });
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
