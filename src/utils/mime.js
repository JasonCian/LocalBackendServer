/**
 * MIME 类型工具模块
 * 
 * 提供文件扩展名到 MIME 类型的映射功能
 * 支持常见的 Web 资源类型：HTML、CSS、JS、图片、视频、音频、字体等
 */

const path = require('path');

/**
 * MIME 类型映射表
 * 键：文件扩展名（含点号）
 * 值：对应的 MIME 类型字符串
 */
const mimeTypes = {
  // 文本和标记语言
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  
  // 图片格式
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  
  // 视频格式
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  
  // 音频格式
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  
  // 文档和压缩包
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  
  // 字体文件
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

/**
 * 根据文件路径获取对应的 MIME 类型
 * 
 * @param {string} filePath - 文件路径或文件名
 * @returns {string} MIME 类型字符串，未知类型返回 'application/octet-stream'
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

module.exports = {
  getMimeType,
  mimeTypes
};
