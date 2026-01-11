(function () {
  const ctx = window.__MARKDOWN_PAGE_CONTEXT__ || {};
  const state = {
    version: ctx.version || "dev",
    theme: ctx.theme || "anonymous-light",
    assetsMount: ctx.assetsMount || "/public",
    tocMarker: ctx.tocMarker || "MD-T0C-T0KEN",
    frontMatter: ctx.frontMatter || {},
    requestPath: ctx.requestPath || "/",
    title: ctx.title || "Markdown Document",
    themes: Array.isArray(ctx.themes) ? ctx.themes : [],
  };

  document.documentElement.setAttribute("data-theme", state.theme);

  const themeLinkEl = document.getElementById("theme-stylesheet");
  const themeSelectEl = document.getElementById("theme-switcher");
  populateThemeSelect(themeSelectEl, state);
  const resolvedInitialTheme = resolveInitialTheme(state);
  applyTheme(resolvedInitialTheme, state, themeLinkEl, true);
  if (themeSelectEl) {
    if (!themeSelectEl.value || themeSelectEl.value !== resolvedInitialTheme) {
      themeSelectEl.value = resolvedInitialTheme;
    }
    themeSelectEl.addEventListener("change", (evt) => {
      const next = sanitizeTheme(evt.target.value, state);
      applyTheme(next, state, themeLinkEl, false);
    });
  }

  const markdown = decodeMarkdown(ctx.markdownBase64 || "");
  const normalizedMarkdown = normalizeMarkdown(markdown, state.tocMarker);
  const writeEl = document.getElementById("write");

  if (!writeEl) {
    return;
  }

  if (!normalizedMarkdown.trim()) {
    writeEl.innerHTML = buildEmptyMessage();
    return;
  }

  const md = window.markdownit({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
  });

  // 不启用 sub/sup 插件，避免在 $$ 内改写 \_ / ^，导致 KaTeX 解析失败
  if (window.markdownitMark) md.use(window.markdownitMark);
  if (window.markdownitFootnote) md.use(window.markdownitFootnote);
  if (window.markdownitTaskLists)
    md.use(window.markdownitTaskLists, { label: true, labelAfter: true });

  let rendered = md.render(normalizedMarkdown);
    const tocHtml = '<div id="md-toc" data-toc-placeholder="1"></div>';
    const tocMarkers = [
      state.tocMarker,
      "__MD_TOC_PLACEHOLDER__",
      "MD_TOC_PLACEHOLDER",
      "MD_TOC_PLACEHOLDER__"
    ].filter(Boolean);

    tocMarkers.forEach((marker) => {
      rendered = rendered.split(marker).join(tocHtml);
    });

    rendered = rendered.replace(
      /<p>\s*(<div id="md-toc" data-toc-placeholder="1"><\/div>)\s*<\/p>/gi,
      "$1"
    );

  writeEl.innerHTML = rendered;

  const frontTitle = state.frontMatter.title || state.title;
  document.title = `${frontTitle} - Markdown Preview`;
  renderFrontMatterMeta(state.frontMatter, state.requestPath);

  applyHeadingIds(writeEl);
  buildToc(writeEl);
  transformCallouts(writeEl);
  transformMermaid(writeEl, state.theme);
  highlightCode(writeEl);
  renderMath(writeEl);
  restyleMermaid(writeEl);
})();

function decodeMarkdown(base64) {
  if (!base64) return "";
  try {
    const binary = atob(base64);
    if (window.TextDecoder) {
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    }
    return decodeURIComponent(escape(binary));
  } catch (err) {
    console.warn("Failed to decode markdown payload", err);
    return "";
  }
}

function normalizeMarkdown(markdown, tocMarker) {
  const body = stripFrontMatter(markdown).body;
  return body.replace(/\[toc\]/gi, tocMarker || "MD-T0C-T0KEN");
}

function stripFrontMatter(markdown) {
  const frontMatterRegex = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/;
  const match = markdown.match(frontMatterRegex);
  if (!match) return { body: markdown, frontMatter: {} };
  return { body: markdown.replace(frontMatterRegex, ""), frontMatter: {} };
}

function buildEmptyMessage() {
  return [
    '<div class="empty-state">',
    "<p>没有可渲染的 Markdown 内容。</p>",
    "<p>请通过文件服务访问 .md 文件以载入内容。</p>",
    "</div>",
  ].join("");
}

function slugify(text) {
  return (text || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function applyHeadingIds(root) {
  const used = new Map();
  root.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
    const baseId = slugify(el.textContent || "heading");
    let candidate = baseId || "heading";
    let counter = 1;
    while (used.has(candidate)) {
      candidate = `${baseId || "heading"}-${counter++}`;
    }
    used.set(candidate, true);
    el.id = candidate;
  });
}

function buildToc(root) {
  const tocHost = root.querySelector("[data-toc-placeholder]");
  if (!tocHost) return;

  const headings = root.querySelectorAll("h1, h2, h3, h4, h5, h6");
  if (!headings.length) return;

  const list = document.createElement("ul");
  list.className = "toc-list";

  headings.forEach((node) => {
    const level = Number(node.tagName.replace("H", ""));
    const item = document.createElement("li");
    item.className = `toc-item toc-level-${level}`;

    const link = document.createElement("a");
    link.href = `#${node.id}`;
    link.textContent = node.textContent || "";

    item.appendChild(link);
    list.appendChild(item);
  });

  tocHost.classList.add("md-toc");
  tocHost.innerHTML = "";
  tocHost.appendChild(list);
}

function transformCallouts(root) {
  const pattern = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)]\s*/i;
  root.querySelectorAll("blockquote").forEach((block) => {
    const first = block.firstElementChild;
    if (!first || first.tagName !== "P") return;

    const html = first.innerHTML || "";
    const match = html.match(pattern);
    if (!match) return;

    const type = match[1].toLowerCase();
    first.innerHTML = html.replace(pattern, "").trim();
    const labelMap = {
      note: "NOTE",
      tip: "TIP",
      important: "IMPORTANT",
      warning: "WARNING",
      caution: "CAUTION",
    };

    block.classList.add("md-callout", `md-callout-${type}`);
    block.setAttribute("data-callout-label", labelMap[type] || type.toUpperCase());
  });
}

function transformMermaid(root, theme) {
  const mermaidBlocks = [];
  root.querySelectorAll("pre code.language-mermaid").forEach((code) => {
    const wrapper = document.createElement("div");
    wrapper.className = "mermaid";
    wrapper.textContent = code.textContent || "";

    const pre = code.parentElement;
    if (pre && pre.parentElement) {
      pre.parentElement.replaceChild(wrapper, pre);
    }
    mermaidBlocks.push(wrapper);
  });

  if (!mermaidBlocks.length || !window.mermaid) return;

  try {
    window.mermaid.initialize({
      startOnLoad: false,
      theme: theme.includes("dark") ? "dark" : "default",
    });

    if (typeof window.mermaid.run === "function") {
      window.mermaid.run({ nodes: mermaidBlocks });
    } else if (typeof window.mermaid.init === "function") {
      window.mermaid.init(undefined, mermaidBlocks);
    }
  } catch (err) {
    console.warn("Mermaid render failed", err);
  }
}

function highlightCode(root) {
  if (!window.hljs) return;
  root.querySelectorAll("pre code").forEach((block) => {
    try {
      window.hljs.highlightElement(block);
    } catch (err) {
      console.warn("Highlight.js failed", err);
    }
  });
}

function renderMath(root) {
  if (!window.renderMathInElement) return;
  try {
    window.renderMathInElement(root, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
        { left: "\\[", right: "\\]", display: true },
      ],
      throwOnError: false,
    });
  } catch (err) {
    console.warn("KaTeX render failed", err);
  }
}

function renderFrontMatterMeta(frontMatter, requestPath) {
  const metaEl = document.getElementById("frontmatter-meta");
  if (!metaEl) return;

  metaEl.innerHTML = "";
  const pairs = [];

  if (frontMatter && frontMatter.author) {
    pairs.push({ label: "Author", value: frontMatter.author });
  }
  if (frontMatter && frontMatter.date) {
    pairs.push({ label: "Date", value: frontMatter.date });
  }
  if (frontMatter && Array.isArray(frontMatter.tags) && frontMatter.tags.length) {
    pairs.push({ label: "Tags", value: frontMatter.tags.join(", ") });
  }
  if (requestPath) {
    pairs.push({ label: "Path", value: requestPath });
  }

  if (!pairs.length) return;

  const list = document.createElement("ul");
  list.className = "meta-list";

  pairs.forEach((item) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    const value = document.createElement("span");
    label.className = "meta-label";
    value.className = "meta-value";
    label.textContent = item.label;
    value.textContent = item.value;
    li.appendChild(label);
    li.appendChild(value);
    list.appendChild(li);
  });

  metaEl.appendChild(list);
}

function populateThemeSelect(selectEl, state) {
  if (!selectEl) return;
  if (!Array.isArray(state.themes) || state.themes.length === 0) return;

  if (selectEl.options.length === 0) {
    state.themes.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      selectEl.appendChild(opt);
    });
  } else {
    // 如果已有选项但缺少新主题，补齐
    const existing = new Set(Array.from(selectEl.options).map((o) => o.value));
    state.themes.forEach((name) => {
      if (existing.has(name)) return;
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      selectEl.appendChild(opt);
    });
  }
}

function sanitizeTheme(name, state) {
  const fallback = state.theme || "anonymous-dark";
  const candidate = (name || "").trim();
  if (!candidate) return fallback;
  if (!/^[A-Za-z0-9_-]+$/.test(candidate)) return fallback;
  if (Array.isArray(state.themes) && state.themes.length && !state.themes.includes(candidate)) {
    return fallback;
  }
  return candidate;
}

function resolveInitialTheme(state) {
  try {
    const stored = window.localStorage.getItem("md-theme") || "";
    const sanitized = sanitizeTheme(stored, state);
    if (sanitized) return sanitized;
  } catch (_) {
    // 继续使用默认主题
  }
  return sanitizeTheme(state.theme, state);
}

function applyTheme(theme, state, linkEl, skipPersist) {
  const safeTheme = sanitizeTheme(theme, state);
  if (linkEl) {
    linkEl.href = `${state.assetsMount}/themes/${safeTheme}.css?v=${state.version}`;
  }
  document.documentElement.setAttribute("data-theme", safeTheme);
  if (!skipPersist) {
    try {
      window.localStorage.setItem("md-theme", safeTheme);
    } catch (_) {
      // 忽略存储失败
    }
  }

  // 主题切换后同步调整 Mermaid SVG 颜色
  restyleMermaid(document.getElementById("write"));
}

function restyleMermaid(root) {
  if (!root) return;
  const docStyle = getComputedStyle(document.documentElement);
  const bodyStyle = getComputedStyle(document.body);

  const textColor = (bodyStyle.color || "#e6e8ef").trim();
  const accent = (docStyle.getPropertyValue("--mp-accent") || bodyStyle.color || textColor).trim();
  const border = (docStyle.getPropertyValue("--mp-border") || accent || textColor).trim();
  const muted = (docStyle.getPropertyValue("--mp-muted") || accent || textColor).trim();

  root.querySelectorAll(".mermaid svg").forEach((svg) => {
    svg.querySelectorAll(".node rect, .node circle, .node polygon, .node path").forEach((el) => {
      el.setAttribute("fill", "rgba(255,255,255,0.03)");
      el.setAttribute("stroke", accent || textColor);
    });

    svg.querySelectorAll(".cluster rect").forEach((el) => {
      el.setAttribute("fill", "rgba(255,255,255,0.04)");
      el.setAttribute("stroke", border || accent);
    });

    svg.querySelectorAll(".edgePaths path").forEach((el) => {
      el.setAttribute("stroke", muted || textColor);
    });

    svg.querySelectorAll(".label, .edgeLabel, text").forEach((el) => {
      el.setAttribute("fill", textColor);
      el.setAttribute("color", textColor);
    });

    svg.querySelectorAll(".arrowheadPath").forEach((el) => {
      el.setAttribute("fill", muted || textColor);
      el.setAttribute("stroke", muted || textColor);
    });
  });
}
