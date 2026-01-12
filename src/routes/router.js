/**
 * 统一路由分发器 - 处理所有 HTTP 请求的路由逻辑
 * 
 * 功能：
 * - 集中管理所有路由规则
 * - 按优先级分发请求
 * - 统一错误响应格式
 * - 支持路由中间件
 */

const url = require('url');
const { applyCorsHeaders, handleOptionsRequest } = require('../middleware/cors');
const { generateStartPage } = require('../views/start-page');
const { globalCache } = require('../utils/cache-manager');

// 路由处理器
const { handleFileRequest } = require('./file-routes');
const { handleUpload } = require('./upload-routes');
const { handleDelete } = require('./delete-routes');
const { handleTelegram } = require('./telegram-routes');
const { handlePowerShellHistory } = require('./powershell-history-routes');
const { handleFileService } = require('./file-service-routes');
const { handleSearch } = require('./search-routes');
const { handleBingDaily } = require('./bing-routes');
const { handleStaticAssets } = require('./static-routes');
const { handleSystemMetrics } = require('./system-metrics-routes');

/**
 * 路由分发器类
 */
class Router {
  constructor(config, serviceFactory, logger, appRoot, perfCollector = null) {
    this.config = config;
    this.serviceFactory = serviceFactory;
    this.logger = logger;
    this.appRoot = appRoot;
    this.perfCollector = perfCollector; // 性能收集器（可选）

    // 解析服务挂载点
    this.telegramMount = serviceFactory.getServiceMount('telegram');
    this.psHistoryMount = serviceFactory.getServiceMount('powershellHistory');
    this.fileMount = serviceFactory.getServiceMount('fileService');
    this.systemMetricsMount = serviceFactory.getServiceMount('systemMetrics');
  }

  /**
   * 设置 WebSocket 管理器引用（后期注入）
   */
  setWebSocketManager(wsManager) {
    this.wsManager = wsManager;
  }

  /**
   * 主分发处理器
   */
  handle(req, res) {
    const parsedUrl = url.parse(req.url);
    const requestPath = parsedUrl.pathname;
    const queryString = parsedUrl.query;

    try {
      // 基础请求日志
      this._logRequest(req, requestPath, queryString);

      // 应用 CORS 头
      applyCorsHeaders(res, this.config.cors);

      // 按优先级分发路由
      // 1. OPTIONS 预检请求
      if (req.method === 'OPTIONS') {
        return handleOptionsRequest(res);
      }

      // 2. POST/PUT/DELETE API 端点
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
        // 2.1 Telegram 服务路由
        if (this.telegramMount && requestPath.startsWith(this.telegramMount)) {
          const telegramService = this.serviceFactory.getService('telegram');
          if (!telegramService) {
            return this._serviceNotAvailable(res, 'Telegram');
          }
          return handleTelegram(
            req,
            res,
            requestPath,
            telegramService,
            this.appRoot,
            this.logger,
            this.telegramMount
          );
        }

        // 2.2 PowerShell History 服务路由
        if (this.psHistoryMount && requestPath.startsWith(this.psHistoryMount)) {
          const psService = this.serviceFactory.getService('psHistory');
          if (!psService) {
            return this._serviceNotAvailable(res, 'PowerShell History');
          }
          return handlePowerShellHistory(
            req,
            res,
            requestPath,
            psService,
            this.logger,
            this.psHistoryMount
          );
        }

        // 2.3 文件服务路由
        if (this.fileMount && requestPath.startsWith(this.fileMount)) {
          const fileService = this.serviceFactory.getService('fileService');
          if (!fileService) {
            return this._serviceNotAvailable(res, '文件服务');
          }
          return handleFileService(
            req,
            res,
            requestPath,
            fileService,
            this.logger,
            this.fileMount
          );
        }

        // 2.4 上传处理
        if (req.method === 'POST' && (requestPath === '/upload' || requestPath.startsWith('/upload/'))) {
          return this._handleRoute('handleUpload', () =>
            handleUpload(req, res, this.config, this.logger)
          );
        }

        // 2.5 删除处理
        if (req.method === 'POST' && requestPath === '/delete') {
          return this._handleRoute('handleDelete', () =>
            handleDelete(req, res, this.config, this.logger)
          );
        }

        // 2.6 POST/PUT/DELETE 请求到其他路径不支持
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            success: false,
            message: '方法不允许',
            path: requestPath,
            method: req.method
          })
        );
        return;
      }

      // 3. GET/HEAD 请求路由
      if (req.method === 'GET' || req.method === 'HEAD') {
        // 3.0 内置静态资源（只读）：用于 /public 下的 CSS/主题 等
        const assetsCfg = (this.config && this.config.assets) || { enabled: true, mount: '/public', path: './public' };
        if (assetsCfg && assetsCfg.enabled) {
          const handled = handleStaticAssets(req, res, requestPath, this.appRoot, this.logger, assetsCfg);
          if (handled) return;
        }

        // 3.1 Telegram 服务路由
        if (this.telegramMount && requestPath.startsWith(this.telegramMount)) {
          const telegramService = this.serviceFactory.getService('telegram');
          if (!telegramService) {
            return this._serviceNotAvailable(res, 'Telegram');
          }
          return handleTelegram(
            req,
            res,
            requestPath,
            telegramService,
            this.appRoot,
            this.logger,
            this.telegramMount,
            (this.config.assets && this.config.assets.mount) || '/public'
          );
        }

        // 3.2 PowerShell History 服务路由
        if (this.psHistoryMount && requestPath.startsWith(this.psHistoryMount)) {
          const psService = this.serviceFactory.getService('psHistory');
          if (!psService) {
            return this._serviceNotAvailable(res, 'PowerShell History');
          }
          return handlePowerShellHistory(
            req,
            res,
            requestPath,
            psService,
            this.logger,
            this.psHistoryMount,
            (this.config.assets && this.config.assets.mount) || '/public'
          );
        }

        // 3.3 文件服务路由
        if (this.fileMount && requestPath.startsWith(this.fileMount)) {
          const fileService = this.serviceFactory.getService('fileService');
          if (!fileService) {
            return this._serviceNotAvailable(res, '文件服务');
          }
          return handleFileService(
            req,
            res,
            requestPath,
            fileService,
            this.logger,
            this.fileMount
          );
        }

        // 3.3.1 系统监控路由
        if (this.systemMetricsMount && requestPath.startsWith(this.systemMetricsMount)) {
          const sysService = this.serviceFactory.getService('systemMetrics');
          if (!sysService) {
            return this._serviceNotAvailable(res, '系统监控');
          }
          return handleSystemMetrics(
            req,
            res,
            requestPath,
            sysService,
            this.logger,
            this.systemMetricsMount,
            (this.config.services && this.config.services.systemMetrics && this.config.services.systemMetrics.token) || ''
          );
        }

        // 3.4 站内搜索
        if (requestPath === '/search') {
          return handleSearch(req, res, queryString, this.config, this.logger);
        }

        // 3.5 Bing 每日图片代理
        if (requestPath === '/api/bing-daily') {
          return handleBingDaily(req, res, this.logger);
        }

        // 3.6 健康检查端点
        if (requestPath === '/api/health') {
          return this._handleHealth(res);
        }

        // 3.7 性能指标端点
        if (requestPath === '/api/metrics') {
          return this._handleMetrics(res);
        }

        // 3.8 WebSocket 状态端点
        if (requestPath === '/api/ws/info' || requestPath === '/api/ws/status') {
          return this._handleWebSocketInfo(res);
        }

        // 3.9 根路径：显示起始页
        if (requestPath === '/' || requestPath === '') {
          const html = generateStartPage(this.config);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
          return;
        }

        // 3.10 默认文件请求处理
        return this._handleRoute('handleFileRequest', () => {
          const { resolveFilePath } = require('../utils/path-resolver');
          const resolved = resolveFilePath(requestPath, this.config.directories);

          if (!resolved) {
            res.writeHead(404, {
              'Content-Type': 'text/html; charset=utf-8'
            });
            res.end(
              '<h1>404 - 未找到</h1><p>请求的路径未配置目录映射</p>'
            );
            return;
          }

          return handleFileRequest(
            req,
            res,
            resolved,
            requestPath,
            queryString,
            this.config
          );
        });
      }

      // 不支持的 HTTP 方法
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          success: false,
          message: '方法不允许',
          method: req.method
        })
      );
    } catch (err) {
      this.logger('ERROR', '请求处理异常', err.stack || err.message);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          success: false,
          message: '内部服务器错误'
        })
      );
    }
  }

  /**
   * 私有方法：记录请求
   */
  _logRequest(req, requestPath, queryString) {
    try {
      const qs = queryString ? `?${queryString}` : '';
      this.logger('INFO', `Request ${req.method} ${requestPath || '/'}${qs}`);
    } catch (e) {
      // 忽略日志错误
    }
  }

  /**
   * 私有方法：处理异步路由
   */
  async _handleRoute(name, handler) {
    try {
      return await handler();
    } catch (err) {
      this.logger('ERROR', `${name} 处理失败`, err.message);
      throw err;
    }
  }

  /**
   * 私有方法：服务不可用响应
   */
  _serviceNotAvailable(res, serviceName) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        success: false,
        message: `${serviceName} 服务未启用`,
        service: serviceName
      })
    );
  }

  /**
   * 私有方法：健康检查处理
   */
  _handleHealth(res) {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        telegram: !!this.serviceFactory.getService('telegram'),
        psHistory: !!this.serviceFactory.getService('psHistory'),
        fileService: !!this.serviceFactory.getService('fileService')
      },
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024), // MB
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      }
    };

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(health));
  }

  /**
   * 私有方法：性能指标处理
   */
  _handleMetrics(res) {
    const cacheStats = globalCache.getGlobalStats();

    // 获取性能收集器数据（如果可用）
    let perfMetrics = {};
    if (this.perfCollector) {
      perfMetrics = this.perfCollector.getReport();
    }

    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      
      // 请求指标（来自性能收集器）
      ...(this.perfCollector && {
        requests: perfMetrics.requests,
        requestsHealth: this.perfCollector.getHealthStatus()
      }),

      // 进程指标
      process: {
        memory: {
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024)
        },
        cpu: {
          uptime: Math.round(process.cpuUsage().user / 1000000),
          user: Math.round(process.cpuUsage().user / 1000000),
          system: Math.round(process.cpuUsage().system / 1000000)
        }
      },

      // 缓存指标
      cache: {
        ...cacheStats,
        namespaces: {
          markdown: globalCache.getStats('markdown'),
          directory: globalCache.getStats('directory')
        }
      },

      // WebSocket 指标
      ...(this.wsManager && {
        websocket: this.wsManager.getStats()
      })
    };

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(metrics, null, 2));
  }

  /**
   * 私有方法：WebSocket 信息处理
   */
  _handleWebSocketInfo(res) {
    if (!this.wsManager) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: 'WebSocket 管理器未初始化' }));
      return;
    }

    const wsInfo = {
      status: 'connected',
      timestamp: new Date().toISOString(),
      stats: this.wsManager.getStats(),
      channels: this.wsManager.listChannels(),
      clients: this.wsManager.listClients()
    };

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(wsInfo, null, 2));
  }
}

module.exports = Router;
