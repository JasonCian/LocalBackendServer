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

// 简单延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
      const maxRetries = 3;
      let lastError = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          this.logger('INFO', `Telegram 客户端连接尝试 ${attempt}/${maxRetries}...`);
          await this.client.connect();
          this.connected = true;
          this.logger('INFO', 'Telegram 客户端连接成功');
          return true;
        } catch (e) {
          lastError = e;
          const errMsg = e && e.message ? e.message : String(e);
          this.logger('WARN', `Telegram 连接失败 (${attempt}/${maxRetries})`, errMsg);
          
          if (attempt < maxRetries) {
            const delay = 2000 * attempt; // 递增延迟：2s, 4s
            this.logger('INFO', `等待 ${delay}ms 后重试...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // 所有重试失败后记录最终错误
      if (lastError) {
        const errMsg = lastError && lastError.message ? lastError.message : String(lastError);
        this.logger('ERROR', 'Telegram 客户端连接最终失败（已重试所有次数）', errMsg);
      }
      return false;
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
    let error = null;
    
    if (this.enabledReal) {
      try {
        const connectSuccess = await this.ensureConnected();
        if (!connectSuccess) {
          error = 'ensureConnected failed';
        } else {
          connected = !!this.client.connected;
          me = await this.getMe();
          authorized = !!me;
        }
      } catch (e) {
        error = e && e.message ? e.message : String(e);
        this.logger('ERROR', 'Telegram getHealth 异常', error);
      }
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
      },
      ...(error && { error })
    };
  }

  /**
   * 等待并获取第一条回复（非自己发送）
   * 
   * @param {string} to - 会话对象（用户名/ID）
   * @param {number|bigint} sinceId - 起始消息 ID（只取大于此 ID 的消息）
   * @param {number|bigint} selfId - 自己的 ID，用于排除自身消息
   * @param {number} timeoutMs - 超时时间
   * @returns {Promise<Object|null>} 回复消息或 null
   */
  async waitForFirstReply(to, sinceId, selfId, timeoutMs = 3000) {
    if (!this.enabledReal || !this.client) return null;
    await this.ensureConnected();

    const deadline = Date.now() + timeoutMs;

    const pickReply = async () => {
      for await (const msg of this.client.iterMessages(String(to), { limit: 20 })) {
        if (sinceId && msg.id && msg.id <= sinceId) {
          // 后续都更旧，可以停止
          break;
        }
        if (msg.out) continue; // 排除自己发送
        if (selfId && msg.senderId && String(msg.senderId) === String(selfId)) continue;
        return msg;
      }
      return null;
    };

    while (Date.now() < deadline) {
      const reply = await pickReply();
      if (reply) return reply;
      await delay(400);
    }

    return null;
  }
  
  /**
   * 监听频道/聊天消息（实时）
   * 
   * @param {string|number} channelId - 频道 ID、用户名或聊天 ID
   * @param {Function} onMessage - 消息回调函数 (msg) => void
   * @param {Function} stopCondition - 停止条件函数 () => boolean，返回 true 时停止监听
   * @returns {Promise<void>}
   */
  async monitorChannel(channelId, onMessage, stopCondition) {
    if (!this.enabledReal || !this.client) {
      return; // 模拟模式不支持监听
    }

    try {
      await this.ensureConnected();
      
      const entity = await this.client.getEntity(String(channelId));
      if (!entity) {
        console.error('无法获取频道实体:', channelId);
        return;
      }

      // 初始化时获取最新消息ID，避免重复通知历史消息
      let lastMessageId = 0;
      try {
        const latestMessages = await this.client.getMessages(entity, { limit: 1 });
        if (latestMessages && latestMessages.length > 0 && latestMessages[0].id) {
          lastMessageId = latestMessages[0].id;
          console.log(`[监听] ${channelId} 初始消息ID: ${lastMessageId}`);
        }
      } catch (e) {
        console.error('获取初始消息ID失败:', e.message);
      }
      
      const pollInterval = 2000; // 2秒轮询一次

      while (!stopCondition || !stopCondition()) {
        try {
          // 获取最新消息
          const messages = [];
          for await (const msg of this.client.iterMessages(entity, { limit: 30 })) {
            if (!msg.id || msg.id <= lastMessageId) break;
            messages.push(msg);
          }

          // 从旧到新处理消息
          messages.reverse();
          for (const msg of messages) {
            if (msg.id > lastMessageId) {
              lastMessageId = msg.id;
              // 调用回调处理消息
              if (onMessage) {
                try {
                  onMessage(msg);
                } catch (e) {
                  console.error('消息回调执行失败:', e.message);
                }
              }
            }
          }
        } catch (e) {
          console.error('监听消息时出错:', e.message);
        }

        await delay(pollInterval);
      }
    } catch (e) {
      console.error('监听频道失败:', e.message);
    }
  }
}

module.exports = TelegramSession;
