/**
 * 文件上传路由处理器
 * 
 * 处理 multipart/form-data 文件上传，支持：
 * - 多文件上传
 * - UTF-8 文件名
 * - 子目录创建
 * - PicList 兼容格式
 */

const fs = require('fs');
const path = require('path');
const { parseMultipart } = require('../middleware/multipart-parser');
const { appRoot } = require('../utils/path-resolver');

/**
 * 处理文件上传请求
 * 
 * @param {http.IncomingMessage} req - 请求对象
 * @param {http.ServerResponse} res - 响应对象
 * @param {Object} config - 服务器配置
 * @param {Function} logger - 日志函数
 */
async function handleUpload(req, res, config, logger) {
  try {
    const { fields, files } = await parseMultipart(req);
    
    if (!files || files.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: '没有上传文件' }));
      return;
    }
    
    // 确定上传目录
    let uploadDir = null;
    
    // 首先检查config中是否配置了uploadDir
    if (config.uploadDir) {
      uploadDir = config.uploadDir;
    }
    // 如果查询参数中指定了目录路由，使用该目录
    else if (fields.route) {
      const dirConfig = config.directories.find(d => d.route === fields.route);
      if (dirConfig) {
        uploadDir = dirConfig.path;
      }
    }
    
    // 如果还没有确定，使用第一个目录映射的路径
    if (!uploadDir) {
      uploadDir = config.directories[0]?.path || './public';
    }
    
    // 如果提供了子目录路径
    if (fields.subdir) {
      uploadDir = path.join(uploadDir, fields.subdir);
    }
    
    // 规范化路径，使用appRoot作为相对路径的基准
    const basePath = path.isAbsolute(uploadDir) ? uploadDir : path.join(appRoot, uploadDir);
    const normalizedBase = path.normalize(basePath);
    
    // 创建目录（如果不存在）
    if (!fs.existsSync(normalizedBase)) {
      fs.mkdirSync(normalizedBase, { recursive: true });
    }
    
    // 处理上传的文件
    const results = [];
    for (const file of files) {
      // 安全检查文件名（防止路径遍历）
      const safeFilename = path.basename(file.filename);
      if (!safeFilename || safeFilename === '.') {
        results.push({
          success: false,
          filename: file.filename,
          message: '无效的文件名'
        });
        continue;
      }
      
      const filePath = path.join(normalizedBase, safeFilename);
      const normalizedPath = path.normalize(filePath);
      
      // 检查路径安全
      if (!normalizedPath.startsWith(normalizedBase)) {
        results.push({
          success: false,
          filename: file.filename,
          message: '不允许的路径'
        });
        continue;
      }
      
      try {
        fs.writeFileSync(filePath, file.content);
        
        // 生成访问URL
        let accessUrl = `/${safeFilename}`;
        
        // 查找匹配的路由
        const matchedRoute = config.directories.find(d => {
          const dirPath = path.isAbsolute(d.path) ? d.path : path.join(appRoot, d.path);
          const normalizedDirPath = path.normalize(dirPath);
          return normalizedBase.startsWith(normalizedDirPath);
        });
        
        if (matchedRoute) {
          // 计算相对于匹配路由的路径
          const routePath = path.isAbsolute(matchedRoute.path) 
            ? matchedRoute.path 
            : path.join(appRoot, matchedRoute.path);
          const normalizedRoutePath = path.normalize(routePath);
          const relativePath = path.relative(normalizedRoutePath, normalizedPath);
          const urlPath = relativePath.split(path.sep).join('/');
          
          // 构建完整的 URL
          if (matchedRoute.route === '/') {
            accessUrl = `/${urlPath}`;
          } else {
            accessUrl = `${matchedRoute.route}/${urlPath}`;
          }
        } else if (fields.subdir) {
          accessUrl = `/upload/${fields.subdir}/${safeFilename}`;
        }
        
        // 构建完整的绝对 URL
        const protocol = req.connection.encrypted ? 'https' : 'http';
        const portSuffix = (config.port === 80 && protocol === 'http') || (config.port === 443 && protocol === 'https') 
          ? '' 
          : `:${config.port}`;
        const fullUrl = `${protocol}://${config.host}${portSuffix}${accessUrl}`;
        
        results.push({
          success: true,
          filename: safeFilename,
          url: fullUrl,
          size: file.size
        });
        
        if (logger) {
          logger('INFO', `文件上传成功: ${safeFilename}`);
        }
      } catch (err) {
        results.push({
          success: false,
          filename: safeFilename,
          message: err.message
        });
      }
    }
    
    // 返回结果（支持 PicList 格式）
    const successCount = results.filter(r => r.success).length;
    const responseFormat = fields.format || 'piclist';
    
    if (responseFormat === 'piclist') {
      // PicList 兼容格式
      if (successCount > 0) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          result: results.filter(r => r.success).map(r => r.url)
        }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: false,
          message: '所有文件上传失败'
        }));
      }
    } else {
      // 详细信息格式
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: successCount > 0,
        total: results.length,
        successCount,
        results
      }));
    }
  } catch (err) {
    if (logger) {
      logger('ERROR', '上传处理错误', err && err.message);
    }
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      success: false,
      message: err.message
    }));
  }
}

module.exports = {
  handleUpload
};
