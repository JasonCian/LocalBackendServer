/**
 * Markdown 页面视图生成器
 * 
 * 生成 Markdown 渲染页面，包括：
 * - Marked.js 解析
 * - highlight.js 代码高亮
 * - KaTeX 数学公式
 * - 主题切换
 * - 任务列表支持
 * - 图片路径处理
 */

const path = require('path');
const { escapeHtml } = require('../utils/html-escape');

/**
 * 生成面包屑导航 HTML
 * 
 * @param {string} requestPath - HTTP 请求路径
 * @returns {string} 面包屑导航 HTML
 */
function generateBreadcrumb(requestPath) {
  const parts = requestPath.split('/').filter(Boolean);
  let html = '<a href="/">首页</a>';
  let currentPath = '';
  
  parts.forEach((part, index) => {
    currentPath += '/' + part;
    if (index === parts.length - 1) {
      html += ' / ' + part;
    } else {
      html += ' / <a href="' + currentPath + '/">' + part + '</a>';
    }
  });
  
  return html;
}

/**
 * 生成 Markdown 渲染页面 HTML
 * 
 * @param {string} title - 页面标题
 * @param {string} content - Markdown 原始内容
 * @param {string} requestPath - HTTP 请求路径
 * @param {string} theme - 主题名称
 * @param {Array} availableThemes - 可用主题列表
 * @returns {string} 完整的 HTML 页面
 */
function generateMarkdownPage(title, content, requestPath, theme, availableThemes = ['anonymous-dark', 'anonymous-light']) {
  let themeCss = theme || 'anonymous-dark';
  // 移除 .css 后缀（如果存在），确保统一处理
  themeCss = themeCss.replace(/\.css$/i, '');
  
  // 判断是否为暗色主题
  const isDarkTheme = themeCss.includes('dark') || themeCss === 'night';
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <!-- Marked.js - Markdown 解析库 -->
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <!-- highlight.js - 代码高亮 -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github${isDarkTheme ? '-dark' : ''}.min.css">
  <script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"></script>
  <!-- KaTeX - 数学公式渲染 -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
  <!-- 主题样式 -->
  <link rel="stylesheet" href="/themes/${themeCss}.css">
  <style>
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; padding: 0; }
    body { display: flex; flex-direction: column; background: var(--anonymous-bg-primary, ${isDarkTheme ? '#1e1e1e' : '#fff'}); color: var(--anonymous-text-primary, ${isDarkTheme ? '#c5c8c6' : '#333'}); }
    
    /* 顶部导航栏 */
    .navbar {
      background: var(--anonymous-bg-secondary, ${isDarkTheme ? '#252525' : '#f8f9fa'});
      border-bottom: 1px solid var(--anonymous-border-default, ${isDarkTheme ? '#3d3d3d' : '#e9ecef'});
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .navbar-left {
      display: flex;
      align-items: center;
      gap: 15px;
      flex-wrap: wrap;
    }
    .navbar a {
      color: var(--anonymous-primary, ${isDarkTheme ? '#6db3f2' : '#495057'});
      text-decoration: none;
      font-size: 14px;
    }
    .navbar a:hover { text-decoration: underline; }
    .breadcrumb {
      font-size: 14px;
      color: var(--anonymous-text-muted, ${isDarkTheme ? '#888' : '#6c757d'});
      word-break: break-all;
    }
    .breadcrumb a {
      color: var(--anonymous-primary, ${isDarkTheme ? '#6db3f2' : '#007bff'});
    }
    
    /* 主题选择器 */
    .theme-selector {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .theme-selector label {
      font-size: 13px;
      color: var(--anonymous-text-muted, ${isDarkTheme ? '#888' : '#6c757d'});
    }
    .theme-selector select {
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--anonymous-border-default, ${isDarkTheme ? '#444' : '#ced4da'});
      background: var(--anonymous-bg-secondary, ${isDarkTheme ? '#333' : '#fff'});
      color: var(--anonymous-text-primary, ${isDarkTheme ? '#ccc' : '#495057'});
      font-size: 13px;
      cursor: pointer;
    }
    
    /* 内容区域 */
    .content-wrapper {
      flex: 1;
      overflow: auto;
      background: var(--anonymous-bg-primary, ${isDarkTheme ? '#1e1e1e' : '#fff'});
    }
    
    /* 原始 Markdown 隐藏 */
    #raw-content { display: none; }
    
    /* 加载提示 */
    .loading {
      text-align: center;
      padding: 50px;
      color: var(--anonymous-text-muted, #999);
    }
    
    /* 返回顶部按钮 */
    .back-to-top {
      position: fixed;
      bottom: 30px;
      right: 30px;
      width: 40px;
      height: 40px;
      background: var(--anonymous-primary, ${isDarkTheme ? '#333' : '#007bff'});
      color: white;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 18px;
      opacity: 0;
      transition: opacity 0.3s;
      z-index: 1000;
    }
    .back-to-top.visible { opacity: 0.8; }
    .back-to-top:hover { opacity: 1; }
    
    /* 打印时隐藏导航 */
    @media print {
      .navbar, .back-to-top { display: none; }
      .content-wrapper { overflow: visible; }
    }
  </style>
</head>
<body>
  <nav class="navbar">
    <div class="navbar-left">
      <a href="javascript:history.back()">← 返回</a>
      <span class="breadcrumb">${generateBreadcrumb(requestPath)}</span>
    </div>
    <div class="theme-selector">
      <label for="theme-select">主题：</label>
      <select id="theme-select" onchange="changeTheme(this.value)">
        ${availableThemes.map(t => `<option value="${t}" ${t === themeCss ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
      </select>
    </div>
  </nav>
  
  <div class="content-wrapper">
    <div id="write" class="loading">正在加载...</div>
  </div>
  
  <pre id="raw-content">${escapeHtml(content)}</pre>
  
  <button class="back-to-top" onclick="scrollToTop()">↑</button>
  
  <script>
    // 配置 marked
    marked.setOptions({
      highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch (e) {}
        }
        return hljs.highlightAuto(code).value;
      },
      breaks: true,
      gfm: true
    });
    
    // 渲染 Markdown
    const rawContent = document.getElementById('raw-content').textContent;
    const writeDiv = document.getElementById('write');
    writeDiv.innerHTML = marked.parse(rawContent);
    writeDiv.classList.remove('loading');
    
    // 渲染数学公式
    renderMathInElement(writeDiv, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false},
        {left: '\\\\[', right: '\\\\]', display: true},
        {left: '\\\\(', right: '\\\\)', display: false}
      ],
      throwOnError: false
    });
    
    // 任务列表支持
    writeDiv.querySelectorAll('li').forEach(li => {
      const text = li.innerHTML;
      if (text.startsWith('[ ] ') || text.startsWith('[x] ') || text.startsWith('[X] ')) {
        const checked = text.startsWith('[x] ') || text.startsWith('[X] ');
        li.innerHTML = '<input type="checkbox" disabled ' + (checked ? 'checked' : '') + '>' + text.substring(4);
        li.classList.add('task-list-item');
      }
    });
    
    // 图片路径处理 - 使相对路径正确解析
    const basePath = '${path.posix.dirname(requestPath)}/';
    writeDiv.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('/') && !src.startsWith('data:')) {
        img.src = basePath + src;
      }
    });
    
    // 链接处理 - Markdown 文件链接
    writeDiv.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href');
      if (href && href.endsWith('.md') && !href.startsWith('http')) {
        // 保持 .md 链接，服务器会渲染它们
      }
    });
    
    // 主题切换
    function changeTheme(theme) {
      const url = new URL(window.location.href);
      url.searchParams.set('theme', theme);
      window.location.href = url.toString();
    }
    
    // 返回顶部
    const backToTop = document.querySelector('.back-to-top');
    const contentWrapper = document.querySelector('.content-wrapper');
    
    contentWrapper.addEventListener('scroll', function() {
      if (this.scrollTop > 300) {
        backToTop.classList.add('visible');
      } else {
        backToTop.classList.remove('visible');
      }
    });
    
    function scrollToTop() {
      contentWrapper.scrollTo({ top: 0, behavior: 'smooth' });
    }
  </script>
</body>
</html>`;
}

module.exports = {
  generateMarkdownPage,
  generateBreadcrumb
};
