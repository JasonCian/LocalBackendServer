/**
 * PowerShell 命令历史管理服务
 * 
 * 功能：
 * - 实时监听PSReadLine历史文件变化
 * - 应用隐私过滤规则
 * - 维护带时间戳的历史记录
 * - 快捷指令库（直接写入历史文件供Tab补全）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const HistoryFilter = require('./history-filter');
const HistoryWatcher = require('./history-watcher');
const HistoryRecordManager = require('./history-record-manager');
const QuickCommandManager = require('./quick-command-manager');

/**
 * PowerShell 历史管理服务类
 */
class PowerShellHistoryService {
  constructor(config, appRoot, logger) {
    this.config = config;
    this.appRoot = appRoot;
    this.logger = logger;
    
    // 初始化路径
    this.historyFile = this.config.historyPath || this.getPSHistoryPath();
    this.rulesFile = path.resolve(appRoot, this.config.rulesFile || './data/ps-history-config.json');
    this.dataDir = path.resolve(appRoot, './data');
    this.backupFile = path.resolve(appRoot, './data/ps-history-backup.json');
    
    // 加载规则配置
    this.rulesConfig = this.loadRulesConfig();
    this.filter = new HistoryFilter(this.rulesConfig.rules);
    
    // 初始化历史记录管理器（带时间戳，传递 PSReadLine 历史文件路径）
    this.recordManager = new HistoryRecordManager(this.dataDir, this.historyFile, logger);
    
    // 初始化快捷指令管理器
    this.quickCommandManager = new QuickCommandManager(this.historyFile, this.dataDir, logger);
    
    // 初始化历史文件监听器
    this.watcher = new HistoryWatcher(
      this.historyFile,
      logger,
      (command) => this.handleNewCommand(command)
    );
    
    // 首次初始化：从 PSReadLine 历史文件加载所有条目
    this.recordManager.initializeFromPSHistory(this.historyFile);

    // 在启动监听前，确保快捷指令位于历史文件头
    this.ensureQuickCommandsPinned();

    logger('INFO', 'PowerShell历史服务初始化成功', `历史文件: ${this.historyFile}`);
  }
  
  /**
   * 处理新增的指令
   */
  handleNewCommand(command) {
    try {
      // 🔍 调试日志：捕获到新指令
      this.logger('INFO', '🔍 [DEBUG] 捕获到新指令', `原始指令: "${command}"`);
      
      // 应用过滤规则
      const filterResult = this.filter.filterCommand(command);
      
      // 🔍 调试日志：过滤结果
      this.logger('INFO', '🔍 [DEBUG] 过滤结果', JSON.stringify({
        mask: filterResult.mask || false,
        remove: filterResult.remove || false,
        maskMode: filterResult.maskMode,
        maskedCommand: filterResult.maskedCommand
      }));
      
      let status = 'normal';
      let reason = null;
      let commandToRecord = command; // 默认记录原始指令
      
      if (filterResult.mask) {
        // 根据掩盖强度设置不同的状态
        if (filterResult.maskMode === 'weak') {
          status = 'weak_masked';
          reason = `隐私规则（弱掩盖）：${filterResult.maskReason || '部分内容已隐藏'}`;
        } else {
          status = 'strong_masked';
          reason = `隐私规则（强掩盖）：${filterResult.maskReason || '指令已掩盖'}`;
        }
        // 替换history文件中的指令为掩盖版本
        const masked = filterResult.maskedCommand || '[MASKED]';
        
        // � 隐私保护：记录掩盖后的指令，而不是原始敏感信息
        commandToRecord = masked;
        
        // �🔍 调试日志：准备替换
        this.logger('INFO', '🔍 [DEBUG] 准备替换历史文件', `"${command}" -> "${masked}"`);
        
        this.replaceCommandInHistory(command, masked);
        
        // 🔍 调试日志：替换完成
        this.logger('INFO', '🔍 [DEBUG] 历史文件替换完成', `status: ${status}`);
      }
      
      // 🔍 调试日志：准备记录到数据库
      this.logger('INFO', '🔍 [DEBUG] 准备记录到历史管理器', `指令: "${commandToRecord}", status: ${status}, reason: ${reason || 'none'}`);
      
      // 记录到历史记录管理器（🔒 保存掩盖后的指令，保护隐私）
      this.recordManager.addCommand(commandToRecord, status, reason);
      
      // 🔍 调试日志：记录完成
      this.logger('INFO', '🔍 [DEBUG] 历史管理器记录完成', `总记录数: ${this.recordManager.getAll().length}`);
      
      // 触发事件，通知前端有新指令
      if (this.onNewCommand) {
        this.onNewCommand(command, status, reason);
      }
    } catch (err) {
      this.logger('ERROR', '处理新指令失败', err.message);
    }
  }
  
  /**
   * 启动监听
   */
  start() {
    this.watcher.start();
    this.logger('INFO', 'PowerShell历史监听已启动');
  }
  
  /**
   * 停止监听
   */
  stop() {
    this.watcher.stop();
    this.logger('INFO', 'PowerShell历史监听已停止');
  }

  /**
   * 获取PowerShell历史文件路径
   * 
   * @returns {string} 历史文件路径
   */
  getPSHistoryPath() {
    // Windows: %APPDATA%\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt
    const appData = process.env.APPDATA;
    if (!appData) {
      throw new Error('无法获取APPDATA路径');
    }
    return path.join(appData, 'Microsoft', 'Windows', 'PowerShell', 'PSReadLine', 'ConsoleHost_history.txt');
  }

  /**
   * 加载规则配置
   * 
   * @returns {Object} 规则配置
   */
  loadRulesConfig() {
    try {
      if (fs.existsSync(this.rulesFile)) {
        const data = fs.readFileSync(this.rulesFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      this.logger('ERROR', '加载规则配置失败', err.message);
    }
    
    // 返回默认配置
    return {
      rules: [],
      dedupConfig: {
        enabled: true,
        patterns: [
          '^(ls|dir|cd|pwd)\\s*$',
          '^(cls|clear)\\s*$'
        ]
      }
    };
  }

  /**
   * 保存规则配置
   */
  saveRulesConfig() {
    try {
      const dir = path.dirname(this.rulesFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.rulesFile, JSON.stringify(this.rulesConfig, null, 2), 'utf8');
      this.filter.updateRules(this.rulesConfig.rules);
    } catch (err) {
      this.logger('ERROR', '保存规则配置失败', err.message);
      throw err;
    }
  }

  /**
   * 读取原始历史
   * 
   * @returns {Array} 命令列表
   */
  readRawHistory() {
    try {
      if (!fs.existsSync(this.historyFile)) {
        return [];
      }
      
      const content = fs.readFileSync(this.historyFile, 'utf8');
      const lines = content.split('\n').map(line => line.trim()).filter(line => line);
      
      return lines;
    } catch (err) {
      this.logger('ERROR', '读取历史文件失败', err.message);
      return [];
    }
  }

  /**
   * 应用过滤规则
   * 
   * @param {Array} commands - 命令列表
   * @returns {Object} {filtered, removed, masked}
   */
  applyFilters(commands) {
    const result = this.filter.applyFilters(commands);
    
    // 应用去重
    result.filtered = this.filter.deduplicate(result.filtered, this.rulesConfig.dedupConfig);
    
    return result;
  }

  /**
   * 获取已过滤的历史
   * 
   * @param {number} limit - 返回数量限制
   * @returns {Object} {history, stats}
   */
  getFilteredHistory(limit = null) {
    const raw = this.readRawHistory();
    const result = this.applyFilters(raw);
    
    const history = limit ? result.filtered.slice(-limit) : result.filtered;
    
    return {
      history,
      stats: {
        total: raw.length,
        filtered: result.filtered.length,
        removed: result.removed.length,
        masked: result.masked.length
      },
      removed: result.removed,
      masked: result.masked
    };
  }

  /**
   * 确保快捷指令固定在历史文件头部
   */
  ensureQuickCommandsPinned() {
    try {
      const quickCommands = this.quickCommandManager.getAll();
      if (!quickCommands || quickCommands.length === 0) {
        return;
      }

      const quickList = quickCommands.map(q => q.command);
      const quickSet = new Set(quickList);

      // 确保历史文件存在
      const historyDir = path.dirname(this.historyFile);
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }

      const existing = fs.existsSync(this.historyFile)
        ? fs.readFileSync(this.historyFile, 'utf8').split('\n').filter(l => l !== '')
        : [];

      // 去重后将快捷指令置顶
      const rest = existing.filter(line => !quickSet.has(line.trim()));
      const newLines = [...quickList, ...rest];
      const newContent = newLines.join('\n') + '\n';

      const previousContent = fs.existsSync(this.historyFile)
        ? fs.readFileSync(this.historyFile, 'utf8')
        : '';

      if (newContent !== previousContent) {
        fs.writeFileSync(this.historyFile, newContent, 'utf8');
        this.logger('INFO', '已固定快捷指令到历史文件头部', `快捷指令数: ${quickList.length}`);
      }

      // 确保记录管理器中的对应记录标记为快捷指令
      const existingRecords = this.recordManager.getAll();
      const quickRecordSet = new Set(existingRecords.filter(r => r.status === 'shortcut').map(r => r.command));
      quickList.forEach(cmd => {
        if (!quickRecordSet.has(cmd)) {
          this.recordManager.addCommand(cmd, 'shortcut', '快捷指令（固定到历史头部）');
        } else {
          // 已存在但可能被标成其他状态，统一更新为快捷指令
          this.recordManager.addCommand(cmd, 'shortcut', '快捷指令（固定到历史头部）');
        }
      });
    } catch (err) {
      this.logger('ERROR', '校验快捷指令头部失败', err.message);
    }
  }

  /**
   * 清理历史（应用规则并写回）
   * 
   * @returns {Object} 清理结果
   */
  cleanHistory() {
    try {
      // 备份原始历史
      this.backupHistory();
      
      const raw = this.readRawHistory();
      const result = this.applyFilters(raw);
      
      // 写回清理后的历史
      const content = result.filtered.join('\n') + '\n';
      fs.writeFileSync(this.historyFile, content, 'utf8');

      // 清理后重新固定快捷指令到文件头
      this.ensureQuickCommandsPinned();

      this.logger('INFO', 'PowerShell历史清理完成', `移除: ${result.removed.length}, 掩盖: ${result.masked.length}`);
      
      return {
        success: true,
        original: raw.length,
        cleaned: result.filtered.length,
        removed: result.removed.length,
        masked: result.masked.length,
        removedCommands: result.removed,
        maskedCommands: result.masked
      };
    } catch (err) {
      this.logger('ERROR', 'PowerShell历史清理失败', err.message);
      throw err;
    }
  }

  /**
   * 备份历史
   */
  backupHistory() {
    try {
      const raw = this.readRawHistory();
      const backup = {
        timestamp: new Date().toISOString(),
        count: raw.length,
        history: raw
      };
      
      const dir = path.dirname(this.backupFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.backupFile, JSON.stringify(backup, null, 2), 'utf8');
      this.logger('INFO', 'PowerShell历史备份完成', `条目: ${raw.length}`);
    } catch (err) {
      this.logger('ERROR', 'PowerShell历史备份失败', err.message);
    }
  }

  /**
   * 获取统计信息
   * 
   * @returns {Object} 统计数据
   */
  getStatistics() {
    const raw = this.readRawHistory();
    const result = this.applyFilters(raw);
    
    // 规则统计
    const ruleStats = this.rulesConfig.rules.map(rule => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      action: rule.action,
      matches: result.removed.filter(r => r.ruleId === rule.id).length +
               result.masked.filter(m => m.ruleId === rule.id).length
    }));
    
    // 快捷指令统计
    const topShortcuts = this.shortcuts.getTopShortcuts(10);
    
    return {
      history: {
        total: raw.length,
        filtered: result.filtered.length,
        removed: result.removed.length,
        masked: result.masked.length
      },
      rules: {
        total: this.rulesConfig.rules.length,
        enabled: this.rulesConfig.rules.filter(r => r.enabled).length,
        stats: ruleStats
      },
      shortcuts: {
        total: this.shortcuts.getAll().length,
        categories: this.shortcuts.getCategories().length,
        topUsed: topShortcuts
      }
    };
  }

  /**
   * 获取规则列表
   * 
   * @returns {Array} 规则列表
   */
  getRules() {
    return this.rulesConfig.rules;
  }

  /**
   * 添加规则
   * 
   * @param {Object} rule - 规则对象
   * @returns {Object} 新创建的规则
   */
  addRule(rule) {
    const newRule = {
      id: 'rule-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
      name: rule.name,
      pattern: rule.pattern,
      type: rule.type || 'keyword',
      action: rule.action || 'remove',
      enabled: rule.enabled !== false
    };
    
    this.rulesConfig.rules.push(newRule);
    this.saveRulesConfig();
    
    return newRule;
  }

  /**
   * 更新规则
   * 
   * @param {string} id - 规则ID
   * @param {Object} updates - 更新数据
   * @returns {Object} 更新后的规则
   */
  updateRule(id, updates) {
    const rule = this.rulesConfig.rules.find(r => r.id === id);
    if (!rule) {
      throw new Error('规则不存在');
    }
    
    Object.assign(rule, updates, { id: rule.id }); // 保持ID不变
    this.saveRulesConfig();
    
    return rule;
  }

  /**
   * 删除规则
   * 
   * @param {string} id - 规则ID
   * @returns {boolean} 是否删除成功
   */
  deleteRule(id) {
    const index = this.rulesConfig.rules.findIndex(r => r.id === id);
    if (index === -1) {
      return false;
    }
    
    this.rulesConfig.rules.splice(index, 1);
    this.saveRulesConfig();
    
    return true;
  }

  /**
   * 测试规则
   * 
   * @param {string} command - 命令
   * @param {string} ruleId - 规则ID
   * @returns {Object} 测试结果
   */
  testRule(command, ruleId) {
    return this.filter.testRule(command, ruleId);
  }
  
  /**
   * 从历史文件中移除指定指令
   */
  removeCommandFromHistory(command) {
    try {
      if (!fs.existsSync(this.historyFile)) return;
      
      const content = fs.readFileSync(this.historyFile, 'utf8');
      const lines = content.split('\n');
      const filtered = lines.filter(line => line.trim() !== command.trim());
      const newContent = filtered.join('\n');
      
      fs.writeFileSync(this.historyFile, newContent, 'utf8');
    } catch (err) {
      this.logger('ERROR', '移除历史指令失败', err.message);
    }
  }
  
  /**
   * 替换历史文件中的指令
   */
  replaceCommandInHistory(oldCommand, newCommand) {
    try {
      if (!fs.existsSync(this.historyFile)) return;
      
      const content = fs.readFileSync(this.historyFile, 'utf8');
      const lines = content.split('\n');
      const replaced = lines.map(line => 
        line.trim() === oldCommand.trim() ? newCommand : line
      );
      const newContent = replaced.join('\n');
      
      fs.writeFileSync(this.historyFile, newContent, 'utf8');
    } catch (err) {
      this.logger('ERROR', '替换历史指令失败', err.message);
    }
  }
  
  /**
   * 获取历史记录（带时间戳）
   */
  getHistoryRecords(limit = null) {
    const all = this.recordManager.getAll();
    return limit ? all.slice(-limit) : all;
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      records: this.recordManager.getStats(),
      quickCommands: this.quickCommandManager.getAll().length,
      rules: this.rulesConfig.rules.length
    };
  }
  
  /**
   * 添加快捷指令
   */
  addQuickCommand(command, category = 'custom', description = '') {
    const result = this.quickCommandManager.addCommand(command, category, description);
    
    // 快捷指令已前置插入到历史文件头，需要增加监听器的行数计数，避免被当作新指令触发
    if (result) {
      this.watcher.increaseLineCount(1);
      
      // 同时记录快捷指令到历史管理器（带快捷指令状态）
      this.recordManager.addCommand(command, 'shortcut', `快捷指令（分类：${category}）`);
    }
    
    // 确保快捷指令仍在文件头部
    this.ensureQuickCommandsPinned();

    return result;
  }
  
  /**
   * 删除快捷指令
   */
  deleteQuickCommand(id) {
    // ⚠️ 先获取要删除的快捷指令信息（删除前）
    const targetCommand = this.quickCommandManager.getAll().find(cmd => cmd.id === id);
    
    // 执行删除操作
    const result = this.quickCommandManager.deleteCommand(id);
    
    // 删除成功时，从历史管理器中也删除对应的快捷指令记录
    if (result && targetCommand) {
      // 查询历史记录中对应的快捷指令记录
      const allRecords = this.recordManager.getAll();
      const shortcutRecord = allRecords.find(r => 
        r.status === 'shortcut' && 
        r.command === targetCommand.command
      );
      
      // 如果找到对应的快捷指令记录，删除它
      if (shortcutRecord) {
        this.recordManager.deleteCommand(shortcutRecord.id);
      }
    }
    
    return result;
  }
  
  /**
   * 获取所有快捷指令
   */
  getQuickCommands() {
    return this.quickCommandManager.getAll();
  }
  
  /**
   * 按分类获取快捷指令
   */
  getQuickCommandsByCategory(category) {
    return this.quickCommandManager.getByCategory(category);
  }
  
  /**
   * 获取快捷指令分类
   */
  getQuickCommandCategories() {
    return this.quickCommandManager.getCategories();
  }
  
  /**
   * 编辑历史记录
   */
  editHistoryRecord(id, newCommand) {
    return this.recordManager.editCommand(id, newCommand);
  }
  
  /**
   * 删除历史记录
   */
  deleteHistoryRecord(id) {
    return this.recordManager.deleteCommand(id);
  }
}

module.exports = PowerShellHistoryService;
