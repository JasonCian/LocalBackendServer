/**
 * 文件服务路由处理器
 * 
 * 处理文件服务页面请求和 API
 */

const fs = require('fs');
const path = require('path');

/**
 * 处理文件服务请求
 * 
 * @param {Object} req - HTTP 请求对象
 * @param {Object} res - HTTP 响应对象
 * @param {string} requestPath - 请求路径
 * @param {Object} fileService - 文件服务实例
 * @param {Function} logger - 日志函数
 * @param {string} mount - 挂载路径
 */
function handleFileService(req, res, requestPath, fileService, logger, mount = '/file') {
  try {
    // API 路由：获取配置
    if (requestPath === mount + '/api/config') {
      const config = fileService.getConfig();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, config }));
      return;
    }
    
    // 页面路由：返回 HTML 文件
    if (requestPath === mount || requestPath === mount + '/') {
      const htmlPath = path.resolve(fileService.appRoot, 'public/file-service.html');
      
      if (!fs.existsSync(htmlPath)) {
        logger('ERROR', 'HTML 文件不存在', htmlPath);
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 - 文件未找到</h1>');
        return;
      }
      
      const html = fs.readFileSync(htmlPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    
    // 其他路径返回 404
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404 - 未找到</h1>');
  } catch (err) {
    logger('ERROR', '文件服务错误', err && (err.stack || err.message));
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, message: '服务器内部错误' }));
  }
}

module.exports = {
  handleFileService
};
