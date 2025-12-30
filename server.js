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
const url = require('url');

// 导入工具模块
const { appendLog } = require('./src/utils/logger');
const { appRoot, resolveFilePath } = require('./src/utils/path-resolver');

// 导入配置模块
const { loadConfig, getConfigSummary } = require('./src/config');

// 导入中间件
const { applyCorsHeaders, handleOptionsRequest } = require('./src/middleware/cors');

// 导入视图生成器
const { generateHomePage } = require('./src/views/home-page');

// 导入服务
const { notifyAll } = require('./src/services/notification-service');
const TelegramService = require('./src/services/telegram/telegram-service');

// 导入路由处理器
const { handleFileRequest } = require('./src/routes/file-routes');
const { handleUpload } = require('./src/routes/upload-routes');
const { handleDelete } = require('./src/routes/delete-routes');
const { handleTelegram } = require('./src/routes/telegram-routes');

// 加载配置
const config = loadConfig(appRoot, appendLog);

// 初始化 Telegram 服务（如果启用）
let telegramService = null;
if (config.telegram && config.telegram.enabled) {
  try {
    telegramService = new TelegramService(
      config.telegram,
      appRoot,
      appendLog,
      async (title, detail) => {
        await notifyAll(config.notifications, title, detail, appendLog);
      }
    );
    appendLog('INFO', 'Telegram 服务初始化成功');
  } catch (e) {
    appendLog('ERROR', 'Telegram 服务初始化失败', e && (e.stack || e.message));
  }
}

/**
 * HTTP 请求处理器
 */
const server = http.createServer((req, res) => {
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
  const telegramMount = config.telegram && config.telegram.mount ? config.telegram.mount : '/telegram';
  if (requestPath && requestPath.startsWith(telegramMount)) {
    if (telegramService) {
      handleTelegram(req, res, requestPath, telegramService, appRoot, appendLog);
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: 'Telegram 服务未启用' }));
    }
    return;
  }
  
  // 只允许 GET 和 HEAD 请求用于文件下载
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, message: '方法不允许' }));
    return;
  }
  
  // 根路径：显示首页
  if (requestPath === '/' || requestPath === '') {
    const html = generateHomePage(config);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
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
});

/**
 * 启动服务器
 */
server.listen(config.port, config.host, () => {
  const timestamp = new Date().toLocaleString('zh-CN');
  const projectName = (config.projectName && String(config.projectName).trim()) || '本地文件服务器';
  
  appendLog('INFO', `服务器启动: http://${config.host}:${config.port}/`);
  appendLog('INFO', `启动时间: ${timestamp}`);
  appendLog('INFO', `配置摘要:\n${getConfigSummary(config)}`);

  // 控制台美化输出
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log(`║          📁 ${projectName} 已启动`.padEnd(63) + '║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  🌐 访问地址: http://${config.host}:${config.port}/`.padEnd(63) + '║');
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
  
  // 发送启动通知
  notifyAll(config.notifications, '服务器启动', `${projectName} 在 ${timestamp} 启动成功`, appendLog).catch(() => {});
});

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
