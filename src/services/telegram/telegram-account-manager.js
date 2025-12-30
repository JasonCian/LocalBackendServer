/**
 * Telegram 多账号管理器
 * 
 * 功能：
 * - 管理多个 Telegram 账号
 * - 账号会话隔离
 * - 账号信息持久化
 * - 账号状态查询
 */

const fs = require('fs');
const path = require('path');
const TelegramSession = require('./telegram-session');

/**
 * 生成账号 ID
 * 
 * @param {string} phone - 手机号
 * @returns {string} 账号 ID
 */
function makeAccountId(phone) {
  // 使用手机号的哈希作为账号ID（简化版，实际可以用更复杂的哈希）
  return phone.replace(/[^0-9]/g, '');
}

/**
 * Telegram 多账号管理器类
 */
class TelegramAccountManager {
  constructor(config, appRoot, logger) {
    this.config = config;
    this.appRoot = appRoot;
    this.logger = logger;
    
    // 账号文件路径
    this.accountsFile = path.resolve(appRoot, './data/telegram-accounts.json');
    
    // 账号列表 Map: accountId -> { id, phone, name, active, sessionFile }
    this.accounts = new Map();
    
    // 会话实例 Map: accountId -> TelegramSession
    this.sessions = new Map();
    
    // 当前活跃账号 ID
    this.activeAccountId = null;
    
    // 加载账号列表
    this.loadAccounts();
  }
  
  /**
   * 加载账号列表
   */
  loadAccounts() {
    try {
      if (fs.existsSync(this.accountsFile)) {
        const data = fs.readFileSync(this.accountsFile, 'utf8');
        const list = JSON.parse(data);
        if (Array.isArray(list)) {
          list.forEach(acc => {
            this.accounts.set(acc.id, acc);
            if (acc.active) {
              this.activeAccountId = acc.id;
            }
          });
        }
      }
    } catch (e) {
      this.logger('ERROR', '加载账号列表失败', e && e.message);
    }
  }
  
  /**
   * 保存账号列表
   */
  saveAccounts() {
    try {
      const list = Array.from(this.accounts.values());
      fs.writeFileSync(this.accountsFile, JSON.stringify(list, null, 2), 'utf8');
    } catch (e) {
      this.logger('ERROR', '保存账号列表失败', e && e.message);
    }
  }
  
  /**
   * 获取或创建会话实例
   * 
   * @param {string} accountId - 账号 ID
   * @returns {TelegramSession|null}
   */
  getSession(accountId) {
    if (!accountId) {
      accountId = this.activeAccountId;
    }
    
    if (!accountId || !this.accounts.has(accountId)) {
      return null;
    }
    
    // 如果会话已存在，直接返回
    if (this.sessions.has(accountId)) {
      return this.sessions.get(accountId);
    }
    
    // 创建新会话实例
    const account = this.accounts.get(accountId);
    const sessionConfig = {
      ...this.config,
      sessionFile: account.sessionFile
    };
    
    const session = new TelegramSession(sessionConfig, this.appRoot, this.logger);
    this.sessions.set(accountId, session);
    
    return session;
  }
  
  /**
   * 添加新账号
   * 
   * @param {string} phone - 手机号
   * @param {string} name - 账号名称
   * @returns {Object} 账号信息
   */
  addAccount(phone, name) {
    const accountId = makeAccountId(phone);
    
    if (this.accounts.has(accountId)) {
      throw new Error('账号已存在');
    }
    
    const account = {
      id: accountId,
      phone: phone,
      name: name || phone,
      active: this.accounts.size === 0, // 第一个账号自动激活
      sessionFile: `./data/telegram-session-${accountId}.txt`,
      createdAt: new Date().toISOString()
    };
    
    this.accounts.set(accountId, account);
    
    // 如果是第一个账号，设为活跃
    if (account.active) {
      this.activeAccountId = accountId;
    }
    
    this.saveAccounts();
    
    return account;
  }
  
  /**
   * 移除账号
   * 
   * @param {string} accountId - 账号 ID
   * @returns {boolean}
   */
  removeAccount(accountId) {
    if (!this.accounts.has(accountId)) {
      return false;
    }
    
    // 删除会话实例
    if (this.sessions.has(accountId)) {
      this.sessions.delete(accountId);
    }
    
    // 删除会话文件
    const account = this.accounts.get(accountId);
    try {
      const sessionFilePath = path.resolve(this.appRoot, account.sessionFile);
      if (fs.existsSync(sessionFilePath)) {
        fs.unlinkSync(sessionFilePath);
      }
    } catch (e) {
      this.logger('ERROR', '删除会话文件失败', e && e.message);
    }
    
    // 删除账号
    this.accounts.delete(accountId);
    
    // 如果删除的是活跃账号，选择新的活跃账号
    if (this.activeAccountId === accountId) {
      const first = this.accounts.values().next().value;
      this.activeAccountId = first ? first.id : null;
      if (first) {
        first.active = true;
      }
    }
    
    this.saveAccounts();
    
    return true;
  }
  
  /**
   * 切换活跃账号
   * 
   * @param {string} accountId - 账号 ID
   * @returns {boolean}
   */
  switchAccount(accountId) {
    if (!this.accounts.has(accountId)) {
      return false;
    }
    
    // 取消所有账号的活跃状态
    for (const acc of this.accounts.values()) {
      acc.active = false;
    }
    
    // 设置新的活跃账号
    const account = this.accounts.get(accountId);
    account.active = true;
    this.activeAccountId = accountId;
    
    this.saveAccounts();
    
    return true;
  }
  
  /**
   * 获取所有账号列表
   * 
   * @returns {Array}
   */
  getAllAccounts() {
    return Array.from(this.accounts.values());
  }
  
  /**
   * 获取活跃账号
   * 
   * @returns {Object|null}
   */
  getActiveAccount() {
    return this.activeAccountId ? this.accounts.get(this.activeAccountId) : null;
  }
  
  /**
   * 获取账号信息
   * 
   * @param {string} accountId - 账号 ID
   * @returns {Object|null}
   */
  getAccount(accountId) {
    return this.accounts.get(accountId) || null;
  }
  
  /**
   * 更新账号信息
   * 
   * @param {string} accountId - 账号 ID
   * @param {Object} updates - 更新数据
   * @returns {Object|null}
   */
  updateAccount(accountId, updates) {
    if (!this.accounts.has(accountId)) {
      return null;
    }
    
    const account = this.accounts.get(accountId);
    
    // 只允许更新特定字段
    if (updates.name !== undefined) {
      account.name = updates.name;
    }
    
    this.saveAccounts();
    
    return account;
  }
  
  /**
   * 获取所有账号的健康状态
   * 
   * @returns {Promise<Array>}
   */
  async getAllAccountsHealth() {
    const result = [];
    
    for (const account of this.accounts.values()) {
      try {
        const session = this.getSession(account.id);
        if (session) {
          const health = await session.getHealth();
          result.push({
            ...account,
            health
          });
        } else {
          result.push({
            ...account,
            health: { mode: 'unknown', connected: false, authorized: false }
          });
        }
      } catch (e) {
        result.push({
          ...account,
          health: { mode: 'error', connected: false, authorized: false, error: e.message }
        });
      }
    }
    
    return result;
  }
}

module.exports = TelegramAccountManager;
