/**
 * 静态资源路由处理器（只读）
 * 
 * 目的：提供应用内置的 public 资源（CSS/JS/图片/主题）的安全访问，
 * 避免通过文件服务挂载 public 目录导致的读写风险。
 * 
 * 约束：
 * - 仅支持 GET/HEAD
 * - 禁止目录索引
 * - 路径安全校验（normalize + 基路径限制）
 */

const fs = require('fs');
const path = require('path');
const { getMimeType } = require('../utils/mime');

/**
 * 处理静态资源请求
 * @param {import('http').IncomingMessage} req 
 * @param {import('http').ServerResponse} res 
 * @param {string} requestPath - 原始请求路径（例如 /public/css/app.css）
 * @param {string} appRoot - 应用根目录
 * @param {Function} logger - 日志函数(level, ...args)
 * @param {Object} assetsConfig - 配置对象 { mount, path, cacheMaxAge }
 */
function handleStaticAssets(req, res, requestPath, appRoot, logger, assetsConfig) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: '方法不允许' }));
      return true; // 已处理
    }

    const mount = (assetsConfig && assetsConfig.mount) || '/public';
    const relBase = (assetsConfig && assetsConfig.path) || './public';
    const cacheMaxAge = Math.max(0, parseInt((assetsConfig && assetsConfig.cacheMaxAge) || 3600, 10));

    if (!requestPath.startsWith(mount)) return false; // 非本路由

    const basePath = path.isAbsolute(relBase) ? relBase : path.join(appRoot, relBase);

    // 计算相对路径，移除挂载前缀
    let relative = requestPath.slice(mount.length);
    if (relative.startsWith('/')) relative = relative.slice(1);

    // 组合与规范化路径
    const fullPath = path.normalize(path.join(basePath, relative));
    const normalizedBase = path.normalize(basePath);

    // 安全校验：必须在 base 内
    if (!fullPath.startsWith(normalizedBase)) {
      logger('WARN', '静态资源路径越界拦截', fullPath);
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: '禁止访问' }));
      return true;
    }

    // 禁止访问目录或空路径
    if (!relative || relative.endsWith('/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return true;
    }

    // 读取文件并返回
    fs.stat(fullPath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }

      const mime = getMimeType(fullPath);
      const headers = {
        'Content-Type': mime,
        'Cache-Control': `public, max-age=${cacheMaxAge}`,
        'ETag': `"${stat.ino}-${stat.mtime.getTime()}"`
      };

      if (req.method === 'HEAD') {
        res.writeHead(200, headers);
        res.end();
        return;
      }

      res.writeHead(200, headers);
      const stream = fs.createReadStream(fullPath);
      stream.on('error', () => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      stream.pipe(res);
    });

    return true;
  } catch (e) {
    logger('ERROR', '静态资源处理异常', e && (e.stack || e.message));
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, message: '服务器内部错误' }));
    return true;
  }
}

module.exports = { handleStaticAssets };
