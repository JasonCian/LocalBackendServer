"use strict";

const fs = require("fs");
const path = require("path");
const { escapeHtml } = require("../../utils/html-escape");

/**
 * Bump this when the template/runtime changes so cached pages invalidate.
 */
const MARKDOWN_PAGE_VERSION = "2026.01.09";

const DEFAULT_THEME = "anonymous-dark";
let cachedThemes = null;
// 使用无 Markdown 特殊符号的标记，避免被 markdown-it 解析为粗体/斜体
const TOC_MARKER = "MD-T0C-T0KEN";

/**
 * Remove YAML front matter and return the remaining body plus parsed fields.
 * Only shallow key/value pairs and simple dash arrays are parsed to avoid
 * pulling in a YAML dependency.
 */
function stripFrontMatter(markdown = "") {
	const frontMatterRegex = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/;
	const match = markdown.match(frontMatterRegex);

	if (!match) {
		return { body: markdown, frontMatter: {}, rawFrontMatter: "" };
	}

	const rawBlock = match[1] || "";
	const frontMatter = {};
	let currentKey = null;

	rawBlock.split(/\r?\n/).forEach((line) => {
		const trimmed = line.trim();
		if (!trimmed) return;

		const keyMatch = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
		if (keyMatch) {
			currentKey = keyMatch[1];
			const value = keyMatch[2];
			if (value === "") {
				frontMatter[currentKey] = [];
			} else {
				frontMatter[currentKey] = value.trim();
				currentKey = null;
			}
			return;
		}

		if (currentKey && Array.isArray(frontMatter[currentKey])) {
			const item = trimmed.replace(/^[-\s]+/, "").trim();
			if (item) {
				frontMatter[currentKey].push(item);
			}
		}
	});

	const body = markdown.replace(frontMatterRegex, "");
	return { body, frontMatter, rawFrontMatter: rawBlock };
}

function normalizeAssetsMount(mount) {
	if (!mount || typeof mount !== "string") return "/public";
	let normalized = mount.trim();
	if (!normalized.startsWith("/")) normalized = `/${normalized}`;
	if (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
	return normalized || "/public";
}

function sanitizeThemeName(theme, list) {
	const candidate = (theme || "").toString().trim();
	if (!/^[A-Za-z0-9_-]+$/.test(candidate)) return DEFAULT_THEME;
	if (Array.isArray(list) && list.length > 0 && !list.includes(candidate)) {
		return DEFAULT_THEME;
	}
	return candidate;
}
function loadThemeList() {
	if (Array.isArray(cachedThemes) && cachedThemes.length) return cachedThemes;

	const themesDir = path.resolve(__dirname, "../../../public/themes");
	try {
		const files = fs.readdirSync(themesDir, { withFileTypes: true });
		const themes = files
			.filter((dirent) => dirent.isFile() && dirent.name.endsWith(".css"))
			.map((dirent) => dirent.name.replace(/\.css$/i, ""))
			.filter((name) => /^[A-Za-z0-9_-]+$/.test(name));

		cachedThemes = themes.length ? themes : [DEFAULT_THEME];
	} catch (_) {
		cachedThemes = [DEFAULT_THEME];
	}

	return cachedThemes;
}


function encodeBase64Utf8(text) {
	return Buffer.from(text || "", "utf8").toString("base64");
}

/**
 * Build HTML for a markdown document. Rendering is deferred to the browser
 * using markdown-it + plugins so we do not pull markdown dependencies into
 * the server. Assets are loaded from the configured mount (default /public).
 *
 * @param {string} title - Document title fallback when front matter is empty
 * @param {string} markdownContent - Raw markdown content
 * @param {string} requestPath - Request path for display/back links
 * @param {string} theme - Theme name under public/themes (Typora-compatible)
 * @param {string} highlightTheme - Reserved for future highlight theme switch
 * @param {string} assetsMount - Static assets mount (default /public)
 * @returns {string} Full HTML page string
 */
function generateMarkdownPage(
	title,
	markdownContent,
	requestPath,
	theme = DEFAULT_THEME,
	highlightTheme,
	assetsMount = "/public"
) {
	const themeList = loadThemeList();
	const { body, frontMatter } = stripFrontMatter(markdownContent || "");
	const safeTheme = sanitizeThemeName(theme, themeList);
	const mount = normalizeAssetsMount(assetsMount);
	const filePathLabel = requestPath || "/";
	const preferredTitle =
		(frontMatter && frontMatter.title) || title || "Markdown Document";

	const payload = {
		version: MARKDOWN_PAGE_VERSION,
		title: preferredTitle,
		requestPath: filePathLabel,
		theme: safeTheme,
		themes: themeList,
		assetsMount: mount,
		tocMarker: TOC_MARKER,
		frontMatter,
		markdownBase64: encodeBase64Utf8(body.replace(/\[toc\]/gi, TOC_MARKER)),
		highlightTheme: highlightTheme || null
	};

	const contextJson = JSON.stringify(payload).replace(/<\/(script)/gi, "<\\/$1");

	return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${escapeHtml(safeTheme)}">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="X-UA-Compatible" content="IE=edge" />
	<meta name="generator" content="LocalBackendServer markdown-page ${MARKDOWN_PAGE_VERSION}" />
	<meta name="markdown-source" content="${escapeHtml(filePathLabel)}" />
	<title>${escapeHtml(preferredTitle)} - Markdown Preview</title>
	<link rel="stylesheet" href="${mount}/markdown-page.css?v=${MARKDOWN_PAGE_VERSION}" />
	<link id="theme-stylesheet" rel="stylesheet" href="${mount}/themes/${safeTheme}.css?v=${MARKDOWN_PAGE_VERSION}" />
	<link rel="stylesheet" href="${mount}/vendor/katex.min.css" />
</head>
<body class="typora-export">
	<div class="page-shell">
		<header class="page-header">
			<div class="file-info">
				<div class="file-title" id="page-title">${escapeHtml(preferredTitle)}</div>
				<div class="file-path">${escapeHtml(filePathLabel)}</div>
			</div>
			<div class="file-meta" id="frontmatter-meta"></div>
			<nav class="header-actions" aria-label="页面操作">
				<label class="theme-switch" for="theme-switcher">主题</label>
				<select id="theme-switcher" class="theme-select" aria-label="切换主题">
					${(themeList || [safeTheme]).map((t) => `<option value="${t}"${t === safeTheme ? " selected" : ""}>${t}</option>`).join("")}
				</select>
				<a class="action-link" href="${escapeHtml(filePathLabel)}?raw=1">RAW</a>
			</nav>
		</header>
		<main class="content-wrapper">
			<article id="write" class="typora-export"></article>
		</main>
	</div>

	<script>window.__MARKDOWN_PAGE_CONTEXT__ = ${contextJson};</script>
	<script src="${mount}/vendor/markdown-it/markdown-it.min.js"></script>
	<script src="${mount}/vendor/markdown-it/markdown-it-footnote.min.js"></script>
	<script src="${mount}/vendor/markdown-it/markdown-it-sub.min.js"></script>
	<script src="${mount}/vendor/markdown-it/markdown-it-sup.min.js"></script>
	<script src="${mount}/vendor/markdown-it/markdown-it-mark.min.js"></script>
	<script src="${mount}/vendor/markdown-it/markdown-it-task-lists.min.js"></script>
	<script src="${mount}/vendor/highlight.min.js"></script>
	<script src="${mount}/vendor/mermaid.min.js"></script>
	<script src="${mount}/vendor/katex.min.js"></script>
	<script src="${mount}/vendor/auto-render.min.js"></script>
	<script src="${mount}/js/markdown-page-runtime.js?v=${MARKDOWN_PAGE_VERSION}"></script>
</body>
</html>`;
}

module.exports = {
	generateMarkdownPage,
	MARKDOWN_PAGE_VERSION,
	stripFrontMatter
};
