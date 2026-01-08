/**
 * 本地轻量级后端自用服务器 - 主入口
 * 
 * 这是一个纯 Node.js 核心模块构建的 HTTP 文件服务器
 * 主要功能：
 * - 静态文件服务与目录浏览
 * - Markdown 渲染（Marked + highlight.js + KaTeX）
 * - 文件上传/删除 API（PicList 兼容）
 * - Telegram 服务（登录、消息发送、任务调度）
 * - WebSocket 实时推送（消息、文件变化）
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
const WebSocket = require('ws');

// 导入工具模块
const { appendLog } = require('./src/utils/logger');
const { appRoot } = require('./src/utils/path-resolver');

// 导入配置和新模块
const { loadConfig, getConfigSummary } = require('./src/config');
const ServiceFactory = require('./src/services/service-factory');
const Router = require('./src/routes/router');
const WebSocketManager = require('./src/services/websocket-manager');
const PerformanceCollector = require('./src/utils/performance-collector');
const { notifyAll } = require('./src/services/notification-service');

// 加载配置
const config = loadConfig(appRoot, appendLog);

// 初始化性能收集器
const perfCollector = new PerformanceCollector(appendLog);

// 初始化 WebSocket 管理器（先创建）
const wsManager = new WebSocketManager(appendLog);

// 初始化服务工厂（注入 wsManager）
const serviceFactory = new ServiceFactory(config, appRoot, appendLog, wsManager);
let initResults = null;

(async () => {
  try {
    initResults = await serviceFactory.initializeAll();
    if (initResults.errors.length > 0) {
      appendLog('WARN', `服务初始化有 ${initResults.errors.length} 个错误，部分功能可能不可用`);
    }
  } catch (err) {
    appendLog('ERROR', '服务初始化异常', err.message);
  }
})();

/**
 * HTTP 请求处理器
 * 
 * 使用路由分发器处理所有请求
 */
const server = (function() {
  function requestHandler(req, res) {
    // 确保服务工厂初始化完成
    if (!serviceFactory) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: '服务正在初始化中' }));
      return;
    }

    // 记录请求开始时间
    const startTime = Date.now();

    // 拦截原始 end 方法以记录性能数据
    const originalEnd = res.end;
    res.end = function(...args) {
      const responseTime = Date.now() - startTime;
      const statusCode = res.statusCode;
      const success = statusCode >= 200 && statusCode < 400;

      // 记录到性能收集器
      if (perfCollector) {
        perfCollector.recordRequest(responseTime, success);
      }

      // 调用原始 end 方法
      return originalEnd.apply(res, args);
    };

    // 使用路由分发器处理请求
    const router = new Router(config, serviceFactory, appendLog, appRoot, perfCollector);
    // 注入 WebSocket 管理器
    router.setWebSocketManager(wsManager);
    router.handle(req, res);
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
 * WebSocket 升级处理
 */
server.on('upgrade', (req, socket, head) => {
  // 只允许 /ws 路径升级为 WebSocket
  if (req.url === '/ws' || req.url === '/ws/') {
    const wss = new WebSocket.Server({ noServer: true });

    wss.handleUpgrade(req, socket, head, (ws) => {
      wsManager.handleConnection(ws);
    });
  } else {
    // 拒绝其他路径的升级
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
  }
});

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
process.on('SIGINT', async () => {
  appendLog('INFO', '接收到 SIGINT 信号，正在关闭服务器...');

  // 关闭 WebSocket 连接
  try {
    if (wsManager) {
      await wsManager.shutdown();
    }
  } catch (err) {
    appendLog('WARN', 'WebSocket 关闭异常', err.message);
  }

  // 优雅关闭服务
  try {
    if (serviceFactory) {
      await serviceFactory.shutdown();
    }
  } catch (err) {
    appendLog('WARN', '服务关闭异常', err.message);
  }

  // 清理性能收集器
  try {
    if (perfCollector) {
      perfCollector.shutdown();
    }
  } catch (err) {
    appendLog('WARN', '性能收集器关闭异常', err.message);
  }

  server.close(() => {
    appendLog('INFO', '服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  appendLog('INFO', '接收到 SIGTERM 信号，正在关闭服务器...');

  // 关闭 WebSocket 连接
  try {
    if (wsManager) {
      await wsManager.shutdown();
    }
  } catch (err) {
    appendLog('WARN', 'WebSocket 关闭异常', err.message);
  }

  // 优雅关闭服务
  try {
    if (serviceFactory) {
      await serviceFactory.shutdown();
    }
  } catch (err) {
    appendLog('WARN', '服务关闭异常', err.message);
  }

  // 清理性能收集器
  try {
    if (perfCollector) {
      perfCollector.shutdown();
    }
  } catch (err) {
    appendLog('WARN', '性能收集器关闭异常', err.message);
  }

  server.close(() => {
    appendLog('INFO', '服务器已关闭');
    process.exit(0);
  });
});
