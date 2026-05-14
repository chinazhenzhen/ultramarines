/* Atlas · index page logic
   - Bento grid (4 categories)
   - Recent updates feed
   - Cmd+K command palette (native <dialog>)
*/

const reader = (doc) => `./reader.html?doc=${encodeURIComponent(doc)}`;

const categories = [
  {
    key: "resume",
    tone: "var(--tone-resume)",
    tag: "Resume",
    title: "个人简历",
    blurb: "马震 · 后端研发工程师 / AI Agent 开发。7 年后端 + AI 平台，按工程指标讲项目。",
    groups: [
      { label: "个人优势 + 技能清单", href: reader("resume-source") + "#个人优势" },
      { label: "工作经历", href: reader("resume-source") + "#工作经历" },
      { label: "项目经历（4 段）", href: reader("resume-source") + "#项目经历" },
    ],
    cta: { label: "打开完整简历", href: reader("resume-source") },
    count: 1,
  },
  {
    key: "review",
    tone: "var(--tone-review)",
    tag: "Review",
    title: "分类复习文档",
    blurb: "按 5 大类抽屉式整理 —— 基础、Agent、RAG、LLM Ops、Infra。每篇含架构图、源码骨架与失败边界。",
    groups: [
      { tone: "#6366f1", label: "Foundations", count: 1, href: reader("transformer-fundamentals") },
      { tone: "var(--tone-review)", label: "Agent Runtime", count: 2, href: reader("agent-runtime") },
      { tone: "#f59e0b", label: "Retrieval · RAG", count: 3, href: reader("rag-retrieval") },
      { tone: "var(--tone-code)", label: "LLM Ops", count: 4, href: reader("llm-observability") },
      { tone: "#8b5cf6", label: "Backend · Infra", count: 1, href: reader("cloud-native") },
    ],
    cta: { label: "进入复习索引", href: reader("review-index") },
    count: 11,
  },
  {
    key: "code",
    tone: "var(--tone-code)",
    tag: "Code",
    title: "代码练习题",
    blurb: "算法、系统设计、工程实现的肌肉记忆 —— 这一区还在筹备中，先放占位骨架。",
    empty: "Coming soon · 占位区域\n后续会按 算法 / 系统设计 / Python·Go 工程实现 三类沉淀。",
    cta: { label: "暂无内容", href: "#code", disabled: true },
    count: 0,
  },
  {
    key: "interview",
    tone: "var(--tone-interview)",
    tag: "Interview",
    title: "面试 Q&A · 三大项目",
    blurb: "按简历的三段项目独立成篇，每篇都含项目介绍、深度追问、代码骨架、发散 tip 和反向引导地图。4 篇技术专题 Notes 作为延伸。",
    groups: [
      { tone: "var(--tone-interview)", label: "ArtArch.AI · Agent Runtime", count: 1, href: reader("interview-artarch") },
      { tone: "#f59e0b",                 label: "百度健康助手 · 医疗 RAG",     count: 1, href: reader("interview-baidu-health") },
      { tone: "var(--tone-code)",        label: "百度地图 · UGC 机审",         count: 1, href: reader("interview-baidu-map-ugc") },
      { tone: "var(--ink-3)",            label: "技术专题 Notes",              count: 5, href: reader("interview-note-langgraph-context") },
      { tone: "var(--ink-4)",            label: "旧版总览索引",                count: 1, href: reader("interview-qa") },
    ],
    cta: { label: "进入面试 Q&A 索引", href: reader("interview-artarch") },
    count: 9,
  },
];

const feedEntries = [
  { date: "2026-05-14", tag: "Review", tone: "var(--tone-review)", title: "Chunking 策略：RAG 里最被低估的工程模块（落地深扣）", meta: "32 min · retrieval", href: reader("chunking-strategy") },
  { date: "2026-05-14", tag: "Review", tone: "var(--tone-review)", title: "RAG / Vector DB 复习长文升级：真实 pipeline 代码 + 服务化部署 + 三层缓存", meta: "30 min · retrieval", href: reader("vector-db-reranker") },
  { date: "2026-05-13", tag: "Interview", tone: "var(--tone-interview)", title: "面试 Q&A 重构：按项目拆成 3 篇独立 Q&A + 4 篇技术专题", meta: "55 min · qa", href: reader("interview-artarch") },
  { date: "2026-05-13", tag: "Interview", tone: "var(--tone-interview)", title: "ArtArch.AI 面试 Q&A：LangGraph + Planner + Context Engineering", meta: "55 min · agent", href: reader("interview-artarch") },
  { date: "2026-05-13", tag: "Interview", tone: "var(--tone-interview)", title: "百度健康助手 RAG 面试 Q&A：混合检索 + 医疗安全双层兜底", meta: "40 min · rag", href: reader("interview-baidu-health") },
  { date: "2026-05-13", tag: "Interview", tone: "var(--tone-interview)", title: "百度地图 UGC + 大模型机审 面试 Q&A（完整方案脑补）", meta: "45 min · moderation", href: reader("interview-baidu-map-ugc") },
  { date: "2026-05-12", tag: "Review", tone: "var(--tone-code)", title: "How to Fix Your Context · LangGraph 上下文工程六法", meta: "50 min · context", href: reader("context-engineering") },
  { date: "2026-05-12", tag: "Review", tone: "var(--tone-code)", title: "Vibe Coding 时代的工程师优势 · 退款需求规格拆解", meta: "24 min · requirements", href: reader("vibe-coding-spec") },
  { date: "2026-05-12", tag: "Review", tone: "var(--tone-review)", title: "重写复习索引：把 5 天复习节奏拆到每篇长文", meta: "8 min · plan", href: reader("review-index") },
  { date: "2026-05-12", tag: "Interview", tone: "var(--tone-interview)", title: "Agent 岗位深度追问手册更新 · 新增 SSE 重连与 K8s GPU 章节", meta: "45 min · qa", href: reader("interview-qa") },
  { date: "2026-05-11", tag: "Review", tone: "var(--tone-review)", title: "后端架构、SSE、Kubernetes GPU 与 Operator", meta: "20 min · infra", href: reader("cloud-native") },
  { date: "2026-05-11", tag: "Review", tone: "var(--tone-review)", title: "LLM 工程化、评测与可观测", meta: "20 min · governance", href: reader("llm-observability") },
  { date: "2026-05-11", tag: "Review", tone: "var(--tone-review)", title: "RAG、混合检索与医疗问答", meta: "22 min · retrieval", href: reader("rag-retrieval") },
  { date: "2026-05-12", tag: "Review", tone: "var(--tone-review)", title: "AI Agent 与 LangGraph 工程化 · dag_engine 源码复盘", meta: "32 min · architecture", href: reader("agent-runtime") },
  { date: "2026-05-11", tag: "Resume", tone: "var(--tone-resume)", title: "更新简历主线 —— 突出 Agent Runtime 与平台经验", meta: "—  · cv", href: reader("resume-source") },
];

// Command palette index
const paletteIndex = [
  { group: "简历",   label: "马震 · 后端研发工程师",          href: reader("resume-source"),     hint: "resume",    tone: "var(--tone-resume)" },
  { group: "复习",   label: "AI Agent 与 LangGraph 工程化",   href: reader("agent-runtime"),     hint: "agent",     tone: "var(--tone-review)" },
  { group: "复习",   label: "RAG、混合检索与医疗问答",         href: reader("rag-retrieval"),     hint: "rag",       tone: "var(--tone-review)" },
  { group: "复习",   label: "Vector DB 选型 + Reranker 深入",   href: reader("vector-db-reranker"), hint: "vector db reranker pgvector milvus qdrant tei cache", tone: "var(--tone-review)" },
  { group: "复习",   label: "Chunking 策略：RAG 工程落地",      href: reader("chunking-strategy"),  hint: "chunking parent contextual retrieval anthropic semantic", tone: "var(--tone-review)" },
  { group: "复习",   label: "LLM 工程化、评测与可观测",         href: reader("llm-observability"), hint: "llm-ops",   tone: "var(--tone-review)" },
  { group: "复习",   label: "Vibe Coding 时代的工程师优势",      href: reader("vibe-coding-spec"),  hint: "requirements refund ai-coding", tone: "var(--tone-code)" },
  { group: "复习",   label: "How to Fix Your Context：上下文工程六法", href: reader("context-engineering"), hint: "context engineering langgraph rag pruning memory", tone: "var(--tone-code)" },
  { group: "复习",   label: "后端架构、SSE、K8s GPU、Operator", href: reader("cloud-native"),      hint: "infra",     tone: "var(--tone-review)" },
  { group: "复习",   label: "五天复习路线与资料索引",            href: reader("review-index"),      hint: "plan",      tone: "var(--tone-review)" },
  { group: "复习",   label: "资料来源与延伸阅读",                href: reader("references"),        hint: "refs",      tone: "var(--tone-review)" },
  { group: "面试",   label: "ArtArch.AI · AI 智能创作平台 Q&A",  href: reader("interview-artarch"),      hint: "artarch agent langgraph planner",  tone: "var(--tone-interview)" },
  { group: "面试",   label: "百度健康助手 · 医疗 RAG Q&A",         href: reader("interview-baidu-health"), hint: "rag medical safety bge rerank",     tone: "var(--tone-interview)" },
  { group: "面试",   label: "百度地图 · UGC + 大模型机审 Q&A",     href: reader("interview-baidu-map-ugc"), hint: "ugc moderation llm judge",          tone: "var(--tone-interview)" },
  { group: "面试",   label: "Notes · LangGraph 上下文工程",        href: reader("interview-note-langgraph-context"), hint: "context engineering",   tone: "var(--tone-interview)" },
  { group: "面试",   label: "Notes · Planner + 确定性装配深度",    href: reader("interview-note-planner-deep-dive"), hint: "planner deterministic", tone: "var(--tone-interview)" },
  { group: "面试",   label: "Notes · 医疗 RAG 工程实现",           href: reader("interview-note-rag-retrieval"),     hint: "rag rerank bm25 dense", tone: "var(--tone-interview)" },
  { group: "面试",   label: "Notes · UGC LLM Judge Prompt",       href: reader("interview-note-ugc-judge"),         hint: "ugc judge prompt schema", tone: "var(--tone-interview)" },
  { group: "面试",   label: "Notes · UGC Audit Agent 工具集",      href: reader("interview-note-ugc-agent"),         hint: "ugc agent orchestrator evaluator tools", tone: "var(--tone-interview)" },
  { group: "面试",   label: "旧版 · AI Agent 深度追问总览",        href: reader("interview-qa"),      hint: "qa overview",        tone: "var(--tone-interview)" },
  { group: "导航",   label: "回到首页",                        href: "#top",                       hint: "home",      tone: "var(--ink-3)" },
  { group: "导航",   label: "更新日志",                        href: "#feed",                      hint: "changelog", tone: "var(--ink-3)" },
];

/* ---------- render bento ---------- */
function renderBento() {
  const root = document.getElementById("bentoGrid");
  root.innerHTML = categories
    .map((c) => {
      let items;
      if (c.groups) {
        items = `<ul class="card-groups">${c.groups
          .map(
            (g) => `
              <li class="card-group" style="--tone:${g.tone || c.tone}">
                <a href="${g.href}">
                  <span class="card-group-dot"></span>
                  <span class="card-group-label">${g.label}</span>
                  ${g.count != null ? `<span class="card-group-count">${g.count}</span>` : ""}
                </a>
              </li>`,
          )
          .join("")}</ul>`;
      } else if (c.items) {
        items = `<ul class="card-items">${c.items
          .map((it) => `<li><a href="${it.href}">${it.label}</a></li>`)
          .join("")}</ul>`;
      } else {
        items = `<div class="card-empty">${c.empty.replace(/\n/g, "<br>")}</div>`;
      }
      const cta = c.cta.disabled
        ? `<span class="card-cta is-disabled">${c.cta.label}</span>`
        : `<a class="card-cta" href="${c.cta.href}">${c.cta.label}</a>`;
      const titleHref = c.cta.disabled ? "#code" : c.cta.href;
      return `
        <article class="card card-${c.key}" id="${c.key}" style="--tone:${c.tone}">
          <div class="card-head">
            <span class="card-tag">${c.tag}</span>
            <span class="card-count">${c.count.toString().padStart(2, "0")} 篇</span>
          </div>
          <h3><a class="card-title-link" href="${titleHref}">${c.title}</a></h3>
          <p>${c.blurb}</p>
          ${items}
          <div class="card-foot">${cta}</div>
        </article>`;
    })
    .join("");
}

/* ---------- render feed ---------- */
function renderFeed() {
  const root = document.getElementById("feedList");
  root.innerHTML = feedEntries
    .map(
      (e) => `
        <a class="feed-row" href="${e.href}" style="--tone:${e.tone}">
          <span class="feed-date">${e.date}</span>
          <span class="feed-tag">${e.tag}</span>
          <span class="feed-title">${e.title}</span>
          <span class="feed-meta">${e.meta}</span>
        </a>`,
    )
    .join("");
  document.getElementById("docCount").textContent = paletteIndex.filter((p) => p.group !== "导航").length;
}

/* ---------- command palette ---------- */
function setupPalette() {
  const dlg = document.getElementById("palette");
  const input = document.getElementById("paletteInput");
  const list = document.getElementById("paletteList");
  let selectedIndex = 0;
  let filtered = [];

  function render(query) {
    const q = query.trim().toLowerCase();
    filtered = q
      ? paletteIndex.filter((p) =>
          [p.label, p.group, p.hint].join(" ").toLowerCase().includes(q),
        )
      : paletteIndex;

    if (!filtered.length) {
      list.innerHTML = `<li class="palette-empty">没有匹配的资料。试试 "agent" "rag" "k8s"。</li>`;
      return;
    }

    const grouped = filtered.reduce((acc, item) => {
      (acc[item.group] = acc[item.group] || []).push(item);
      return acc;
    }, {});

    let html = "";
    let flatIdx = 0;
    for (const [group, items] of Object.entries(grouped)) {
      html += `<li class="palette-group-label">${group}</li>`;
      for (const item of items) {
        html += `
          <li class="palette-item" role="option" data-href="${item.href}" data-idx="${flatIdx}" style="--tone:${item.tone}">
            <span class="palette-item-glyph">${item.hint.slice(0, 1).toUpperCase()}</span>
            <span>${item.label}</span>
            <span class="palette-item-sub">${item.hint}</span>
          </li>`;
        flatIdx += 1;
      }
    }
    list.innerHTML = html;
    selectedIndex = Math.min(selectedIndex, filtered.length - 1);
    if (selectedIndex < 0) selectedIndex = 0;
    highlight();
  }

  function highlight() {
    list.querySelectorAll(".palette-item").forEach((el) => {
      const idx = Number(el.dataset.idx);
      el.setAttribute("aria-selected", String(idx === selectedIndex));
      if (idx === selectedIndex) el.scrollIntoView({ block: "nearest" });
    });
  }

  function move(delta) {
    if (!filtered.length) return;
    selectedIndex = (selectedIndex + delta + filtered.length) % filtered.length;
    highlight();
  }

  function activate() {
    const target = filtered[selectedIndex];
    if (!target) return;
    dlg.close();
    if (target.href.startsWith("#")) {
      document.querySelector(target.href)?.scrollIntoView({ behavior: "smooth" });
    } else {
      window.location.href = target.href;
    }
  }

  function open() {
    if (typeof dlg.showModal !== "function") return;
    dlg.showModal();
    input.value = "";
    selectedIndex = 0;
    render("");
    requestAnimationFrame(() => input.focus());
  }

  document.querySelectorAll("[data-open-palette]").forEach((btn) =>
    btn.addEventListener("click", open),
  );

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      open();
      return;
    }
    if (event.key === "/" && document.activeElement === document.body) {
      event.preventDefault();
      open();
    }
  });

  dlg.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
    else if (event.key === "Enter") { event.preventDefault(); activate(); }
  });

  input.addEventListener("input", (event) => render(event.target.value));

  list.addEventListener("click", (event) => {
    const item = event.target.closest(".palette-item");
    if (!item) return;
    selectedIndex = Number(item.dataset.idx);
    activate();
  });

  dlg.addEventListener("click", (event) => {
    if (event.target === dlg) dlg.close();
  });
}

renderBento();
renderFeed();
setupPalette();
