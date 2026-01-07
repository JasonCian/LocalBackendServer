/**
 * 文件服务路由处理器
 * 
 * 处理静态文件服务、目录浏览和 Markdown 渲染
 */

const fs = require('fs');
const path = require('path');
const url = require('url');
const { getMimeType } = require('../utils/mime');
const { generateDirectoryListing } = require('../services/file-service/directory-listing');
const { generateMarkdownPage } = require('../services/file-service/markdown-page');

/**
 * 提供原始文件
 * 
 * @param {string} filePath - 文件路径
 * @param {http.ServerResponse} res - 响应对象
 * @param {string} mimeType - MIME 类型
 */
function serveRawFile(filePath, res, mimeType) {
  const stat = fs.statSync(filePath);
  
  res.writeHead(200, {
    'Content-Type': mimeType,
    'Content-Length': stat.size,
    'Cache-Control': 'public, max-age=3600'
  });
  
  fs.createReadStream(filePath).pipe(res);
}

/**
 * 提供文件（支持 Markdown 渲染）
 * 
 * @param {string} filePath - 文件路径
 * @param {http.ServerResponse} res - 响应对象
 * @param {string} requestPath - 请求路径
 * @param {string} queryString - 查询字符串
 * @param {Object} markdownConfig - Markdown 配置
 */
function serveFile(filePath, res, requestPath, queryString, markdownConfig) {
  const mimeType = getMimeType(filePath);
  const ext = path.extname(filePath).toLowerCase();
  
  // 检查是否是 Markdown 文件且启用了渲染
  if (ext === '.md' && markdownConfig && markdownConfig.enabled) {
    // 解析查询参数获取主题
    let theme = markdownConfig.theme || 'anonymous-dark';
    if (queryString) {
      const params = new URLSearchParams(queryString);
      if (params.get('theme')) {
        theme = params.get('theme');
      }
      // 如果请求原始内容
      if (params.get('raw') === '1') {
        serveRawFile(filePath, res, mimeType);
        return;
      }
    }
    
    // 读取并渲染 Markdown
    fs.readFile(filePath, 'utf8', (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('读取文件失败');
        return;
      }
      
      const title = path.basename(filePath, '.md');
      const html = generateMarkdownPage(title, content, requestPath || '/', theme);
      
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.end(html);
    });
  } else {
    serveRawFile(filePath, res, mimeType);
  }
}

/**
 * 处理文件服务请求
 * 
 * @param {http.IncomingMessage} req - 请求对象
 * @param {http.ServerResponse} res - 响应对象
 * @param {Object} resolved - 解析后的路径信息 {fullPath, basePath, route}
 * @param {string} requestPath - 请求路径
 * @param {string} queryString - 查询字符串
 * @param {Object} config - 服务器配置
 */
function handleFileRequest(req, res, resolved, requestPath, queryString, config) {
  const { fullPath, basePath, route } = resolved;
  
  fs.stat(fullPath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 - 未找到</h1><p>文件或目录不存在</p>');
      return;
    }
    
    if (stats.isDirectory()) {
      // 确保目录路径以 / 结尾
      if (!requestPath.endsWith('/')) {
        res.writeHead(301, { 'Location': requestPath + '/' });
        res.end();
        return;
      }
      
      // 检查是否存在 index.html
      const indexPath = path.join(fullPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        serveFile(indexPath, res, requestPath, queryString, config.markdown);
        return;
      }
      
      // 显示目录列表
      if (config.showIndex) {
        const html = generateDirectoryListing(fullPath, requestPath, route);
        if (html) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
        } else {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('无法读取目录');
        }
      } else {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('目录列表已禁用');
      }
    } else {
      serveFile(fullPath, res, requestPath, queryString, config.markdown);
    }
  });
}

module.exports = {
  handleFileRequest,
  serveFile,
  serveRawFile
};
