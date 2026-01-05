/**
 * Telegram 任务调度模块
 * 
 * 管理定时任务，支持：
 * - Cron 表达式调度
 * - 任务持久化
 * - 一次性任务（runOnce）
 * - 任务启用/禁用
 */

const fs = require('fs');
const path = require('path');

// 尝试加载可选依赖
let cron;
try {
  cron = require('node-cron');
} catch (_) {
  // 依赖未安装
}

/**
 * 生成唯一任务 ID
 * 
 * @returns {string} 任务 ID
 */
function makeTaskId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Telegram 任务管理器类
 */
class TelegramTaskManager {
  constructor(config, appRoot, logger, notifyCallback) {
    this.config = config;
    this.appRoot = appRoot;
    this.logger = logger;
    this.notifyCallback = notifyCallback;
    
    // 任务文件路径
    this.tasksFile = path.resolve(appRoot, config.tasksFile || './data/telegram-tasks.json');
    
    // 任务列表和调度映射
    this.tasks = [];
    this.scheduled = new Map(); // taskId -> cron job
    
    // 监听任务的已处理消息ID（去重）
    this.listenedMessageIds = new Map(); // listenTaskId -> Set<messageId>
    
    // 加载任务
    this.loadTasks();
    
    // 如果 cron 可用且有任务，启动调度
    if (cron) {
      this.rescheduleAll();
    }
  }
  
  /**
   * 从文件加载任务
   */
  loadTasks() {
    try {
      const data = fs.readFileSync(this.tasksFile, 'utf8');
      this.tasks = JSON.parse(data);
      if (!Array.isArray(this.tasks)) {
        this.tasks = [];
      }
    } catch (_) {
      this.tasks = [];
    }
  }
  
  /**
   * 保存任务到文件
   */
  saveTasks() {
    try {
      fs.writeFileSync(this.tasksFile, JSON.stringify(this.tasks, null, 2), 'utf8');
    } catch (e) {
      this.logger('ERROR', '保存任务失败', e && e.message);
    }
  }
  
  /**
   * 调度单个任务
   * 
   * @param {Object} task - 任务对象
   * @param {Function} executeCallback - 执行回调函数
   */
  scheduleTask(task, executeCallback) {
    // 如果任务被禁用，不进行调度（但清理可能存在的旧调度）
    if (!task.enabled) {
      if (this.scheduled.has(task.id)) {
        try {
          this.scheduled.get(task.id).stop();
        } catch (_) {}
        this.scheduled.delete(task.id);
      }
      return;
    }
    
    // 监听任务不需要cron调度
    if (task.type === 'listen') {
      return;
    }

    if (!cron) {
      this.logger('WARN', 'node-cron 未安装，跳过任务调度', task.id);
      return;
    }
    
    // 自动转换5位Cron为6位格式
    let cronExpr = String(task.cron || '').trim();
    const parts = cronExpr.split(/\s+/);
    if (parts.length === 5) {
      // 标准Unix cron（分 时 日 月 周）-> node-cron（秒 分 时 日 月 周）
      cronExpr = '0 ' + cronExpr;
      this.logger('INFO', `自动转换Cron表达式: ${task.cron} -> ${cronExpr}`, task.id);
    }
    
    if (!cron.validate(cronExpr)) {
      this.logger('ERROR', `无效的 cron 表达式: ${cronExpr}（任务ID: ${task.id}）`, task.cron);
      return;
    }
    
    const job = cron.schedule(cronExpr, async () => {
      try {
        const result = await executeCallback(task);
        this.logger('INFO', `Telegram 任务发送成功: ${task.id} -> ${task.to}`);
        
        if (this.notifyCallback) {
          await this.notifyCallback(
            'Telegram 任务发送成功',
            `id=${task.id} to=${task.to} text=${task.message} msgId=${result && result.id ? result.id : 'n/a'}`
          );
        }
      } catch (e) {
        this.logger('ERROR', `Telegram 任务发送失败: ${task.id}`, e && (e.stack || e.message));
        
        if (this.notifyCallback) {
          await this.notifyCallback(
            'Telegram 任务发送失败',
            `id=${task.id} to=${task.to} error=${e && e.message ? e.message : e}`
          );
        }
      } finally {
        // 如果是一次性任务，执行后停用
        if (task.runOnce) {
          try {
            job.stop();
          } catch (_) {}
          this.scheduled.delete(task.id);
          
          const idx = this.tasks.findIndex(x => x.id === task.id);
          if (idx >= 0) {
            this.tasks[idx] = { ...this.tasks[idx], enabled: false };
            this.saveTasks();
          }
          
          this.logger('INFO', `Telegram 任务 runOnce 完成并停用: ${task.id}`);
        }
      }
    });
    
    this.scheduled.set(task.id, job);
  }
  
  /**
   * 重新调度所有任务
   * 
   * @param {Function} executeCallback - 执行回调函数
   */
  rescheduleAll(executeCallback) {
    // 停止所有现有任务
    for (const [, job] of this.scheduled) {
      try {
        job.stop();
      } catch (_) {}
    }
    this.scheduled.clear();
    
    // 重新调度所有启用的任务
    if (executeCallback) {
      this.tasks.forEach(task => this.scheduleTask(task, executeCallback));
    }
  }
  
  /**
   * 获取所有任务
   * 
   * @param {string} accountId - 可选，筛选特定账号的任务
   * @returns {Array} 任务列表
   */
  getTasks(accountId) {
    if (accountId) {
      return this.tasks.filter(t => t.accountId === accountId);
    }
    return this.tasks;
  }

  /**
   * 获取单个任务
   * 
   * @param {string} taskId - 任务 ID
   * @returns {Object|null} 任务对象或 null
   */
  getTask(taskId) {
    return this.tasks.find(t => t.id === taskId) || null;
  }

  /**
   * 创建新任务
   * 支持两种类型：
   * - send: 定时发送消息 {type:'send', cron, to, message, accountId, enabled, runOnce}
   * - listen: 监听频道消息 {type:'listen', channel, accountId, enabled}
   * 
   * @param {Object} taskData - 任务数据
   * @param {Function} executeCallback - 执行回调函数
   * @param {Function} startListenCallback - 启动监听回调函数
   * @returns {Object} 创建的任务
   */
  createTask(taskData, executeCallback, startListenCallback) {
    const taskType = String(taskData.type || 'send').toLowerCase();
    
    let task;
    
    if (taskType === 'listen') {
      // 监听任务
      task = {
        id: makeTaskId(),
        type: 'listen',
        channel: String(taskData.channel || '').trim(),
        enabled: taskData.enabled !== false,
        accountId: taskData.accountId || null
      };
      
      // 初始化此任务的消息ID集合
      this.listenedMessageIds.set(task.id, new Set());
    } else {
      // 发送任务（默认）
      task = {
        id: makeTaskId(),
        type: 'send',
        cron: String(taskData.cron || '0 0 11 * * *'),
        to: String(taskData.to || '').trim(),
        message: String(taskData.message || '').trim(),
        enabled: taskData.enabled !== false,
        runOnce: taskData.runOnce === true,
        accountId: taskData.accountId || null
      };
    }
    
    this.tasks.push(task);
    this.saveTasks();
    
    // 启动任务
    if (task.type === 'send' && executeCallback) {
      this.scheduleTask(task, executeCallback);
    } else if (task.type === 'listen' && startListenCallback && task.enabled) {
      startListenCallback(task);
    }
    
    return task;
  }
  
  /**
   * 更新任务
   * 
   * @param {string} taskId - 任务 ID
   * @param {Object} updates - 更新数据
   * @param {Function} executeCallback - 执行回调函数（仅用于 send 任务）
   * @param {Function} startListenCallback - 启动监听回调函数（仅用于 listen 任务）
   * @returns {Object|null} 更新后的任务或 null
   */
  updateTask(taskId, updates, executeCallback, startListenCallback) {
    const idx = this.tasks.findIndex(x => x.id === taskId);
    if (idx < 0) return null;
    
    const original = this.tasks[idx];
    const updated = {
      ...original,
      ...updates
    };
    
    this.tasks[idx] = updated;
    this.saveTasks();
    
    // 处理 send 任务的调度更新
    if (updated.type === 'send' || !updated.type) {
      // 停止旧的调度
      if (this.scheduled.has(taskId)) {
        try {
          this.scheduled.get(taskId).stop();
        } catch (_) {}
        this.scheduled.delete(taskId);
      }
      
      // 重新调度该任务
      if (executeCallback) {
        this.scheduleTask(updated, executeCallback);
      }
    }
    
    // 处理 listen 任务的启动/停止
    if (updated.type === 'listen') {
      if (updated.enabled && startListenCallback) {
        startListenCallback(updated);
      }
    }
    
    return updated;
  }
  
  /**
   * 标记消息为已处理（用于监听任务去重）
   * 
   * @param {string} listenTaskId - 监听任务 ID
   * @param {number|string} messageId - 消息 ID
   * @returns {boolean} 是否为新消息（未处理过）
   */
  markMessageAsProcessed(listenTaskId, messageId) {
    if (!this.listenedMessageIds.has(listenTaskId)) {
      this.listenedMessageIds.set(listenTaskId, new Set());
    }
    
    const msgIdSet = this.listenedMessageIds.get(listenTaskId);
    const isNew = !msgIdSet.has(messageId);
    
    if (isNew) {
      msgIdSet.add(messageId);
    }
    
    return isNew;
  }
  
  /**
   * 获取监听任务的已处理消息数量
   * 
   * @param {string} listenTaskId - 监听任务 ID
   * @returns {number}
   */
  getProcessedMessageCount(listenTaskId) {
    return this.listenedMessageIds.has(listenTaskId) 
      ? this.listenedMessageIds.get(listenTaskId).size
      : 0;
  }
  
  /**
   * 清除监听任务的消息记录
   * 
   * @param {string} listenTaskId - 监听任务 ID
   */
  clearProcessedMessages(listenTaskId) {
    if (this.listenedMessageIds.has(listenTaskId)) {
      this.listenedMessageIds.get(listenTaskId).clear();
    }
  }
  
  /**
   * 删除任务
   * 
   * @param {string} taskId - 任务 ID
   * @returns {boolean} 是否成功删除
   */
  deleteTask(taskId) {
    const idx = this.tasks.findIndex(x => x.id === taskId);
    if (idx < 0) return false;
    
    const task = this.tasks[idx];
    this.tasks.splice(idx, 1);
    this.saveTasks();
    
    // 停止 send 任务的调度
    if (this.scheduled.has(taskId)) {
      try {
        this.scheduled.get(taskId).stop();
      } catch (_) {}
      this.scheduled.delete(taskId);
    }
    
    // 清理 listen 任务的消息记录
    if (task.type === 'listen') {
      this.listenedMessageIds.delete(taskId);
    }
    
    return true;
  }
}

module.exports = TelegramTaskManager;
