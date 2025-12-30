/**
 * Telegram 会话管理模块
 * 
 * 管理 Telegram 登录会话，包括：
 * - 模拟模式（用于测试，无需真实 API 凭据）
 * - 真实模式（使用 GramJS 客户端）
 * - 会话持久化
 */

const fs = require('fs');
const path = require('path');

// 尝试加载可选依赖
let TelegramClient, StringSession, Api;
try {
  ({ TelegramClient } = require('telegram'));
  ({ StringSession } = require('telegram/sessions'));
  ({ Api } = require('telegram'));
} catch (_) {
  // 依赖未安装，将使用模拟模式
}

/**
 * 生成随机数字字符串
 * 
 * @param {number} n - 字符串长度
 * @returns {string} 随机数字字符串
 */
function randomDigits(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/**
 * 生成唯一状态 ID
 * 
 * @returns {string} 状态 ID
 */
function makeStateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Telegram 会话管理器类
 */
class TelegramSession {
  constructor(config, appRoot, logger) {
    this.config = config;
    this.appRoot = appRoot;
    this.logger = logger;
    
    // 模拟登录会话（Map: stateId -> session info）
    this.mockSessions = new Map();
    
    // 真实登录配置
    this.sessionFile = path.resolve(appRoot, config.sessionFile || './data/telegram-session.txt');
    this.enabledReal = !!(TelegramClient && StringSession && config.apiId && config.apiHash);
    
    // 客户端状态
    this.client = null;
    this.connected = false;
    this.stringSession = null;
    
    // 初始化真实客户端
    if (this.enabledReal) {
      try {
        let raw = '';
        if (fs.existsSync(this.sessionFile)) {
          raw = (fs.readFileSync(this.sessionFile, 'utf8') || '').trim();
        }
        this.stringSession = new StringSession(raw || '');
        this.client = new TelegramClient(
          this.stringSession,
          Number(config.apiId),
          String(config.apiHash),
          { connectionRetries: 5 }
        );
      } catch (e) {
        this.logger('ERROR', '初始化 Telegram 客户端失败', e && (e.stack || e.message));
      }
    }
  }
  
  /**
   * 确保客户端已连接
   * 
   * @returns {Promise<boolean>} 是否成功连接
   */
  async ensureConnected() {
    if (!this.enabledReal || !this.client) return false;
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
    return true;
  }
  
  /**
   * 保存会话到文件
   * 
   * @returns {Promise<void>}
   */
  async saveSession() {
    try {
      const s = this.client.session.save();
      fs.writeFileSync(this.sessionFile, s, 'utf8');
    } catch (e) {
      this.logger('ERROR', '保存 Telegram 会话失败', e && (e.stack || e.message));
    }
  }
  
  /**
   * 发送验证码（开始登录流程）
   * 
   * @param {string} phone - 手机号
   * @returns {Promise<Object>} {success, stateId, mode, debugCode?}
   */
  async sendCode(phone) {
    if (!this.enabledReal) {
      // 模拟模式
      const stateId = makeStateId();
      const code = randomDigits(5);
      this.mockSessions.set(stateId, {
        phone,
        code,
        status: 'code_sent',
        createdAt: Date.now()
      });
      return { success: true, stateId, debugCode: code, mode: 'mock' };
    }
    
    // 真实模式
    await this.ensureConnected();
    try {
      const result = await this.client.invoke(new Api.auth.SendCode({
        phoneNumber: phone,
        apiId: Number(this.config.apiId),
        apiHash: String(this.config.apiHash),
        settings: new Api.CodeSettings({})
      }));
      const stateId = makeStateId();
      this.mockSessions.set(stateId, {
        phone,
        phoneCodeHash: result.phoneCodeHash,
        status: 'code_sent',
        createdAt: Date.now()
      });
      return { success: true, stateId, mode: 'real' };
    } catch (e) {
      this.logger('ERROR', 'Telegram 发送验证码失败', e && (e.stack || e.message));
      throw e;
    }
  }
  
  /**
   * 验证验证码或二步密码
   * 
   * @param {string} stateId - 状态 ID
   * @param {string} code - 验证码
   * @param {string} password - 二步密码（可选）
   * @returns {Promise<Object>} {success, authorized?, needPassword?, phone?}
   */
  async verify(stateId, code, password) {
    const s = this.mockSessions.get(stateId);
    if (!s) {
      throw new Error('无效的 stateId');
    }
    
    if (!this.enabledReal) {
      // 模拟模式
      if (s.status === 'code_sent') {
        if (!code || String(code).trim() !== s.code) {
          throw new Error('验证码错误');
        }
        s.status = 'authorized';
        return { success: true, authorized: true, phone: s.phone };
      }
      if (s.status === 'password_required') {
        if (!password) {
          throw new Error('需要提供二步密码');
        }
        s.status = 'authorized';
        return { success: true, authorized: true, phone: s.phone };
      }
      throw new Error('状态不允许验证');
    }
    
    // 真实模式
    await this.ensureConnected();
    if (s.status === 'code_sent') {
      try {
        await this.client.invoke(new Api.auth.SignIn({
          phoneNumber: s.phone,
          phoneCodeHash: s.phoneCodeHash,
          phoneCode: String(code || '').trim()
        }));
        await this.saveSession();
        s.status = 'authorized';
        return { success: true, authorized: true, phone: s.phone };
      } catch (e) {
        const msg = e && e.message ? String(e.message) : '';
        if (msg.includes('SESSION_PASSWORD_NEEDED')) {
          s.status = 'password_required';
          return { success: true, needPassword: true, message: '验证码通过，需要二步密码' };
        }
        throw e;
      }
    }
    
    if (s.status === 'password_required') {
      if (!password) {
        throw new Error('需要提供二步密码');
      }
      try {
        // 获取密码信息
        const passwordSrpResult = await this.client.invoke(new Api.account.GetPassword());
        
        // 计算密码检查（SRP）
        const { computeCheck } = await import('telegram/Password.js');
        const passwordSrpCheck = await computeCheck(passwordSrpResult, String(password || ''));
        
        // 验证密码
        await this.client.invoke(new Api.auth.CheckPassword({
          password: passwordSrpCheck
        }));
        
        await this.saveSession();
        s.status = 'authorized';
        return { success: true, authorized: true, phone: s.phone };
      } catch (e) {
        this.logger('ERROR', '二步密码校验失败', e && (e.stack || e.message));
        throw e;
      }
    }
    
    throw new Error('状态不允许验证');
  }
  
  /**
   * 注销登录
   * 
   * @param {string} stateId - 状态 ID（模拟模式使用）
   * @returns {Promise<void>}
   */
  async logout(stateId) {
    if (!this.enabledReal) {
      if (stateId && this.mockSessions.has(stateId)) {
        this.mockSessions.delete(stateId);
      }
      return;
    }
    
    await this.ensureConnected();
    try {
      await this.client.invoke(new Api.auth.LogOut());
    } catch (_) {}
    
    try {
      fs.writeFileSync(this.sessionFile, '', 'utf8');
    } catch (_) {}
  }
  
  /**
   * 获取当前用户信息
   * 
   * @returns {Promise<Object|null>} 用户信息或 null
   */
  async getMe() {
    if (!this.enabledReal || !this.client) return null;
    
    try {
      await this.ensureConnected();
      const me = await this.client.getMe().catch(() => null);
      return me;
    } catch (_) {
      return null;
    }
  }
  
  /**
   * 发送消息
   * 
   * @param {string} to - 接收者（用户名、ID 或频道）
   * @param {string} message - 消息内容
   * @returns {Promise<Object>} 发送结果
   */
  async sendMessage(to, message) {
    if (!this.enabledReal || !this.client) {
      throw new Error('当前为模拟模式，无法发送');
    }
    
    await this.ensureConnected();
    const sent = await this.client.sendMessage(String(to), { message: String(message) });
    return sent;
  }
  
  /**
   * 获取健康状态
   * 
   * @returns {Promise<Object>} {mode, connected, authorized, user}
   */
  async getHealth() {
    let me = null;
    let authorized = false;
    let connected = false;
    
    if (this.enabledReal) {
      try {
        await this.ensureConnected();
        connected = !!this.client.connected;
        me = await this.getMe();
        authorized = !!me;
      } catch (_) {}
    }
    
    return {
      mode: this.enabledReal ? 'real' : 'mock',
      connected,
      authorized,
      user: me && {
        id: me.id,
        username: me.username,
        firstName: me.firstName,
        lastName: me.lastName
      }
    };
  }
}

module.exports = TelegramSession;
