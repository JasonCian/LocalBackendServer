/**
 * 文件系统监听服务
 * 
 * 实时监听配置的目录变化，并通过 WebSocket 推送事件
 * 支持文件上传、删除、修改事件
 */

const fs = require('fs');
const path = require('path');

/**
 * 文件观察器类
 */
class FileWatcherService {
  constructor(config, appRoot, logger, wsManager) {
    this.config = config;
    this.appRoot = appRoot;
    this.logger = logger;
    this.wsManager = wsManager;
    
    // 监听的目录映射：dirPath -> watcher
    this.watchers = new Map();
    
    // 文件系统事件缓冲（避免重复触发）
    this.eventBuffer = new Map(); // path -> { timer, event }
    this.debounceDelay = 500; // 500ms 去重延迟
    
    // 初始化监听
    this.initializeWatchers();
  }

  /**
   * 初始化所有配置的监听目录
   */
  initializeWatchers() {
    const fileService = this.config.services && this.config.services.fileService;
    if (!fileService || !fileService.enabled || !fileService.directories) {
      this.logger('INFO', '文件监听服务：未配置监听目录');
      return;
    }

    const dirs = fileService.directories;
    if (!Array.isArray(dirs)) {
      this.logger('WARN', '文件监听服务：directories 不是数组');
      return;
    }

    for (const dir of dirs) {
      if (typeof dir !== 'string') continue;
      
      const fullPath = path.resolve(this.appRoot, dir);
      
      // 检查目录是否存在
      if (!fs.existsSync(fullPath)) {
        this.logger('WARN', `文件监听服务：目录不存在 ${fullPath}`);
        continue;
      }

      if (!fs.statSync(fullPath).isDirectory()) {
        this.logger('WARN', `文件监听服务：路径不是目录 ${fullPath}`);
        continue;
      }

      this.startWatcher(fullPath, dir);
    }

    this.logger('INFO', `文件监听服务：已启动 ${this.watchers.size} 个监听器`);
  }

  /**
   * 启动单个目录的监听
   * 
   * @param {string} fullPath - 完整路径
   * @param {string} displayPath - 显示路径（用于日志和推送）
   */
  startWatcher(fullPath, displayPath) {
    if (this.watchers.has(fullPath)) {
      return; // 已存在
    }

    try {
      const watcher = fs.watch(fullPath, { recursive: true }, (eventType, filename) => {
        this.handleFileChange(fullPath, displayPath, eventType, filename);
      });

      watcher.on('error', (err) => {
        this.logger('ERROR', `文件监听器错误 ${displayPath}`, err.message);
        this.watchers.delete(fullPath);
      });

      this.watchers.set(fullPath, watcher);
      this.logger('INFO', `文件监听服务：已启动监听 ${displayPath}`);
    } catch (err) {
      this.logger('ERROR', `启动文件监听失败 ${displayPath}`, err.message);
    }
  }

  /**
   * 处理文件变化事件
   * 
   * @param {string} basePath - 基路径
   * @param {string} displayPath - 显示路径
   * @param {string} eventType - 事件类型 (rename/change)
   * @param {string} filename - 文件名
   */
  handleFileChange(basePath, displayPath, eventType, filename) {
    if (!filename) return;

    const fullPath = path.join(basePath, filename);
    const bufferKey = fullPath;

    // 清除旧的缓冲事件
    if (this.eventBuffer.has(bufferKey)) {
      clearTimeout(this.eventBuffer.get(bufferKey).timer);
    }

    // 去重延迟处理
    const timer = setTimeout(() => {
      try {
        const stat = this._tryStatSync(fullPath);
        const action = this._determineAction(stat, fullPath);

        const eventData = {
          path: displayPath + '/' + filename.replace(/\\/g, '/'),
          action: action,
          eventType: eventType,
          timestamp: new Date().toISOString(),
          size: stat ? stat.size : 0,
          isFile: stat ? stat.isFile() : false,
          mtime: stat ? stat.mtimeMs : 0
        };

        // 推送到 WebSocket 订阅者
        if (this.wsManager) {
          this.wsManager.publish('files.changed', eventData);
        }

        this.logger(
          'INFO',
          `文件变化: ${action} ${eventData.path}`,
          `(${eventType})`
        );
      } catch (err) {
        this.logger('WARN', '文件变化处理异常', err.message);
      }

      this.eventBuffer.delete(bufferKey);
    }, this.debounceDelay);

    this.eventBuffer.set(bufferKey, { timer, event: eventType });
  }

  /**
   * 安全的 stat 操作（不抛出异常）
   */
  _tryStatSync(filePath) {
    try {
      return fs.statSync(filePath);
    } catch (e) {
      return null;
    }
  }

  /**
   * 根据文件状态判断操作类型
   * 
   * @param {fs.Stats|null} stat - 文件状态或null
   * @param {string} filePath - 文件路径
   * @returns {string} 操作类型 (create/modify/delete/unknown)
   */
  _determineAction(stat, filePath) {
    if (!stat) {
      // 文件不存在 -> 删除
      return 'delete';
    }

    if (stat.isFile()) {
      // 文件存在且大小 > 0 -> 判断为修改
      // (新创建的文件立即被写入也算 'modify')
      return 'modify';
    }

    if (stat.isDirectory()) {
      // 目录创建或变化
      return 'dir_change';
    }

    return 'unknown';
  }

  /**
   * 停止所有监听器
   */
  async shutdown() {
    for (const watcher of this.watchers.values()) {
      try {
        watcher.close();
      } catch (err) {
        this.logger('WARN', '关闭文件监听器异常', err.message);
      }
    }

    // 清空缓冲计时器
    for (const { timer } of this.eventBuffer.values()) {
      clearTimeout(timer);
    }

    this.watchers.clear();
    this.eventBuffer.clear();
    this.logger('INFO', '文件监听服务已关闭');
  }

  /**
   * 获取监听服务统计信息
   */
  getStats() {
    return {
      watchersCount: this.watchers.size,
      bufferedEvents: this.eventBuffer.size,
      debounceDelay: this.debounceDelay
    };
  }
}

module.exports = FileWatcherService;
