/**
 * 目录列表视图生成器
 * 
 * 生成美观的文件浏览器界面，包括：
 * - 文件/文件夹图标
 * - 文件大小和修改时间
 * - 排序（目录优先，然后按名称）
 * - 面包屑导航
 */

const fs = require('fs');
const path = require('path');

/**
 * 格式化文件大小
 * 
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小字符串（如 "1.5 MB"）
 */
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 根据文件扩展名获取对应的 emoji 图标
 * 
 * @param {string} filename - 文件名
 * @returns {string} emoji 图标字符
 */
function getFileIcon(filename) {
  const ext = path.extname(filename).toLowerCase();
  const icons = {
    '.md': '📝', '.txt': '📄', '.pdf': '📕',
    '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️', '.svg': '🖼️', '.webp': '🖼️',
    '.mp4': '🎬', '.webm': '🎬', '.avi': '🎬',
    '.mp3': '🎵', '.wav': '🎵', '.flac': '🎵',
    '.zip': '📦', '.rar': '📦', '.7z': '📦',
    '.html': '🌐', '.css': '🎨', '.js': '⚡',
    '.json': '📋', '.xml': '📋',
  };
  return icons[ext] || '📄';
}

/**
 * 生成目录列表 HTML
 * 
 * @param {string} dirPath - 本地目录路径
 * @param {string} requestPath - HTTP 请求路径
 * @param {string} route - 路由前缀
 * @returns {string|null} 目录列表 HTML 或 null（读取失败）
 */
function generateDirectoryListing(dirPath, requestPath, route) {
  try {
    const files = fs.readdirSync(dirPath);
    const items = files.map(file => {
      const filePath = path.join(dirPath, file);
      try {
        const stats = fs.statSync(filePath);
        const isDir = stats.isDirectory();
        const size = isDir ? '-' : formatSize(stats.size);
        const mtime = stats.mtime.toLocaleString('zh-CN');
        const href = path.posix.join(requestPath, file) + (isDir ? '/' : '');
        const icon = isDir ? '📁' : getFileIcon(file);
        
        return { name: file, href, isDir, size, mtime, icon };
      } catch {
        return null;
      }
    }).filter(Boolean);
    
    // 目录优先，然后按名称排序
    items.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    
    const parentPath = requestPath === route ? null : path.posix.dirname(requestPath);
    
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>目录浏览 - ${requestPath}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    :root {
      --bg: #1b1b1f;
      --bg2: #282a32;
      --card: #20232c;
      --border: #464b50;
      --fg: #f5f5f5;
      --muted: #8fa5b5;
      --primary: #6fa3ef;
      --accent: #e5a545;
    }
    body {
      font-family: 'Space Grotesk', 'Segoe UI', system-ui, sans-serif;
      margin: 0; padding: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(1100px 680px at 18% 6%, rgba(111, 163, 239, 0.09), transparent),
                  radial-gradient(900px 540px at 82% 0%, rgba(229, 165, 69, 0.10), transparent),
                  linear-gradient(135deg, #1b1b1f 0%, #1f2128 55%, #171821 100%);
      color: var(--fg);
    }
    .container { max-width: 1080px; width: 95%; margin: 20px auto; background: rgba(32, 35, 44, 0.9); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.35); overflow: hidden; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
    h1 { padding: 18px 22px; margin: 0; border-bottom: 1px solid var(--border); font-size: 1.35em; word-break: break-all; letter-spacing: 0.1px; }
    .path { color: var(--muted); font-weight: 400; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px 18px; text-align: left; border-bottom: 1px solid rgba(70,75,80,0.6); }
    th { background: rgba(40,42,50,0.9); font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.82em; }
    tr:hover { background: rgba(111,163,239,0.06); }
    a { color: var(--primary); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .icon { margin-right: 10px; }
    .size, .mtime { color: var(--muted); font-size: 0.92em; }
    .parent { background: rgba(111,163,239,0.05); }
    .parent a { color: var(--fg); }
    @media (max-width: 720px) {
      .mtime { display: none; }
      th, td { padding: 10px 12px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1><span class="path">${requestPath}</span></h1>
    <table>
      <thead>
        <tr>
          <th>名称</th>
          <th>大小</th>
          <th class="mtime">修改时间</th>
        </tr>
      </thead>
      <tbody>
        ${parentPath !== null ? `<tr class="parent"><td colspan="3"><a href="${parentPath || '/'}">⬆️ 返回上级目录</a></td></tr>` : ''}
        ${items.map(item => `
        <tr>
          <td><span class="icon">${item.icon}</span><a href="${item.href}">${item.name}</a></td>
          <td class="size">${item.size}</td>
          <td class="mtime">${item.mtime}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;
    
    return html;
  } catch (err) {
    return null;
  }
}

module.exports = {
  generateDirectoryListing,
  formatSize,
  getFileIcon
};
