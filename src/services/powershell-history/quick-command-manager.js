/**
 * PowerShell 快捷指令管理器
 * 
 * 功能：
 * - 管理快捷指令库
 * - 将快捷指令写入PowerShell历史文件
 * - 这样PowerShell的Tab补全就能找到这些指令
 */

const fs = require('fs');
const path = require('path');

/**
 * 快捷指令类
 */
class QuickCommandManager {
  constructor(historyFilePath, dataDir, logger) {
    this.historyFilePath = historyFilePath;
    this.dataDir = dataDir;
    this.logger = logger;
    this.commandsFile = path.join(dataDir, 'ps-quick-commands.json');
    this.commands = [];
    
    // 确保目录存在
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    this.loadCommands();
  }
  
  /**
   * 加载快捷指令
   */
  loadCommands() {
    try {
      if (fs.existsSync(this.commandsFile)) {
        const data = fs.readFileSync(this.commandsFile, 'utf8');
        this.commands = JSON.parse(data);
      } else {
        // 初始化默认快捷指令
        this.commands = [
          {
            id: 'git-status',
            command: 'git status',
            category: 'git',
            description: '查看Git状态'
          },
          {
            id: 'git-pull',
            command: 'git pull',
            category: 'git',
            description: '拉取最新代码'
          },
          {
            id: 'git-push',
            command: 'git push',
            category: 'git',
            description: '推送代码'
          },
          {
            id: 'npm-install',
            command: 'npm install',
            category: 'npm',
            description: '安装依赖'
          },
          {
            id: 'npm-start',
            command: 'npm start',
            category: 'npm',
            description: '启动开发服务器'
          },
          {
            id: 'npm-test',
            command: 'npm test',
            category: 'npm',
            description: '运行测试'
          }
        ];
        this.saveCommands();
      }
    } catch (err) {
      this.logger('ERROR', '加载快捷指令失败', err.message);
      this.commands = [];
    }
  }
  
  /**
   * 保存快捷指令到文件
   */
  saveCommands() {
    try {
      fs.writeFileSync(this.commandsFile, JSON.stringify(this.commands, null, 2), 'utf8');
    } catch (err) {
      this.logger('ERROR', '保存快捷指令失败', err.message);
    }
  }
  
  /**
   * 获取所有快捷指令
   */
  getAll() {
    return this.commands;
  }
  
  /**
   * 按分类获取
   */
  getByCategory(category) {
    return this.commands.filter(c => c.category === category);
  }
  
  /**
   * 获取所有分类
   */
  getCategories() {
    const categories = new Set();
    this.commands.forEach(c => categories.add(c.category));
    return Array.from(categories);
  }
  
  /**
   * 添加新快捷指令
   * 
   * @param {string} command - 要添加的PowerShell指令
   * @param {string} category - 分类（如 git, npm, custom 等）
   * @param {string} description - 描述
   * @returns {Object} 新增的快捷指令
   */
  addCommand(command, category = 'custom', description = '') {
    const id = 'cmd-' + Date.now().toString(36);
    
    const newCommand = {
      id: id,
      command: command,
      category: category,
      description: description,
      addedAt: new Date().toISOString()
    };
    
    this.commands.push(newCommand);
    this.saveCommands();
    
    // 立即写入到PowerShell历史文件（这样下次Tab补全就能找到）
    this.addToHistory(command);
    
    this.logger('INFO', 'PowerShell快捷指令已添加', `${command} (${category})`);
    
    return newCommand;
  }
  
  /**
   * 删除快捷指令
   */
  deleteCommand(id) {
    const index = this.commands.findIndex(c => c.id === id);
    if (index !== -1) {
      const cmd = this.commands[index];
      this.commands.splice(index, 1);
      this.saveCommands();
      this.logger('INFO', 'PowerShell快捷指令已删除', cmd.command);
      return true;
    }
    return false;
  }
  
  /**
   * 更新快捷指令
   */
  updateCommand(id, updates) {
    const command = this.commands.find(c => c.id === id);
    if (command) {
      Object.assign(command, updates);
      this.saveCommands();
      return command;
    }
    return null;
  }
  
  /**
   * 将指令添加到PowerShell历史文件
   * 这样PowerShell会记住这个指令，Tab补全时可以找到
   * 
   * @param {string} command - 要添加的指令
   */
  addToHistory(command) {
    try {
      if (fs.existsSync(this.historyFilePath)) {
        // 读取现有内容
        let content = fs.readFileSync(this.historyFilePath, 'utf8');
        
        // 前置插入新指令到文件头（方便 Tab 补全）
        content = command + '\n' + content;
        
        // 写入回文件
        fs.writeFileSync(this.historyFilePath, content, 'utf8');
        
        this.logger('INFO', '快捷指令已前置插入历史文件头', command);
      } else {
        // 如果历史文件不存在，创建它
        fs.writeFileSync(this.historyFilePath, command + '\n', 'utf8');
      }
    } catch (err) {
      this.logger('ERROR', '写入快捷指令到历史文件失败', err.message);
    }
  }
  
  /**
   * 搜索快捷指令
   */
  search(keyword) {
    const kw = keyword.toLowerCase();
    return this.commands.filter(c => 
      c.command.toLowerCase().includes(kw) ||
      (c.description && c.description.toLowerCase().includes(kw))
    );
  }
  
  /**
   * 批量导入快捷指令
   */
  importCommands(commandList) {
    const imported = [];
    for (const cmd of commandList) {
      if (cmd.command && cmd.category) {
        const newCmd = this.addCommand(cmd.command, cmd.category, cmd.description || '');
        imported.push(newCmd);
      }
    }
    return imported;
  }
}

module.exports = QuickCommandManager;
