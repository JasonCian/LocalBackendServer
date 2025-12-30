/**
 * Telegram 服务主模块
 * 
 * 集成会话管理和任务调度，提供统一的服务接口
 */

const TelegramSession = require('./telegram-session');
const TelegramTaskManager = require('./telegram-tasks');

/**
 * Telegram 服务类
 */
class TelegramService {
  constructor(config, appRoot, logger, notifyCallback) {
    this.config = config;
    this.logger = logger;
    this.notifyCallback = notifyCallback;
    
    // 初始化会话管理器
    this.session = new TelegramSession(config, appRoot, logger);
    
    // 初始化任务管理器
    this.taskManager = new TelegramTaskManager(config, appRoot, logger, notifyCallback);
    
    // 如果是真实模式，启动任务调度
    if (this.session.enabledReal) {
      this.taskManager.rescheduleAll(async (task) => {
        return await this.session.sendMessage(task.to, task.message);
      });
    }
  }
  
  /**
   * 发送验证码
   * 
   * @param {string} phone - 手机号
   * @returns {Promise<Object>}
   */
  async sendCode(phone) {
    return await this.session.sendCode(phone);
  }
  
  /**
   * 验证验证码或密码
   * 
   * @param {string} stateId - 状态 ID
   * @param {string} code - 验证码
   * @param {string} password - 二步密码
   * @returns {Promise<Object>}
   */
  async verify(stateId, code, password) {
    return await this.session.verify(stateId, code, password);
  }
  
  /**
   * 注销登录
   * 
   * @param {string} stateId - 状态 ID
   * @returns {Promise<void>}
   */
  async logout(stateId) {
    return await this.session.logout(stateId);
  }
  
  /**
   * 获取健康状态
   * 
   * @returns {Promise<Object>}
   */
  async getHealth() {
    return await this.session.getHealth();
  }
  
  /**
   * 即时发送消息
   * 
   * @param {string} to - 接收者
   * @param {string} message - 消息内容
   * @returns {Promise<Object>}
   */
  async sendNow(to, message) {
    const result = await this.session.sendMessage(to, message);
    
    if (this.notifyCallback) {
      await this.notifyCallback(
        'Telegram 即时发送成功',
        `to=${to} text=${message} msgId=${result && result.id ? result.id : 'n/a'}`
      );
    }
    
    return result;
  }
  
  /**
   * 获取所有任务
   * 
   * @returns {Array}
   */
  getTasks() {
    return this.taskManager.getTasks();
  }
  
  /**
   * 创建任务
   * 
   * @param {Object} taskData - 任务数据
   * @returns {Object}
   */
  createTask(taskData) {
    return this.taskManager.createTask(taskData, async (task) => {
      return await this.session.sendMessage(task.to, task.message);
    });
  }
  
  /**
   * 更新任务
   * 
   * @param {string} taskId - 任务 ID
   * @param {Object} updates - 更新数据
   * @returns {Object|null}
   */
  updateTask(taskId, updates) {
    return this.taskManager.updateTask(taskId, updates, async (task) => {
      return await this.session.sendMessage(task.to, task.message);
    });
  }
  
  /**
   * 删除任务
   * 
   * @param {string} taskId - 任务 ID
   * @returns {boolean}
   */
  deleteTask(taskId) {
    return this.taskManager.deleteTask(taskId);
  }
}

module.exports = TelegramService;
