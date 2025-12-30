/**
 * 首页视图生成器
 * 
 * 生成服务器首页 HTML，展示：
 * - 目录映射列表
 * - 服务挂载点
 * - 核心功能介绍
 * - 配置说明
 */

const path = require('path');

/**
 * 生成首页 HTML（列出所有映射目录和服务）
 * 
 * @param {Object} config - 服务器配置对象
 * @returns {string} 首页 HTML 字符串
 */
function generateHomePage(config) {
  const directories = config.directories || [];
  const projectName = (config.projectName && String(config.projectName).trim()) || '本地轻量级后端（开发者自用）';
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f1220; --bg2: #101526; --fg: #e6e9ef; --muted: #9aa0aa;
      --primary: #6aa0ff; --accent: #7a5cff; --card: #141a2f; --border: #1f2740;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: radial-gradient(1200px 600px at 20% 0%, #0a0d1a, #0f1220); color: var(--fg); min-height: 100vh; padding: 40px 20px; }
    .container { max-width: 960px; margin: 0 auto; }
    .header { margin-bottom: 28px; }
    .header h1 { font-size: 2.2em; letter-spacing: 0.4px; }
    .header p { margin-top: 8px; color: var(--muted); }
    .grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
    .card-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); }
    .card-header h2 { font-size: 1.1em; color: var(--fg); }
    .badge { color: #7fd77f; font-size: 0.85em; }
    .card-body { padding: 6px 0; }
    .dir-list { list-style: none; }
    .dir-item { border-bottom: 1px solid var(--border); }
    .dir-item:last-child { border-bottom: none; }
    .dir-link { display: flex; align-items: center; gap: 12px; padding: 14px 18px; text-decoration: none; color: var(--fg); }
    .dir-link:hover { background: rgba(122, 92, 255, 0.08); }
    .dir-icon { width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(135deg, var(--primary), var(--accent)); display: grid; place-items: center; font-size: 1.2em; }
    .dir-info { flex: 1; }
    .dir-route { font-weight: 600; }
    .dir-path { margin-top: 2px; font-size: 0.85em; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .dir-arrow { color: var(--muted); }

    .info-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; }
    .info-card h3 { font-size: 1em; margin-bottom: 10px; color: var(--fg); }
    .info-card ul { list-style: none; color: var(--muted); line-height: 1.8; }
    .info-card code { background: #0d1224; border: 1px solid var(--border); color: var(--fg); padding: 2px 6px; border-radius: 4px; }
    .info-card a { color: var(--fg); text-decoration: underline; }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }
    @media (max-width: 720px) { .cols { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛠️ ${projectName}</h1>
      <p>文件服务 · Markdown 渲染 · 上传/删除 · 可扩展模块</p>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-header">
          <h2>📂 目录映射</h2>
          ${config.markdown && config.markdown.enabled ? '<span class="badge">Markdown 渲染启用</span>' : ''}
        </div>
        <div class="card-body">
          <ul class="dir-list">
            ${directories.map(dir => `
            <li class="dir-item">
              <a href="${dir.route}${dir.route.endsWith('/') ? '' : '/'}" class="dir-link">
                <span class="dir-icon">📁</span>
                <div class="dir-info">
                  <div class="dir-route">${dir.route}</div>
                  <div class="dir-path">${dir.path}</div>
                </div>
                <span class="dir-arrow">→</span>
              </a>
            </li>
            `).join('')}
          </ul>
        </div>
      </div>

      <div class="cols">
        <div class="info-card">
          <h3>🔌 服务挂载</h3>
          <ul>
            <li>• <a href="/telegram">/telegram</a> — Telegram（自动签到）</li>
          </ul>
        </div>
        <div class="info-card">
          <h3>核心能力</h3>
          <ul>
            <li>• 静态文件与目录浏览（尾斜杠自动重定向、<code>index.html</code> 优先）</li>
            <li>• Markdown 预览（Marked + highlight.js + KaTeX、支持 <code>?theme</code>/<code>?raw=1</code>）</li>
            <li>• 上传与删除 API：<code>POST /upload</code>、<code>POST /delete</code>（PicList 兼容）</li>
            <li>• CORS 支持与简易日志（见 <code>logs/service.log</code>）</li>
            <li>• Windows 服务模式（NSSM 安装/卸载脚本）</li>
          </ul>
        </div>
        <div class="info-card">
          <h3>配置与扩展</h3>
          <ul>
            <li>• 编辑 <code>config.json</code>：<code>host</code>/<code>port</code>、<code>directories</code>、<code>uploadDir</code>、<code>markdown</code></li>
            <li>• 主题：在 <code>public/css</code> 添加样式并更新主题下拉</li>
            <li>• 约束：不引入 Express/Koa 或本地 npm 依赖，使用核心模块与 CDN</li>
            <li>• 未来扩展：可挂接任务/脚本/消息模块（保持路由与服务边界清晰）</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  generateHomePage
};
