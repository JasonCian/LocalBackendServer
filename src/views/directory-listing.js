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
  <style>
    * { box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0; padding: 20px; background: #f5f5f5; color: #333;
    }
    .container { max-width: 1000px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { padding: 20px; margin: 0; border-bottom: 1px solid #eee; font-size: 1.5em; word-break: break-all; }
    .path { color: #666; font-weight: normal; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px 20px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #fafafa; font-weight: 600; color: #666; }
    tr:hover { background: #f8f9fa; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .icon { margin-right: 8px; }
    .size, .mtime { color: #888; font-size: 0.9em; }
    .parent { background: #fafafa; }
    .parent a { color: #666; }
    @media (max-width: 600px) {
      .mtime { display: none; }
      th, td { padding: 10px; }
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
