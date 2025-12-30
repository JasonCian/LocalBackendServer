/**
 * 带时间戳的历史记录管理器
 * 
 * 功能：
 * - 从 PSReadLine 历史文件读取条目
 * - 维护带时间戳的历史记录
 * - 支持编辑、删除、应用隐私过滤规则
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 历史记录项目接口
 * @typedef {Object} HistoryEntry
 * @property {string} id - 唯一标识（MD5哈希）
 * @property {string} command - 指令内容
 * @property {string} timestamp - ISO时间戳（记录时间）
 * @property {string} status - 状态: 'normal'|'filtered'|'masked'
 * @property {string} reason - 过滤原因（可选）
 */

class HistoryRecordManager {
  constructor(dataDir, psHistoryFile, logger) {
    this.dataDir = dataDir;
    this.psHistoryFile = psHistoryFile;  // PSReadLine 历史文件路径
    this.logger = logger;
    this.recordFile = path.join(dataDir, 'ps-history-records.json');
    this.records = [];
    
    // 确保目录存在
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    this.loadRecords();
  }
  
  /**
   * 从文件加载历史记录
   */
  loadRecords() {
    try {
      if (fs.existsSync(this.recordFile)) {
        const data = fs.readFileSync(this.recordFile, 'utf8');
        this.records = JSON.parse(data);
      }
    } catch (err) {
      this.logger('ERROR', '加载历史记录失败', err.message);
      this.records = [];
    }
  }
  
  /**
   * 保存历史记录到文件
   */
  saveRecords() {
    try {
      fs.writeFileSync(this.recordFile, JSON.stringify(this.records, null, 2), 'utf8');
    } catch (err) {
      this.logger('ERROR', '保存历史记录失败', err.message);
    }
  }
  
  /**
   * 同步所有记录回 PSReadLine 历史文件
   */
  syncToPSReadLine() {
    try {
      if (!this.psHistoryFile || !fs.existsSync(this.psHistoryFile)) {
        return;
      }
      
      const content = this.records.map(r => r.command).join('\n');
      fs.writeFileSync(this.psHistoryFile, content + '\n', 'utf8');
    } catch (err) {
      this.logger('ERROR', '同步到 PSReadLine 历史文件失败', err.message);
    }
  }
  
  /**
   * 生成记录 ID（基于内容的哈希）
   */
  generateId(command) {
    return crypto.createHash('md5').update(command + Date.now()).digest('hex').substring(0, 12);
  }
  
  /**
   * 初始化 - 从 PSReadLine 历史文件加载所有条目
   * 用当前时间戳记录
   */
  initializeFromPSHistory(psHistoryFile, currentTime = new Date().toISOString()) {
    try {
      if (!fs.existsSync(psHistoryFile)) {
        this.logger('WARN', '未找到 PSReadLine 历史文件', psHistoryFile);
        return [];
      }
      
      const content = fs.readFileSync(psHistoryFile, 'utf8');
      const lines = content.split('\n').map(line => line.trim()).filter(line => line);
      
      // 只加载新命令（不重复）
      const existingCommands = new Set(this.records.map(r => r.command));
      const newRecords = [];
      
      for (const command of lines) {
        if (!existingCommands.has(command)) {
          newRecords.push({
            id: this.generateId(command),
            command,
            timestamp: currentTime,
            status: 'normal',
            reason: null
          });
          existingCommands.add(command);
        }
      }
      
      // 添加到记录并保存
      this.records.push(...newRecords);
      this.saveRecords();
      
      this.logger('INFO', `从 PSReadLine 初始化历史记录`, `新增: ${newRecords.length} 条, 总计: ${this.records.length} 条`);
      
      return newRecords;
    } catch (err) {
      this.logger('ERROR', '初始化历史记录失败', err.message);
      return [];
    }
  }
  
  /**
   * 添加或更新单条命令记录
   */
  addCommand(command, status = 'normal', reason = null) {
    // 检查是否已存在
    const existing = this.records.find(r => r.command === command);
    
    if (existing) {
      // 更新状态和原因
      existing.status = status;
      existing.reason = reason;
    } else {
      // 创建新记录
      this.records.push({
        id: this.generateId(command),
        command,
        timestamp: new Date().toISOString(),
        status,
        reason
      });
    }
    
    this.saveRecords();
    return this.records[this.records.length - 1];
  }
  
  /**
   * 获取所有记录
   */
  getAll() {
    return this.records;
  }
  
  /**
   * 按 ID 获取记录
   */
  getById(id) {
    return this.records.find(r => r.id === id);
  }
  
  /**
   * 按状态过滤
   */
  getByStatus(status) {
    return this.records.filter(r => r.status === status);
  }
  
  /**
   * 搜索
   */
  search(query) {
    const q = query.toLowerCase();
    return this.records.filter(r => r.command.toLowerCase().includes(q));
  }
  
  /**
   * 编辑命令内容
   */
  editCommand(id, newCommand) {
    const record = this.records.find(r => r.id === id);
    if (!record) {
      return null;
    }
    
    record.command = newCommand;
    record.timestamp = new Date().toISOString();
    this.saveRecords();
    this.syncToPSReadLine();  // 同步到 PSReadLine 历史文件
    return record;
  }
  
  /**
   * 删除记录
   */
  deleteCommand(id) {
    const index = this.records.findIndex(r => r.id === id);
    if (index === -1) {
      return false;
    }
    
    this.records.splice(index, 1);
    this.saveRecords();
    this.syncToPSReadLine();  // 同步到 PSReadLine 历史文件
    return true;
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      total: this.records.length,
      normal: this.records.filter(r => r.status === 'normal').length,
      filtered: this.records.filter(r => r.status === 'filtered').length,
      masked: this.records.filter(r => r.status === 'masked').length,
      lastUpdated: this.records.length > 0 
        ? this.records[this.records.length - 1].timestamp 
        : null
    };
  }
  
  /**
   * 清空所有记录
   */
  clear() {
    this.records = [];
    this.saveRecords();
  }
}

module.exports = HistoryRecordManager;
