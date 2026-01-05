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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      /* Anonymous palette */
      --bg: #1b1b1f;
      --bg-2: #282a32;
      --card: #20232c;
      --card-border: #464b50;
      --fg: #f5f5f5;
      --muted: #8fa5b5;
      --primary: #6fa3ef;
      --accent: #e5a545;
      --glow: 0 24px 90px rgba(111, 163, 239, 0.22);
      --radius: 16px;
    }
    body {
      font-family: 'Space Grotesk', 'Segoe UI', system-ui, sans-serif;
      background: radial-gradient(1200px 820px at 16% 8%, rgba(111, 163, 239, 0.08), transparent),
          radial-gradient(940px 620px at 84% 4%, rgba(229, 165, 69, 0.12), transparent),
          linear-gradient(135deg, #1b1b1f 0%, #1f2128 55%, #171821 100%);
      color: var(--fg);
      min-height: 100vh;
      padding: 36px 20px 48px;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    .hero {
      display: grid;
      gap: 16px;
      padding: 20px 24px;
      background: linear-gradient(145deg, rgba(125, 224, 255, 0.12), rgba(122, 92, 255, 0.08));
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      box-shadow: var(--glow);
    }
    .hero-title { font-size: 2.4em; letter-spacing: 0.2px; }
    .hero-sub { color: var(--muted); font-size: 1.02em; }
    .hero-tags { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
    .tag {
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--card-border);
      background: rgba(255, 255, 255, 0.04);
      color: var(--fg);
      font-size: 0.9em;
    }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 20px; }
    .card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      overflow: hidden;
      backdrop-filter: blur(6px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.25);
    }
    .card-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid var(--card-border); }
    .card-header h2 { font-size: 1.05em; letter-spacing: 0.2px; }
    .pill { padding: 6px 10px; border-radius: 10px; background: rgba(125, 224, 255, 0.12); color: var(--primary); font-size: 0.9em; }
    .card-body { padding: 10px 0; }
    .dir-list { list-style: none; }
    .dir-item { border-bottom: 1px solid var(--card-border); }
    .dir-item:last-child { border-bottom: none; }
    .dir-link { display: flex; align-items: center; gap: 12px; padding: 14px 18px; text-decoration: none; color: var(--fg); transition: background 0.2s ease, transform 0.1s ease; }
    .dir-link:hover { background: rgba(125, 224, 255, 0.06); transform: translateY(-1px); }
    .dir-icon { width: 40px; height: 40px; border-radius: 10px; background: rgba(143, 165, 181, 0.15); display: grid; place-items: center; font-size: 1.3em; }
    .dir-info { flex: 1; }
    .dir-route { font-weight: 600; letter-spacing: 0.1px; }
    .dir-path { margin-top: 2px; font-size: 0.85em; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .dir-arrow { color: var(--muted); font-size: 0.95em; }
    .stack { display: grid; gap: 14px; padding: 14px 18px 18px; }
    .info-card { background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 12px; padding: 14px 16px; }
    .info-card h3 { font-size: 0.98em; margin-bottom: 8px; }
    .info-card ul { list-style: none; color: var(--muted); line-height: 1.7; }
    .info-card code { background: rgba(255,255,255,0.06); border: 1px solid var(--card-border); color: var(--fg); padding: 2px 6px; border-radius: 6px; font-size: 0.95em; }
    .info-card a { color: var(--primary); text-decoration: none; }
    .info-card a:hover { text-decoration: underline; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 960px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="container">
    <section class="hero">
      <div class="hero-title">${projectName}</div>
      <div class="hero-sub">文件服务 · Markdown 渲染 · 上传/删除 · 自动化挂载 · 纯 Node Core</div>
      <div class="hero-tags">
        <span class="tag">Dark / High-contrast</span>
        <span class="tag">CDN Frontend</span>
        <span class="tag">No Framework</span>
        <span class="tag">Config-driven</span>
      </div>
    </section>

    <div class="grid">
      <div class="card">
        <div class="card-header">
          <h2>📂 目录映射</h2>
          ${config.markdown && config.markdown.enabled ? '<span class="pill">Markdown 渲染启用</span>' : ''}
        </div>
        <div class="card-body">
          <ul class="dir-list">
            ${directories.map(dir => `
            <li class="dir-item">
              <a href="${dir.route}${dir.route.endsWith('/') ? '' : '/'}" class="dir-link">
                <span class="dir-icon">↗</span>
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

      <div class="card">
        <div class="card-header">
          <h2>🔌 服务挂载</h2>
        </div>
        <div class="card-body">
          <ul class="dir-list">
            ${config.services && config.services.telegram && config.services.telegram.enabled ? `
            <li class="dir-item">
              <a href="${config.services.telegram.mount || '/telegram'}" class="dir-link">
                <span class="dir-icon">📱</span>
                <div class="dir-info">
                  <div class="dir-route">${config.services.telegram.mount || '/telegram'}</div>
                  <div class="dir-path">Telegram 多账号 / 自动任务</div>
                </div>
                <span class="dir-arrow">→</span>
              </a>
            </li>
            ` : ''}
            ${config.services && config.services.powershellHistory && config.services.powershellHistory.enabled ? `
            <li class="dir-item">
              <a href="${config.services.powershellHistory.mount || '/powershell'}" class="dir-link">
                <span class="dir-icon">💻</span>
                <div class="dir-info">
                  <div class="dir-route">${config.services.powershellHistory.mount || '/powershell'}</div>
                  <div class="dir-path">PowerShell 历史记录与快捷指令</div>
                </div>
                <span class="dir-arrow">→</span>
              </a>
            </li>
            ` : ''}
            ${(!config.services?.telegram?.enabled && !config.services?.powershellHistory?.enabled) ? '<li class="dir-item"><div style="padding: 14px 18px; color: var(--muted);">暂无启用的服务</div></li>' : ''}
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
