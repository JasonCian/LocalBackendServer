/**
 * 文件服务路由处理器
 * 
 * 处理静态文件服务、目录浏览和 Markdown 渲染
 * 优化：流式传输大文件、HTTP 范围请求、缓存支持
 */

const fs = require('fs');
const path = require('path');
const url = require('url');
const { getMimeType } = require('../utils/mime');
const { globalCache } = require('../utils/cache-manager');
const { generateDirectoryListing } = require('../services/file-service/directory-listing');
const { generateMarkdownPage } = require('../services/file-service/markdown-page');

// 常量
const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB 以上用流式传输
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

/**
 * 提供原始文件（支持流式传输和范围请求）
 * 
 * @param {string} filePath - 文件路径
 * @param {http.ServerResponse} res - 响应对象
 * @param {string} mimeType - MIME 类型
 * @param {Object} stat - 文件统计信息
 * @param {http.IncomingMessage} req - 请求对象（可选，用于范围请求）
 */
function serveRawFile(filePath, res, mimeType, stat, req = null) {
  const fileSize = stat.size;

  // 处理 HTTP Range 请求（用于断点续传和快进）
  if (req && req.headers.range) {
    const rangeMatch = req.headers.range.match(/bytes=(\d+)-(\d*)/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fileSize - 1;

      if (start >= 0 && start < fileSize && end >= start && end < fileSize) {
        res.writeHead(206, {
          'Content-Type': mimeType,
          'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600'
        });

        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }
  }

  // 标准文件提供（使用流式传输）
  res.writeHead(200, {
    'Content-Type': mimeType,
    'Content-Length': fileSize,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=3600',
    'ETag': `"${stat.ino}-${stat.mtime.getTime()}"`
  });

  // 大文件使用流式传输，小文件直接读取
  if (fileSize > LARGE_FILE_THRESHOLD) {
    // 流式传输（适合大文件）
    const stream = fs.createReadStream(filePath, {
      highWaterMark: 64 * 1024 // 64KB 缓冲
    });

    stream.on('error', err => {
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    });

    stream.pipe(res);
  } else {
    // 小文件直接读取
    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (!res.headersSent) {
          res.writeHead(500);
        }
        res.end();
        return;
      }
      res.end(data);
    });
  }
}

/**
 * 提供文件（支持 Markdown 渲染和缓存）
 * 
 * @param {string} filePath - 文件路径
 * @param {http.ServerResponse} res - 响应对象
 * @param {string} requestPath - 请求路径
 * @param {string} queryString - 查询字符串
 * @param {Object} markdownConfig - Markdown 配置
 * @param {Object} stat - 文件统计信息
 * @param {http.IncomingMessage} req - 请求对象
 */
function serveFile(filePath, res, requestPath, queryString, markdownConfig, stat, req, assetsMount = '/public') {
  const mimeType = getMimeType(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // 检查是否是 Markdown 文件且启用了渲染
  if (ext === '.md' && markdownConfig && markdownConfig.enabled) {
    // 解析查询参数获取主题
    let theme = markdownConfig.theme || 'anonymous-dark';
    let useRaw = false;

    if (queryString) {
      const params = new URLSearchParams(queryString);
      if (params.get('theme')) {
        theme = params.get('theme');
      }
      // 如果请求原始内容
      if (params.get('raw') === '1') {
        useRaw = true;
      }
    }

    if (useRaw) {
      serveRawFile(filePath, res, mimeType, stat, req);
      return;
    }

    // 生成缓存 key（基于文件路径、主题和修改时间）
    const cacheKey = `md:${filePath}:${theme}:${stat.mtime.getTime()}`;

    // 检查缓存
    const cachedHtml = globalCache.get(cacheKey, 'markdown');
    if (cachedHtml) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, max-age=300',
        'X-Cache': 'HIT'
      });
      res.end(cachedHtml);
      return;
    }

    // 读取并渲染 Markdown
    fs.readFile(filePath, 'utf8', (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('读取文件失败');
        return;
      }

      const title = path.basename(filePath, '.md');
      const html = generateMarkdownPage(
        title,
        content,
        requestPath || '/',
        theme,
        undefined,
        assetsMount
      );

      // 缓存渲染结果
      globalCache.set(cacheKey, html, CACHE_TTL, 'markdown');

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, max-age=300',
        'X-Cache': 'MISS'
      });
      res.end(html);
    });
  } else {
    serveRawFile(filePath, res, mimeType, stat, req);
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
      res.writeHead(404, {
        'Content-Type': 'text/html; charset=utf-8'
      });
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
        fs.stat(indexPath, (err, indexStats) => {
          if (!err) {
            serveFile(
              indexPath,
              res,
              requestPath,
              queryString,
              config.markdown,
              indexStats,
              req,
              (config.assets && config.assets.mount) || '/public'
            );
          }
        });
        return;
      }

      // 显示目录列表（缓存整个目录列表）
      if (config.showIndex) {
        const cacheKey = `dir:${fullPath}:${stats.mtime.getTime()}`;
        let html = globalCache.get(cacheKey, 'directory');

        if (!html) {
          html = generateDirectoryListing(fullPath, requestPath, route);
          if (html) {
            // 缓存 5 分钟
            globalCache.set(cacheKey, html, CACHE_TTL, 'directory');
          }
        }

        if (html) {
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=60'
          });
          res.end(html);
        } else {
          res.writeHead(500, {
            'Content-Type': 'text/plain; charset=utf-8'
          });
          res.end('无法读取目录');
        }
      } else {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('目录列表已禁用');
      }
    } else {
      serveFile(
        fullPath,
        res,
        requestPath,
        queryString,
        config.markdown,
        stats,
        req,
        (config.assets && config.assets.mount) || '/public'
      );
    }
  });
}

module.exports = {
  handleFileRequest,
  serveFile,
  serveRawFile
};
