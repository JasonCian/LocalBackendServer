/**
 * Telegram 服务主模块
 * 
 * 集成多账号管理、会话管理和任务调度，提供统一的服务接口
 */

const TelegramAccountManager = require('./telegram-account-manager');
const TelegramTaskManager = require('./telegram-tasks');

/**
 * Telegram 服务类（支持多账号）
 */
class TelegramService {
  constructor(config, appRoot, logger, notifyCallback) {
    this.config = config;
    this.logger = logger;
    this.notifyCallback = notifyCallback;
    
    // 初始化账号管理器
    this.accountManager = new TelegramAccountManager(config, appRoot, logger);
    
    // 初始化任务管理器
    this.taskManager = new TelegramTaskManager(config, appRoot, logger, notifyCallback);
    
    // 监听任务的活跃监听器映射：taskId -> { stop: Function, session: TelegramSession }
    this.activeListeners = new Map();
    
    // 启动任务调度
    this.rescheduleAllTasks();
    this.startAllListenTasks();
  }
  
  /**
   * 重新调度所有任务
   */
  rescheduleAllTasks() {
    this.taskManager.rescheduleAll(
      // send 任务的执行回调
      async (task) => {
        const accountId = task.accountId || this.accountManager.activeAccountId;
        const session = this.accountManager.getSession(accountId);
        
        if (!session) {
          throw new Error(`账号 ${accountId} 的会话不存在`);
        }
        
        return await session.sendMessage(task.to, task.message);
      },
      // listen 任务的启动回调
      (task) => {
        this.startListenTask(task);
      }
    );
  }
  
  /**
   * 启动所有已启用的监听任务
   */
  startAllListenTasks() {
    const listenTasks = this.taskManager.getTasks().filter(t => t.type === 'listen' && t.enabled);
    for (const task of listenTasks) {
      this.startListenTask(task);
    }
  }
  
  /**
   * 启动单个监听任务
   * 
   * @param {Object} task - 监听任务对象
   */
  startListenTask(task) {
    if (!task || task.type !== 'listen') return;
    
    // 如果已经在监听此任务，先停止旧的
    if (this.activeListeners.has(task.id)) {
      const listener = this.activeListeners.get(task.id);
      if (listener.stop) {
        listener.stop();
      }
      this.activeListeners.delete(task.id);
    }
    
    const accountId = task.accountId || this.accountManager.activeAccountId;
    const session = this.accountManager.getSession(accountId);
    
    if (!session) {
      this.logger('ERROR', `无法启动监听任务：账号 ${accountId} 的会话不存在`);
      return;
    }
    
    // 设置停止标志
    let shouldStop = false;
    
    // 启动异步监听（不阻塞）
    const monitorPromise = session.monitorChannel(
      task.channel,
      async (msg) => {
        // 消息回调：处理新消息
        try {
          const messageId = msg.id;
          
          // 检查消息是否已处理过（去重）
          const isNew = this.taskManager.markMessageAsProcessed(task.id, messageId);
          if (!isNew) {
            return; // 重复消息，跳过
          }
          
          // 提取消息信息
          const senderName = msg.senderName || msg.senderId || 'Unknown';
          const messageText = msg.message || msg.text || '(无内容)';
          const timestamp = msg.date ? new Date(msg.date * 1000).toLocaleString() : 'Unknown';
          
          // 提取消息中的图片（支持 Photo 和带图片的 Document）
          const photos = [];
          if (msg.photo && msg.photo.id) {
            // 使用 Telegram CDN 生成图片 URL
            const photoSize = msg.photo.sizes ? msg.photo.sizes[msg.photo.sizes.length - 1] : null;
            if (photoSize && photoSize.w && photoSize.h) {
              photos.push({
                type: 'photo',
                photoId: msg.photo.id,
                width: photoSize.w,
                height: photoSize.h,
                url: `https://cdn4.telegram-cdn.org/file/photo-${msg.photo.id}.jpg` // 占位符，实际需要通过会话下载
              });
            }
          }
          
          // 提取 Document 中的缩略图（如果有）
          if (msg.document && msg.document.thumbs && msg.document.thumbs.length > 0) {
            const thumb = msg.document.thumbs[msg.document.thumbs.length - 1];
            if (thumb && thumb.w && thumb.h) {
              photos.push({
                type: 'document_thumb',
                documentId: msg.document.id,
                fileName: msg.document.attributes?.find(a => a.constructor.name === 'DocumentAttributeFilename')?.file_name || 'unknown',
                width: thumb.w,
                height: thumb.h
              });
            }
          }
          
          // 发送通知
          if (this.notifyCallback) {
            try {
              const notificationLines = [
                `**监听任务**: ${task.id}`,
                `**频道**: ${task.channel}`,
                `**账号**: ${accountId}`,
                `**发送者**: ${senderName}`,
                `**时间**: ${timestamp}`,
                `**消息ID**: ${messageId}`,
                `**内容**:\n> ${String(messageText).replace(/\n/g, '\n> ')}`
              ];
              
              // 如果有图片，添加图片信息
              if (photos.length > 0) {
                notificationLines.push(`**图片**: 包含 ${photos.length} 张图片`);
              }
              
              await this.notifyCallback(
                'Telegram 监听任务消息',
                notificationLines.join('\n\n'),
                photos.length > 0 ? photos : null
              );
            } catch (e) {
              this.logger('ERROR', '监听任务通知发送失败', e && e.message);
            }
          }
          
          this.logger('INFO', `监听任务 ${task.id} 捕获消息: msgId=${messageId} from=${senderName}${photos.length > 0 ? ` 含${photos.length}张图片` : ''}`);
        } catch (e) {
          this.logger('ERROR', `监听任务消息处理失败 ${task.id}`, e && e.message);
        }
      },
      () => shouldStop // 停止条件函数
    );
    
    // 记录监听器（用于停止）
    this.activeListeners.set(task.id, {
      stop: () => {
        shouldStop = true;
      },
      session: session,
      promise: monitorPromise
    });
    
    this.logger('INFO', `已启动监听任务: ${task.id} 监听频道 ${task.channel}`);
  }
  
  /**
   * 停止监听任务
   * 
   * @param {string} taskId - 任务 ID
   */
  stopListenTask(taskId) {
    if (this.activeListeners.has(taskId)) {
      const listener = this.activeListeners.get(taskId);
      if (listener.stop) {
        listener.stop();
      }
      this.activeListeners.delete(taskId);
      this.logger('INFO', `已停止监听任务: ${taskId}`);
    }
  }
  
  /**
   * 发送验证码
   * 
   * @param {string} phone - 手机号
   * @param {string} accountId - 可选，账号 ID
   * @returns {Promise<Object>}
   */
  async sendCode(phone, accountId) {
    const session = this.accountManager.getSession(accountId);
    
    if (!session) {
      throw new Error('会话不存在，请先添加账号');
    }
    
    return await session.sendCode(phone);
  }
  
  /**
   * 验证验证码或密码
   * 
   * @param {string} stateId - 状态 ID
   * @param {string} code - 验证码
   * @param {string} password - 二步密码
   * @param {string} accountId - 可选，账号 ID
   * @returns {Promise<Object>}
   */
  async verify(stateId, code, password, accountId) {
    const session = this.accountManager.getSession(accountId);
    
    if (!session) {
      throw new Error('会话不存在');
    }
    
    return await session.verify(stateId, code, password);
  }
  
  /**
   * 注销登录
   * 
   * @param {string} stateId - 状态 ID
   * @param {string} accountId - 可选，账号 ID
   * @returns {Promise<void>}
   */
  async logout(stateId, accountId) {
    const session = this.accountManager.getSession(accountId);
    
    if (!session) {
      throw new Error('会话不存在');
    }
    
    return await session.logout(stateId);
  }
  
  /**
   * 获取健康状态
   * 
   * @param {string} accountId - 可选，账号 ID
   * @returns {Promise<Object>}
   */
  async getHealth(accountId) {
    const session = this.accountManager.getSession(accountId);
    
    if (!session) {
      return { mode: 'unknown', connected: false, authorized: false };
    }
    
    return await session.getHealth();
  }
  
  /**
   * 即时发送消息
   * 
   * @param {string} to - 接收者
   * @param {string} message - 消息内容
   * @param {string} accountId - 可选，账号 ID
   * @returns {Promise<Object>}
   */
  async sendNow(to, message, accountId) {
    const session = this.accountManager.getSession(accountId);
    
    if (!session) {
      throw new Error('会话不存在');
    }
    
    const me = await session.getMe();
    const result = await session.sendMessage(to, message);
    const reply = await session.waitForFirstReply(to, result && result.id, me && me.id);
    
    if (this.notifyCallback) {
      const lines = [
        `**账号**: ${accountId || 'active'}`,
        `**收件人**: ${to}`,
        `**消息ID**: ${result && result.id ? result.id : 'n/a'}`,
        `**内容**:\n> ${String(message || '').replace(/\n/g, '\n> ')}`
      ];
      if (reply) {
        lines.push(`**回复** (from ${reply.senderId || ''}):\n> ${String(reply.message || '').replace(/\n/g, '\n> ')}`);
      } else {
        lines.push('**回复**: 暂无');
      }

      await this.notifyCallback('Telegram 即时发送成功', lines.join('\n\n'));
    }
    
    return result;
  }
  
  /**
   * 获取所有任务
   * 
   * @param {string} accountId - 可选，筛选特定账号的任务
   * @returns {Array}
   */
  getTasks(accountId) {
    return this.taskManager.getTasks(accountId);
  }
  
  /**
   * 创建任务（支持 send 和 listen 两种类型）
   * 
   * @param {Object} taskData - 任务数据
   * @returns {Object}
   */
  createTask(taskData) {
    const task = this.taskManager.createTask(
      taskData,
      // send 任务执行回调
      async (t) => {
        const accountId = t.accountId || this.accountManager.activeAccountId;
        const session = this.accountManager.getSession(accountId);
        
        if (!session) {
          throw new Error(`账号 ${accountId} 的会话不存在`);
        }
        
        return await session.sendMessage(t.to, t.message);
      },
      // listen 任务启动回调
      (t) => {
        this.startListenTask(t);
      }
    );
    
    return task;
  }
  
  /**
   * 更新任务（支持 send 和 listen 两种类型）
   * 
   * @param {string} taskId - 任务 ID
   * @param {Object} updates - 更新数据
   * @returns {Object|null}
   */
  updateTask(taskId, updates) {
    // 停止现有监听（如果是监听任务）
    const oldTask = this.taskManager.getTask(taskId);
    if (oldTask && oldTask.type === 'listen') {
      this.stopListenTask(taskId);
    }
    
    return this.taskManager.updateTask(
      taskId,
      updates,
      // send 任务执行回调
      async (task) => {
        const accountId = task.accountId || this.accountManager.activeAccountId;
        const session = this.accountManager.getSession(accountId);
        
        if (!session) {
          throw new Error(`账号 ${accountId} 的会话不存在`);
        }
        
        return await session.sendMessage(task.to, task.message);
      },
      // listen 任务启动回调
      (task) => {
        if (task.enabled) {
          this.startListenTask(task);
        } else {
          this.stopListenTask(task.id);
        }
      }
    );
  }
  
  /**
   * 删除任务
   * 
   * @param {string} taskId - 任务 ID
   * @returns {boolean}
   */
  deleteTask(taskId) {
    // 停止监听任务
    const task = this.taskManager.getTask(taskId);
    if (task && task.type === 'listen') {
      this.stopListenTask(taskId);
    }
    
    return this.taskManager.deleteTask(taskId);
  }

  /**
   * 立刻执行一次任务
   * 
   * @param {string} taskId - 任务 ID
   * @param {string} accountId - 可选，指定账号 ID
   * @returns {Promise<Object>} { success, message }
   */
  async runTaskNow(taskId, accountId) {
    try {
      const task = this.taskManager.getTask(taskId);
      
      if (!task) {
        return { success: false, message: '任务不存在' };
      }

      // 使用指定的账号，或任务绑定的账号，或活跃账号
      const targetAccountId = accountId || task.accountId || this.accountManager.activeAccountId;
      const session = this.accountManager.getSession(targetAccountId);

      if (!session) {
        return { success: false, message: `账号 ${targetAccountId} 的会话不存在` };
      }

      const health = await session.getHealth();
      if (!health.authorized) {
        return { success: false, message: '账号未授权，无法发送消息' };
      }

      const me = await session.getMe();
      // 发送消息
      const result = await session.sendMessage(task.to, task.message);
      const reply = await session.waitForFirstReply(task.to, result && result.id, me && me.id);
      
      this.logger('INFO', `任务 ${taskId} 已执行: 发送至 ${task.to}`);

      // 外部通知：手动执行成功（Markdown 卡片友好）
      if (this.notifyCallback) {
        try {
          const lines = [
            `**任务ID**: ${taskId}`,
            `**账号**: ${targetAccountId || 'active'}`,
            `**收件人**: ${task.to}`,
            `**消息ID**: ${result && result.id ? result.id : 'n/a'}`,
            `**内容**:\n> ${String(task.message || '').replace(/\n/g, '\n> ')}`
          ];
          if (reply) {
            lines.push(`**回复** (from ${reply.senderId || ''}):\n> ${String(reply.message || '').replace(/\n/g, '\n> ')}`);
          } else {
            lines.push('**回复**: 暂无');
          }

          await this.notifyCallback('Telegram 手动任务执行成功', lines.join('\n\n'));
        } catch (_) {
          // 通知失败不影响主流程
        }
      }
      
      return { success: true, message: `消息已发送至 ${task.to}` };
    } catch (e) {
      this.logger('ERROR', `执行任务 ${taskId} 失败`, e && (e.stack || e.message));

      // 外部通知：手动执行失败
      if (this.notifyCallback) {
        try {
          await this.notifyCallback(
            'Telegram 手动任务执行失败',
            `taskId=${taskId} account=${accountId || 'active'} error=${e && e.message ? e.message : e}`
          );
        } catch (_) {
          // 通知失败不影响主流程
        }
      }

      return { success: false, message: e && e.message ? e.message : '执行失败' };
    }
  }
  
  // ========== 账号管理方法 ==========
  
  /**
   * 添加新账号
   * 
   * @param {string} phone - 手机号
   * @param {string} name - 账号名称
   * @returns {Object}
   */
  addAccount(phone, name) {
    return this.accountManager.addAccount(phone, name);
  }
  
  /**
   * 移除账号
   * 
   * @param {string} accountId - 账号 ID
   * @returns {boolean}
   */
  removeAccount(accountId) {
    return this.accountManager.removeAccount(accountId);
  }
  
  /**
   * 切换活跃账号
   * 
   * @param {string} accountId - 账号 ID
   * @returns {boolean}
   */
  switchAccount(accountId) {
    const result = this.accountManager.switchAccount(accountId);
    
    // 重新调度所有任务
    if (result) {
      this.rescheduleAllTasks();
    }
    
    return result;
  }
  
  /**
   * 获取所有账号列表
   * 
   * @returns {Array}
   */
  getAllAccounts() {
    return this.accountManager.getAllAccounts();
  }
  
  /**
   * 获取活跃账号
   * 
   * @returns {Object|null}
   */
  getActiveAccount() {
    return this.accountManager.getActiveAccount();
  }
  
  /**
   * 获取账号信息
   * 
   * @param {string} accountId - 账号 ID
   * @returns {Object|null}
   */
  getAccount(accountId) {
    return this.accountManager.getAccount(accountId);
  }
  
  /**
   * 更新账号信息
   * 
   * @param {string} accountId - 账号 ID
   * @param {Object} updates - 更新数据
   * @returns {Object|null}
   */
  updateAccount(accountId, updates) {
    return this.accountManager.updateAccount(accountId, updates);
  }
  
  /**
   * 获取所有账号的健康状态
   * 
   * @returns {Promise<Array>}
   */
  async getAllAccountsHealth() {
    return await this.accountManager.getAllAccountsHealth();
  }
}

module.exports = TelegramService;
