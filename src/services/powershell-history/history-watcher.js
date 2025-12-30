/**
 * PowerShell 历史文件监听器
 * 
 * 功能：
 * - 定时轮询检查PSReadLine历史文件变化（主动检测，不依赖fs.watch）
 * - 监测新增指令
 * - 实时应用隐私过滤规则
 * - 维护带时间戳的历史记录
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

/**
 * 历史文件监听器类（使用定时轮询而非fs.watch）
 */
class HistoryWatcher extends EventEmitter {
  constructor(historyFilePath, logger, onNewCommand, pollInterval = 1000) {
    super();
    this.historyFilePath = historyFilePath;
    this.logger = logger;
    this.onNewCommand = onNewCommand;
    this.pollInterval = pollInterval; // 轮询间隔（毫秒）
    
    // 已读行数追踪
    this.lastLineCount = 0;
    
    // 定时器
    this.pollTimer = null;
    
    // 是否正在监听
    this.isWatching = false;
    
    // 初始化
    this.initialize();
  }
  
  /**
   * 初始化，获取初始行数
   */
  initialize() {
    try {
      if (fs.existsSync(this.historyFilePath)) {
        const content = fs.readFileSync(this.historyFilePath, 'utf8');
        this.lastLineCount = content.split('\n').filter(line => line.trim()).length;
      }
      this.logger('INFO', 'PowerShell历史监听器初始化完成', `初始行数: ${this.lastLineCount}`);
    } catch (err) {
      this.logger('ERROR', '历史监听器初始化失败', err.message);
    }
  }
  
  /**
   * 开始监听历史文件（使用定时轮询）
   */
  start() {
    if (this.isWatching) return;
    
    try {
      // 使用定时器主动轮询检查文件变化
      this.pollTimer = setInterval(() => {
        this.checkNewCommands();
      }, this.pollInterval);
      
      this.isWatching = true;
      this.logger('INFO', `PowerShell历史文件监听已启动（轮询间隔: ${this.pollInterval}ms）`);
      this.emit('started');
    } catch (err) {
      this.logger('ERROR', '启动历史文件监听失败', err.message);
    }
  }
  
  /**
   * 停止监听
   */
  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isWatching = false;
    this.logger('INFO', 'PowerShell历史文件监听已停止');
    this.emit('stopped');
  }
  
  /**
   * 检查新增的指令
   */
  checkNewCommands() {
    try {
      if (!fs.existsSync(this.historyFilePath)) {
        this.logger('ERROR', 'PowerShell历史文件不存在', this.historyFilePath);
        return;
      }
      
      const content = fs.readFileSync(this.historyFilePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      const currentLineCount = lines.length;
      
      // 调试日志：每次检查都输出（可以后续关闭）
      if (currentLineCount !== this.lastLineCount) {
        this.logger('INFO', `PowerShell历史检查`, `上次: ${this.lastLineCount}, 当前: ${currentLineCount}`);
      }
      
      // 有新指令（只处理追加的指令，前置插入的不处理）
      if (currentLineCount > this.lastLineCount) {
        const newCommands = lines.slice(this.lastLineCount);
        this.logger('INFO', `检测到 ${newCommands.length} 条新指令`);
        
        // 触发事件，将新指令传递给处理器
        newCommands.forEach(cmd => {
          if (cmd.trim()) {
            this.logger('INFO', `📥 [WATCHER] 捕获新指令并传递给处理器: "${cmd.trim()}"`);
            this.onNewCommand(cmd.trim());
            this.logger('INFO', `✅ [WATCHER] 指令已传递给处理器`);
          }
        });
      }
      
      // 无论增加还是减少，都更新行数（支持删除操作）
      this.lastLineCount = currentLineCount;
    } catch (err) {
      // 记录错误而不是忽略
      this.logger('ERROR', 'PowerShell历史检查失败', err.message);
    }
  }
  
  /**
   * 强制刷新检查
   */
  forceCheck() {
    this.checkNewCommands();
  }
  
  /**
   * 手动增加行数计数（用于快捷指令前置插入，避免触发监听）
   * 
   * @param {number} count - 增加的行数
   */
  increaseLineCount(count = 1) {
    this.lastLineCount += count;
    this.logger('INFO', `手动增加行数计数`, `新值: ${this.lastLineCount}`);
  }
}

module.exports = HistoryWatcher;
