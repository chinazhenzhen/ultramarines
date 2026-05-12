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
      { tone: "#f59e0b", label: "Retrieval · RAG", count: 2, href: reader("rag-retrieval") },
      { tone: "var(--tone-code)", label: "LLM Ops", count: 2, href: reader("llm-observability") },
      { tone: "#8b5cf6", label: "Backend · Infra", count: 1, href: reader("cloud-native") },
    ],
    cta: { label: "进入复习索引", href: reader("review-index") },
    count: 8,
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
    title: "面试经历总结",
    blurb: "围绕简历项目的深度追问、答法骨架与追问链路。每条都来自真实问过的或可能问的问题。",
    items: [
      { label: "AI Agent 岗位深度追问手册", href: reader("interview-qa") },
    ],
    cta: { label: "打开追问手册", href: reader("interview-qa") },
    count: 1,
  },
];

const feedEntries = [
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
  { group: "复习",   label: "LLM 工程化、评测与可观测",         href: reader("llm-observability"), hint: "llm-ops",   tone: "var(--tone-review)" },
  { group: "复习",   label: "后端架构、SSE、K8s GPU、Operator", href: reader("cloud-native"),      hint: "infra",     tone: "var(--tone-review)" },
  { group: "复习",   label: "五天复习路线与资料索引",            href: reader("review-index"),      hint: "plan",      tone: "var(--tone-review)" },
  { group: "复习",   label: "资料来源与延伸阅读",                href: reader("references"),        hint: "refs",      tone: "var(--tone-review)" },
  { group: "面试",   label: "AI Agent 岗位深度追问手册",        href: reader("interview-qa"),      hint: "qa",        tone: "var(--tone-interview)" },
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
