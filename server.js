/**
 * 本地轻量级后端自用服务器 - 主入口
 * 
 * 这是一个纯 Node.js 核心模块构建的 HTTP 文件服务器
 * 主要功能：
 * - 静态文件服务与目录浏览
 * - Markdown 渲染（Marked + highlight.js + KaTeX）
 * - 文件上传/删除 API（PicList 兼容）
 * - Telegram 服务（登录、消息发送、任务调度）
 * - 通知推送（钉钉、飞书、自定义 Webhook）
 * - CORS 支持
 * - Windows 服务模式（NSSM）
 * 
 * 设计原则：
 * - 不使用 Express/Koa 等框架
 * - 不引入本地 npm 依赖（前端库使用 CDN）
 * - 配置驱动（config.json）
 * - 模块化拆分，清晰注释
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// 导入工具模块
const { appendLog } = require('./src/utils/logger');
const { appRoot, resolveFilePath } = require('./src/utils/path-resolver');

// 导入配置模块
const { loadConfig, getConfigSummary } = require('./src/config');

// 导入中间件
const { applyCorsHeaders, handleOptionsRequest } = require('./src/middleware/cors');

// 导入视图生成器
const { generateStartPage } = require('./src/views/start-page');

// 导入服务
const { notifyAll } = require('./src/services/notification-service');
const TelegramService = require('./src/services/telegram/telegram-service');
const PowerShellHistoryService = require('./src/services/powershell-history/powershell-history');
const FileService = require('./src/services/file-service/file-service');

// 导入路由处理器
const { handleFileRequest } = require('./src/routes/file-routes');
const { handleUpload } = require('./src/routes/upload-routes');
const { handleDelete } = require('./src/routes/delete-routes');
const { handleTelegram } = require('./src/routes/telegram-routes');
const { handlePowerShellHistory } = require('./src/routes/powershell-history-routes');
const { handleFileService } = require('./src/routes/file-service-routes');
const { handleSearch } = require('./src/routes/search-routes');
const { handleBingDaily } = require('./src/routes/bing-routes');

// 加载配置
const config = loadConfig(appRoot, appendLog);

// 初始化 Telegram 服务（如果启用）
let telegramService = null;
if (config.services && config.services.telegram && config.services.telegram.enabled) {
  try {
    telegramService = new TelegramService(
      config.services.telegram,
      appRoot,
      appendLog,
      async (title, detail) => {
        await notifyAll(config.services.notifications, title, detail, appendLog);
      }
    );
    appendLog('INFO', 'Telegram 服务初始化成功');
  } catch (e) {
    appendLog('ERROR', 'Telegram 服务初始化失败', e && (e.stack || e.message));
  }
}

// 初始化 PowerShell History 服务（如果启用）
let psHistoryService = null;
if (config.services && config.services.powershellHistory && config.services.powershellHistory.enabled) {
  try {
    psHistoryService = new PowerShellHistoryService(
      config.services.powershellHistory,
      appRoot,
      appendLog
    );
    // 启动实时监听
    psHistoryService.start();
    appendLog('INFO', 'PowerShell History 服务初始化成功，已启动实时监听');
  } catch (e) {
    appendLog('ERROR', 'PowerShell History 服务初始化失败', e && (e.stack || e.message));
  }
}

// 初始化文件服务（如果启用）
let fileService = null;
if (config.services && config.services.fileService && config.services.fileService.enabled) {
  try {
    fileService = new FileService(config, appRoot, appendLog);
    appendLog('INFO', '文件服务初始化成功');
  } catch (e) {
    appendLog('ERROR', '文件服务初始化失败', e && (e.stack || e.message));
  }
}

/**
 * HTTP 请求处理器
 */
const server = (function() {
  // 抽取请求处理器，便于根据配置创建 HTTP 或 HTTPS 服务器
  function requestHandler(req, res) {
    const parsedUrl = url.parse(req.url);
    let requestPath = parsedUrl.pathname;
    const queryString = parsedUrl.query;

    // 基础请求日志
    try {
      appendLog('INFO', `Request ${req.method} ${requestPath || ''}${queryString ? '?' + queryString : ''}`);
    } catch (e) {
      // 忽略日志错误
    }
    
    // 应用 CORS 头
    applyCorsHeaders(res, config.cors);
    
    // 处理 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
      handleOptionsRequest(res);
      return;
    }
    
    // 处理文件上传：POST /upload
    if (req.method === 'POST' && (requestPath === '/upload' || requestPath.startsWith('/upload/'))) {
      handleUpload(req, res, config, appendLog).catch(err => {
        appendLog('ERROR', '上传错误', err && err.message);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, message: err.message }));
      });
      return;
    }

    // 处理文件删除：POST /delete
    if (req.method === 'POST' && requestPath === '/delete') {
      handleDelete(req, res, config, appendLog).catch(err => {
        appendLog('ERROR', '删除错误', err && err.message);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, message: err.message }));
      });
      return;
    }

    // Telegram 服务路由（可配置）
    const telegramMount = config.services && config.services.telegram && config.services.telegram.mount ? config.services.telegram.mount : '/telegram';
    if (requestPath && requestPath.startsWith(telegramMount)) {
      if (telegramService) {
        handleTelegram(req, res, requestPath, telegramService, appRoot, appendLog, telegramMount);
      } else {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, message: 'Telegram 服务未启用' }));
      }
      return;
    }
    
    // PowerShell History 服务路由（可配置）
    const psHistoryMount = config.services && config.services.powershellHistory && config.services.powershellHistory.mount 
      ? config.services.powershellHistory.mount 
      : '/powershell';
    if (requestPath && requestPath.startsWith(psHistoryMount)) {
      if (psHistoryService) {
        handlePowerShellHistory(req, res, requestPath, psHistoryService, appendLog, psHistoryMount);
      } else {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, message: 'PowerShell History 服务未启用' }));
      }
      return;
    }
    
    // 文件服务路由（可配置）
    const fileMount = config.services && config.services.fileService && config.services.fileService.mount
      ? config.services.fileService.mount
      : '/file';
    if (requestPath && requestPath.startsWith(fileMount)) {
      if (fileService) {
        handleFileService(req, res, requestPath, fileService, appendLog, fileMount);
      } else {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, message: '文件服务未启用' }));
      }
      return;
    }
    
    // 只允许 GET 和 HEAD 请求用于文件下载
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: '方法不允许' }));
      return;
    }
    
    // 根路径：显示起始页（浏览器主页）
    if (requestPath === '/' || requestPath === '') {
      const html = generateStartPage(config);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    
    // 站内搜索路由
    if (requestPath === '/search') {
      handleSearch(req, res, queryString, config, appendLog);
      return;
    }

    // Bing 每日图片代理
    if (requestPath === '/api/bing-daily') {
      handleBingDaily(req, res, appendLog);
      return;
    }
    
    // 解析路径，匹配目录映射
    const resolved = resolveFilePath(requestPath, config.directories);
    
    if (!resolved) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 - 未找到</h1><p>请求的路径未配置目录映射</p>');
      return;
    }
    
    // 处理文件请求
    handleFileRequest(req, res, resolved, requestPath, queryString, config);
  }

  // 根据配置选择创建 HTTP 或 HTTPS 服务器
  try {
    if (config.tls && config.tls.enabled) {
      const pfxPathRaw = config.tls.pfx || '';
      const pfxPath = pfxPathRaw ? (path.isAbsolute(pfxPathRaw) ? pfxPathRaw : path.join(appRoot, pfxPathRaw)) : '';
      const passphrase = (config.tls.passphrase && String(config.tls.passphrase)) || undefined;

      const keyPath = path.isAbsolute(config.tls.key || '') ? (config.tls.key || '') : path.join(appRoot, (config.tls.key || './certs/localhost.key'));
      const certPath = path.isAbsolute(config.tls.cert || '') ? (config.tls.cert || '') : path.join(appRoot, (config.tls.cert || './certs/localhost.crt'));

      // 可选：证书链（CA）
      let caList = [];
      try {
        const caRaw = config.tls && config.tls.ca;
        if (caRaw) {
          const caArray = Array.isArray(caRaw) ? caRaw : [caRaw];
          for (const caItem of caArray) {
            const caPath = path.isAbsolute(caItem || '') ? (caItem || '') : path.join(appRoot, (caItem || ''));
            if (caPath && fs.existsSync(caPath)) {
              caList.push(fs.readFileSync(caPath));
            } else {
              appendLog('WARN', `TLS CA 文件不存在: ${caPath}`);
            }
          }
        }
      } catch (e) {
        appendLog('WARN', '加载 TLS CA 链失败', e && (e.stack || e.message));
      }

      // 优先 PFX
      if (pfxPath && fs.existsSync(pfxPath)) {
        const options = { pfx: fs.readFileSync(pfxPath) };
        if (passphrase) options.passphrase = passphrase;
        if (caList.length > 0) options.ca = caList;
        appendLog('INFO', `HTTPS 使用 PFX 证书: ${pfxPath}`);
        return https.createServer(options, requestHandler);
      }

      // 其次 key/cert
      if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        const options = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
        if (caList.length > 0) options.ca = caList;
        appendLog('INFO', `HTTPS 使用 Key/Cert: ${keyPath}, ${certPath}`);
        return https.createServer(options, requestHandler);
      }

      appendLog('WARN', `TLS 启用但未找到有效证书（PFX: ${pfxPath || '未配置'}；KEY/CERT: ${keyPath}, ${certPath}），回退 HTTP`);
      return http.createServer(requestHandler);
    } else {
      return http.createServer(requestHandler);
    }
  } catch (e) {
    appendLog('ERROR', '创建服务器失败，回退到 HTTP', e && (e.stack || e.message));
    return http.createServer(requestHandler);
  }
})();

/**
 * 启动服务器
 */
// 启动服务器（支持 TLS 端口与可选的 HTTP->HTTPS 重定向）
const useTls = !!(config.tls && config.tls.enabled);
const listenPort = useTls ? (config.tls.port || 443) : (config.port || 80);
const listenHost = config.host || '0.0.0.0';

server.listen(listenPort, listenHost, () => {
  const timestamp = new Date().toLocaleString('zh-CN');
  const projectName = (config.projectName && String(config.projectName).trim()) || '本地文件服务器';
  
  if (useTls) {
    appendLog('INFO', `服务器启动: https://${config.host}:${listenPort}/`);
  } else {
    appendLog('INFO', `服务器启动: http://${config.host}:${listenPort}/`);
  }
  appendLog('INFO', `启动时间: ${timestamp}`);
  appendLog('INFO', `工作目录: ${appRoot}`);
  appendLog('INFO', `Node版本: ${process.version}`);
  appendLog('INFO', `配置摘要:\n${getConfigSummary(config)}`);

  // 控制台美化输出
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log(`║          📁 ${projectName} 已启动`.padEnd(63) + '║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  if (useTls) {
    console.log(`║  🌐 访问地址: https://${config.host}:${listenPort}/`.padEnd(63) + '║');
  } else {
    console.log(`║  🌐 访问地址: http://${config.host}:${listenPort}/`.padEnd(63) + '║');
  }
  console.log(`║  📅 启动时间: ${timestamp}`.padEnd(63) + '║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  📂 目录映射:                                              ║');
  config.directories.forEach(dir => {
    const line = `║     ${dir.route} -> ${dir.path}`;
    console.log(line.padEnd(63) + '║');
  });
  if (config.uploadDir) {
    const uploadLine = `║  📤 默认上传目录: ${config.uploadDir}`;
    console.log(uploadLine.padEnd(63) + '║');
  }
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  💡 按 Ctrl+C 停止服务器                                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // 异步发送启动通知（带重试，不阻塞服务器）
  (async () => {
    try {
      appendLog('INFO', '准备发送启动通知...');
      await notifyAll(
        config.services.notifications, 
        '服务器启动', 
        `${projectName} 在 ${timestamp} 启动成功\n监听地址: http://${config.host}:${config.port}/`,
        appendLog,
        null,
        {
          maxRetries: 5,
          initialDelay: 3000,  // 等待3秒网络就绪
          retryDelay: 2000,    // 每次重试间隔2秒起
          exponentialBackoff: true
        }
      );
      appendLog('INFO', '启动通知发送完成');
    } catch (err) {
      appendLog('WARN', '启动通知发送异常（已尽力重试）', err && err.message);
    }
  })();
});

// 可选：HTTP -> HTTPS 重定向（当启用 tls.redirectHttp 且 TLS 正在使用不同端口时）
if (useTls && config.tls && config.tls.redirectHttp) {
  try {
    const redirectPort = config.port || 80;
    if (redirectPort !== listenPort) {
      const redirectServer = http.createServer((req, res) => {
        const hostHeader = req.headers.host ? req.headers.host.split(':')[0] : config.host || 'localhost';
        const target = `https://${hostHeader}:${listenPort}${req.url}`;
        res.writeHead(301, { Location: target });
        res.end();
      });

      redirectServer.listen(redirectPort, listenHost, () => {
        appendLog('INFO', `HTTP->HTTPS 重定向已启用: http://${listenHost}:${redirectPort}/ -> https://${listenHost}:${listenPort}/`);
      });
    }
  } catch (e) {
    appendLog('WARN', '启动 HTTP->HTTPS 重定向失败', e && (e.stack || e.message));
  }
}

/**
 * 错误处理
 */
server.on('error', (err) => {
  appendLog('ERROR', '服务器错误', `${err.code || ''} ${err.message || ''}`);
  
  if (err.code === 'EADDRINUSE') {
    appendLog('ERROR', `端口 ${config.port} 已被占用，请修改配置文件中的端口号`);
  } else if (err.code === 'EACCES') {
    appendLog('ERROR', `没有权限访问端口 ${config.port}（可能需要管理员权限）`);
  }
  
  process.exit(1);
});

/**
 * 进程异常处理
 */
process.on('uncaughtException', (err) => {
  appendLog('ERROR', '未捕获的异常', err.stack || err.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  appendLog('ERROR', '未处理的 Promise 拒绝', reason && reason.stack ? reason.stack : reason);
  process.exit(1);
});

/**
 * 优雅关闭
 */
process.on('SIGINT', () => {
  appendLog('INFO', '接收到 SIGINT 信号，正在关闭服务器...');
  server.close(() => {
    appendLog('INFO', '服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  appendLog('INFO', '接收到 SIGTERM 信号，正在关闭服务器...');
  server.close(() => {
    appendLog('INFO', '服务器已关闭');
    process.exit(0);
  });
});
