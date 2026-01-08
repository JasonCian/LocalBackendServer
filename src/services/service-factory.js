/**
 * 服务工厂 - 统一管理服务的初始化和生命周期
 * 
 * 功能：
 * - 集中初始化所有服务
 * - 统一错误处理
 * - 支持条件初始化
 * - 提供服务生命周期挂钩
 */

const TelegramService = require('./telegram/telegram-service');
const PowerShellHistoryService = require('./powershell-history/powershell-history');
const FileService = require('./file-service/file-service');
const FileWatcherService = require('./file-watcher-service');
const { notifyAll } = require('./notification-service');

/**
 * 服务工厂类
 */
class ServiceFactory {
  constructor(config, appRoot, logger, wsManager) {
    this.config = config;
    this.appRoot = appRoot;
    this.logger = logger;
    this.wsManager = wsManager;
    this.services = {};
    this.serviceInstances = {};
  }

  /**
   * 初始化所有已启用的服务
   * @returns {Object} 初始化结果 { telegram, psHistory, fileService, errors }
   */
  async initializeAll() {
    const results = {
      telegram: null,
      psHistory: null,
      fileService: null,
      fileWatcher: null,
      errors: []
    };

    // 初始化 Telegram 服务
    try {
      if (this._isServiceEnabled('telegram')) {
        results.telegram = this._initTelegram();
      }
    } catch (err) {
      const errMsg = `Telegram 服务初始化失败: ${err.message}`;
      this.logger('ERROR', errMsg, err.stack);
      results.errors.push({ service: 'telegram', error: err });
    }

    // 初始化 PowerShell History 服务
    try {
      if (this._isServiceEnabled('powershellHistory')) {
        results.psHistory = this._initPowerShellHistory();
      }
    } catch (err) {
      const errMsg = `PowerShell History 服务初始化失败: ${err.message}`;
      this.logger('ERROR', errMsg, err.stack);
      results.errors.push({ service: 'powershellHistory', error: err });
    }

    // 初始化文件服务
    try {
      if (this._isServiceEnabled('fileService')) {
        results.fileService = this._initFileService();
      }
    } catch (err) {
      const errMsg = `文件服务初始化失败: ${err.message}`;
      this.logger('ERROR', errMsg, err.stack);
      results.errors.push({ service: 'fileService', error: err });
    }

    // 初始化文件监听服务
    try {
      if (this._isServiceEnabled('fileService')) {
        results.fileWatcher = this._initFileWatcher();
      }
    } catch (err) {
      const errMsg = `文件监听服务初始化失败: ${err.message}`;
      this.logger('ERROR', errMsg, err.stack);
      results.errors.push({ service: 'fileWatcher', error: err });
    }

    return results;
  }

  /**
   * 私有方法：检查服务是否启用
   */
  _isServiceEnabled(serviceName) {
    const services = this.config.services;
    if (!services) return false;

    switch (serviceName) {
      case 'telegram':
        return (
          services.telegram &&
          services.telegram.enabled === true &&
          services.telegram.apiId &&
          services.telegram.apiHash
        );
      case 'powershellHistory':
        return (
          services.powershellHistory &&
          services.powershellHistory.enabled === true
        );
      case 'fileService':
        return (
          services.fileService &&
          services.fileService.enabled === true
        );
      default:
        return false;
    }
  }

  /**
   * 私有方法：初始化 Telegram 服务
   */
  _initTelegram() {
    const telegramConfig = this.config.services.telegram;

    const service = new TelegramService(
      telegramConfig,
      this.appRoot,
      this.logger,
      async (title, detail) => {
        // Telegram 事件通知回调
        const notificationConfig =
          this.config.services && this.config.services.notifications;
        if (notificationConfig) {
          try {
            await notifyAll(
              notificationConfig,
              title,
              detail,
              this.logger
            );
          } catch (err) {
            this.logger(
              'WARN',
              'Telegram 事件通知发送失败',
              err.message
            );
          }
        }
      },
      this.wsManager
    );

    this.serviceInstances.telegram = service;
    this.logger('INFO', '✅ Telegram 服务初始化成功');

    return service;
  }

  /**
   * 私有方法：初始化 PowerShell History 服务
   */
  _initPowerShellHistory() {
    const psConfig = this.config.services.powershellHistory;

    const service = new PowerShellHistoryService(
      psConfig,
      this.appRoot,
      this.logger
    );

    // 启动实时监听
    service.start();
    this.serviceInstances.psHistory = service;
    this.logger('INFO', '✅ PowerShell History 服务初始化成功，已启动实时监听');

    return service;
  }

  /**
   * 私有方法：初始化文件服务
   */
  _initFileService() {
    const service = new FileService(
      this.config,
      this.appRoot,
      this.logger
    );

    this.serviceInstances.fileService = service;
    this.logger('INFO', '✅ 文件服务初始化成功');

    return service;
  }

  /**
   * 私有方法：初始化文件监听服务
   */
  _initFileWatcher() {
    const service = new FileWatcherService(
      this.config,
      this.appRoot,
      this.logger,
      this.wsManager
    );

    this.serviceInstances.fileWatcher = service;
    this.logger('INFO', '✅ 文件监听服务初始化成功');

    return service;
  }

  /**
   * 获取指定服务实例
   */
  getService(serviceName) {
    return this.serviceInstances[serviceName] || null;
  }

  /**
   * 获取服务的挂载点
   */
  getServiceMount(serviceName) {
    const services = this.config.services;
    if (!services) return null;

    switch (serviceName) {
      case 'telegram':
        return (services.telegram && services.telegram.mount) || '/telegram';
      case 'powershellHistory':
        return (services.powershellHistory && services.powershellHistory.mount) || '/powershell';
      case 'fileService':
        return (services.fileService && services.fileService.mount) || '/file';
      default:
        return null;
    }
  }

  /**
   * 关闭所有服务
   */
  async shutdown() {
    const psHistory = this.serviceInstances.psHistory;
    if (psHistory && typeof psHistory.stop === 'function') {
      try {
        psHistory.stop();
        this.logger('INFO', '✅ PowerShell History 服务已停止');
      } catch (err) {
        this.logger('WARN', 'PowerShell History 服务停止失败', err.message);
      }
    }

    // 关闭文件监听服务
    const fileWatcher = this.serviceInstances.fileWatcher;
    if (fileWatcher && typeof fileWatcher.shutdown === 'function') {
      try {
        await fileWatcher.shutdown();
        this.logger('INFO', '✅ 文件监听服务已停止');
      } catch (err) {
        this.logger('WARN', '文件监听服务停止失败', err.message);
      }
    }

    // 其他服务的清理逻辑可在此扩展
  }

  /**
   * 获取服务初始化摘要
   */
  getSummary() {
    const summary = [];
    
    if (this.serviceInstances.telegram) {
      summary.push('• Telegram 多账号管理');
    }
    if (this.serviceInstances.psHistory) {
      summary.push('• PowerShell 历史管理');
    }
    if (this.serviceInstances.fileService) {
      summary.push('• 文件服务');
    }

    return summary.length > 0
      ? '已启用服务:\n' + summary.join('\n')
      : '未启用额外服务';
  }
}

module.exports = ServiceFactory;
