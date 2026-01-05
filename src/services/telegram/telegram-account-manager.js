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

// 同步睡眠，启动时等待磁盘/网络就绪（阻塞型，但只用于初始化短时间）
const syncSleep = (ms) => {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (_) {
    // 在不支持 Atomics.wait 的环境中静默忽略
  }
};

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

    // 开机早期可能磁盘/映射盘未就绪，如果初始加载为空则再尝试几次
    if (this.accounts.size === 0) {
      const retryDelays = [2000, 4000, 8000]; // 毫秒
      retryDelays.forEach((delayMs, idx) => {
        setTimeout(() => {
          if (this.accounts.size > 0) return;
          this.logger('WARN', `账号列表为空，尝试第 ${idx + 1} 次延迟重载`);
          this.loadAccounts();
        }, delayMs);
      });
    }
  }
  
  /**
   * 加载账号列表
   */
  loadAccounts() {
    const maxAttempts = 5;
    const baseDelay = 1000; // 1秒起步

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger('INFO', `尝试加载账号文件: ${this.accountsFile} (第${attempt}/${maxAttempts}次)`);

        if (!fs.existsSync(this.accountsFile)) {
          // 文件不存在时，等待下一次尝试；仅最后一次才创建空文件，避免开机磁盘未就绪时误写空
          if (attempt < maxAttempts) {
            this.logger('WARN', `账号文件不存在，等待重试: ${this.accountsFile}`);
            syncSleep(baseDelay * attempt); // 递增等待
            continue;
          }

          this.logger('WARN', `账号文件不存在，创建空文件: ${this.accountsFile}`);
          const dir = path.dirname(this.accountsFile);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(this.accountsFile, '[]', 'utf8');
          return;
        }

        const data = fs.readFileSync(this.accountsFile, 'utf8');
        this.logger('INFO', `账号文件读取成功，内容长度: ${data.length} 字节`);

        const list = JSON.parse(data);
        if (Array.isArray(list)) {
          list.forEach(acc => {
            this.accounts.set(acc.id, acc);
            if (acc.active) {
              this.activeAccountId = acc.id;
            }
          });
          this.logger('INFO', `成功加载 ${list.length} 个账号，活跃账号: ${this.activeAccountId || '无'}`);
        } else {
          this.logger('WARN', `账号文件格式错误，不是数组格式`);
        }
        return; // 成功加载后返回
      } catch (e) {
        this.logger('ERROR', `加载账号列表失败: ${this.accountsFile} (第${attempt}次)`, e && (e.stack || e.message));
        if (attempt < maxAttempts) {
          syncSleep(baseDelay * attempt);
          continue;
        }
      }
    }
  }
  
  /**
   * 保存账号列表
   */
  saveAccounts() {
    try {
      const list = Array.from(this.accounts.values());
      const dir = path.dirname(this.accountsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.accountsFile, JSON.stringify(list, null, 2), 'utf8');
      this.logger('INFO', `账号列表已保存: ${this.accountsFile} (共 ${list.length} 个账号)`);
    } catch (e) {
      this.logger('ERROR', `保存账号列表失败: ${this.accountsFile}`, e && (e.stack || e.message));
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
      // 确保会话文件为绝对路径，避免服务启动时工作目录差异导致找不到已登录会话
      sessionFile: path.resolve(this.appRoot, account.sessionFile)
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
    const timeoutMs = 4000;
    const timeoutMarker = Symbol('health-timeout');
    const timeoutHealth = { mode: 'timeout', connected: false, authorized: false, error: 'health timeout' };
    
    for (const account of this.accounts.values()) {
      try {
        const session = this.getSession(account.id);
        if (session) {
          const health = await Promise.race([
            session.getHealth(),
            new Promise(resolve => setTimeout(() => resolve(timeoutMarker), timeoutMs))
          ]);
          const finalHealth = health === timeoutMarker ? timeoutHealth : health;
          if (health === timeoutMarker) {
            this.logger('WARN', `账号健康检查超时，返回占位状态`, account.id);
          }
          result.push({ ...account, health: finalHealth });
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
