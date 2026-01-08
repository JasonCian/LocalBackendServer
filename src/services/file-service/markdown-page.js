/**
 * Markdown 页面视图生成器
 * 
 * 生成 Markdown 渲染页面，集成：
 * - Marked.js (GFM) - Markdown 解析
 * - highlight.js - 代码语法高亮
 * - KaTeX - LaTeX 数学公式
 * - Mermaid - 流程图/时序图
 * - Anonymous Theme - 完整主题样式系统
 * 
 * 设计原则：
 * - 最小化内联样式，依赖主题 CSS
 * - 保持 HTML 结构简洁
 * - JavaScript 仅处理必要的客户端渲染
 */

const path = require('path');
const { escapeHtml } = require('../../utils/html-escape');

/**
 * 生成面包屑导航 HTML
 * 
 * @param {string} requestPath - HTTP 请求路径
 * @returns {string} 面包屑导航 HTML
 */
function generateBreadcrumb(requestPath) {
  const parts = requestPath.split('/').filter(Boolean);
  let html = '<a href="/file">文件服务</a>';
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
 * @param {string} theme - 主题名称 (anonymous-dark/anonymous-light)
 * @param {Array} availableThemes - 可用主题列表
 * @returns {string} 完整的 HTML 页面
 */
function generateMarkdownPage(title, content, requestPath, theme, availableThemes = ['anonymous-dark', 'anonymous-light'], assetsMount = '/public') {
  // 规范化主题名称
  let themeCss = theme || 'anonymous-dark';
  themeCss = themeCss.replace(/\.css$/i, '');
  
  // 判断是否为暗色主题（用于 highlight.js 和 Mermaid 主题）
  const isDarkTheme = themeCss.includes('dark') || themeCss === 'night';
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  
  <!-- Marked.js v11+ - GFM Markdown 解析 -->
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  
  <!-- highlight.js v11.9.0 - 代码语法高亮 -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github${isDarkTheme ? '-dark' : ''}.min.css">
  <script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"></script>
  
  <!-- KaTeX v0.16.9 - LaTeX 数学公式渲染 -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
  
  <!-- Mermaid v10 - 流程图/时序图/甘特图 -->
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  
  <!-- Anonymous Theme - 完整主题样式系统 -->
  <link rel="stylesheet" href="${assetsMount}/themes/${themeCss}.css">
  
  <style>
    /* ==========================================================================
     * 最小化样式覆盖 - Minimal Style Overrides
     * 主要样式由 Anonymous 主题提供
     * ========================================================================== */
    
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; padding: 0; }
    
    body {
      display: flex;
      flex-direction: column;
      background: var(--anonymous-bg-primary);
      color: var(--anonymous-text-primary);
    }
    
    /* 顶部导航栏 */
    .navbar {
      background: var(--anonymous-bg-secondary);
      border-bottom: 1px solid var(--anonymous-border-default);
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      backdrop-filter: blur(8px);
      flex-shrink: 0;
    }
    
    .navbar-left {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    
    .navbar a {
      color: var(--anonymous-primary);
      text-decoration: none;
      font-size: 14px;
    }
    
    .navbar a:hover {
      color: var(--anonymous-primary-hover);
      text-decoration: underline;
    }
    
    .breadcrumb {
      font-size: 14px;
      color: var(--anonymous-text-muted);
    }
    
    .breadcrumb a {
      color: var(--anonymous-primary);
    }
    
    /* 主题选择器 */
    .theme-selector {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .theme-selector label {
      font-size: 13px;
      color: var(--anonymous-text-muted);
    }
    
    .theme-selector select {
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid var(--anonymous-border-default);
      background: var(--anonymous-bg-primary);
      color: var(--anonymous-text-primary);
      font-size: 13px;
      cursor: pointer;
    }
    
    /* 内容区域 - 让主题接管 #write 样式 */
    .content-wrapper {
      flex: 1;
      overflow: auto;
      padding: 24px 16px 32px;
    }
    
    /* 加载提示 */
    #write.loading {
      text-align: center;
      padding: 50px;
      color: var(--anonymous-text-muted);
    }
    
    /* 原始内容隐藏 */
    #raw-content {
      display: none;
    }
    
    /* 返回顶部按钮 */
    .back-to-top {
      position: fixed;
      bottom: 30px;
      right: 30px;
      width: 42px;
      height: 42px;
      background: var(--anonymous-primary);
      color: white;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 18px;
      opacity: 0;
      transition: opacity 0.3s;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    
    .back-to-top.visible {
      opacity: 0.8;
    }
    
    .back-to-top:hover {
      opacity: 1;
      background: var(--anonymous-primary-hover);
    }
    
    /* 打印时隐藏导航 */
    @media print {
      .navbar, .back-to-top {
        display: none;
      }
      .content-wrapper {
        overflow: visible;
      }
    }
  </style>
</head>
<body>
  <!-- 顶部导航栏 -->
  <nav class="navbar">
    <div class="navbar-left">
      <a href="javascript:history.back()">← 返回</a>
      <span class="breadcrumb">${generateBreadcrumb(requestPath)}</span>
    </div>
    <div class="theme-selector">
      <label for="theme-select">主题：</label>
      <select id="theme-select" onchange="changeTheme(this.value)">
        ${availableThemes.map(t => {
          const displayName = t.replace('anonymous-', '').replace(/^./, c => c.toUpperCase());
          return `<option value="${t}" ${t === themeCss ? 'selected' : ''}>${displayName}</option>`;
        }).join('')}
      </select>
    </div>
  </nav>
  
  <!-- 内容渲染区域 - 使用 #write 以匹配 Anonymous 主题 -->
  <div class="content-wrapper">
    <div id="write" class="loading">正在加载 Markdown 内容...</div>
  </div>
  
  <!-- 原始 Markdown 内容（隐藏） -->
  <pre id="raw-content">${escapeHtml(content)}</pre>
  
  <!-- 返回顶部按钮 -->
  <button class="back-to-top" onclick="window.scrollTo({top: 0, behavior: 'smooth'})">↑</button>
  
  <script>
    // =========================================================================
    // Markdown 渲染脚本
    // =========================================================================
    
    (function() {
      try {
        // ---------------------------------------------------------------------
        // 1. 初始化库配置
        // ---------------------------------------------------------------------
        
        // Mermaid 初始化
        mermaid.initialize({
          startOnLoad: false,
          theme: '${isDarkTheme ? 'dark' : 'default'}',
          securityLevel: 'loose',
          fontFamily: 'var(--anonymous-font-family)'
        });
        
        // Marked.js 配置 - GFM 模式，允许 HTML
        marked.setOptions({
          gfm: true,
          breaks: true,
          headerIds: true,
          mangle: false,
          highlight: function(code, lang) {
            if (lang && hljs.getLanguage(lang)) {
              try {
                return hljs.highlight(code, { language: lang }).value;
              } catch (e) {
                console.warn('代码高亮失败:', e);
              }
            }
            return hljs.highlightAuto(code).value;
          }
        });
        
        // ---------------------------------------------------------------------
        // 2. 获取原始内容并预处理
        // ---------------------------------------------------------------------
        
        const rawContent = document.getElementById('raw-content').textContent;
        
        // ---------------------------------------------------------------------
        // 3. 使用 Marked 渲染为 HTML
        // ---------------------------------------------------------------------
        
        const writeDiv = document.getElementById('write');
        writeDiv.innerHTML = marked.parse(rawContent);
        writeDiv.classList.remove('loading');
        
        // ---------------------------------------------------------------------
        // 4. 后处理增强
        // ---------------------------------------------------------------------
        
        // KaTeX 数学公式渲染
        renderMathInElement(writeDiv, {
          delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false},
            {left: '\\\\[', right: '\\\\]', display: true},
            {left: '\\\\(', right: '\\\\)', display: false}
          ],
          throwOnError: false
        });
        
        // 任务列表增强（GFM 已支持，此处添加额外样式）
        writeDiv.querySelectorAll('li').forEach(li => {
          const firstChild = li.firstChild;
          if (firstChild && firstChild.nodeName === 'INPUT' && firstChild.type === 'checkbox') {
            li.classList.add('task-list-item');
          }
        });
        
        // Mermaid 图表渲染
        const mermaidBlocks = writeDiv.querySelectorAll('pre code.language-mermaid');
        mermaidBlocks.forEach((block, index) => {
          const code = block.textContent;
          const container = document.createElement('div');
          container.className = 'mermaid';
          container.textContent = code;
          block.parentElement.replaceWith(container);
        });
        
        // 执行 Mermaid 渲染
        if (mermaidBlocks.length > 0) {
          mermaid.run();
        }
        
        // 图片相对路径处理
        const basePath = '${path.posix.dirname(requestPath)}/';
        writeDiv.querySelectorAll('img').forEach(img => {
          const src = img.getAttribute('src');
          if (src && !src.startsWith('http') && !src.startsWith('/') && !src.startsWith('data:')) {
            img.src = basePath + src;
          }
        });
        
        // ---------------------------------------------------------------------
        // 5. 返回顶部按钮交互
        // ---------------------------------------------------------------------
        
        const backToTopBtn = document.querySelector('.back-to-top');
        window.addEventListener('scroll', function() {
          if (window.scrollY > 300) {
            backToTopBtn.classList.add('visible');
          } else {
            backToTopBtn.classList.remove('visible');
          }
        });
        
      } catch (error) {
        console.error('Markdown 渲染错误:', error);
        const writeDiv = document.getElementById('write');
        writeDiv.classList.remove('loading');
        writeDiv.innerHTML = \`
          <div style="padding: 40px; text-align: center; color: var(--anonymous-danger);">
            <h2>❌ 渲染失败</h2>
            <p>Markdown 内容渲染时发生错误，请检查浏览器控制台获取详细信息。</p>
            <pre style="text-align: left; background: var(--anonymous-bg-secondary); padding: 16px; border-radius: 8px; overflow: auto;">\${error.stack || error.message}</pre>
          </div>
        \`;
      }
    })();
    
    // =========================================================================
    // 主题切换函数
    // =========================================================================
    
    function changeTheme(theme) {
      const url = new URL(window.location.href);
      url.searchParams.set('theme', theme);
      window.location.href = url.toString();
    }
  </script>
</body>
</html>`;
}

module.exports = {
  generateMarkdownPage,
  generateBreadcrumb
};


