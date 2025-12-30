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
    if (!cron || !task.enabled) return;
    
    const cronExpr = String(task.cron || '');
    if (!cron.validate(cronExpr)) {
      this.logger('ERROR', '无效的 cron 表达式', cronExpr);
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
   * @returns {Array} 任务列表
   */
  getTasks() {
    return this.tasks;
  }
  
  /**
   * 创建新任务
   * 
   * @param {Object} taskData - 任务数据 {cron, to, message, enabled, runOnce}
   * @param {Function} executeCallback - 执行回调函数
   * @returns {Object} 创建的任务
   */
  createTask(taskData, executeCallback) {
    const task = {
      id: makeTaskId(),
      cron: String(taskData.cron || '* * * * *'),
      to: String(taskData.to || '').trim(),
      message: String(taskData.message || '').trim(),
      enabled: taskData.enabled !== false,
      runOnce: taskData.runOnce === true
    };
    
    this.tasks.push(task);
    this.saveTasks();
    
    if (executeCallback) {
      this.scheduleTask(task, executeCallback);
    }
    
    return task;
  }
  
  /**
   * 更新任务
   * 
   * @param {string} taskId - 任务 ID
   * @param {Object} updates - 更新数据
   * @param {Function} executeCallback - 执行回调函数
   * @returns {Object|null} 更新后的任务或 null
   */
  updateTask(taskId, updates, executeCallback) {
    const idx = this.tasks.findIndex(x => x.id === taskId);
    if (idx < 0) return null;
    
    const updated = {
      ...this.tasks[idx],
      ...updates,
      runOnce: updates.runOnce === true ? true : this.tasks[idx].runOnce
    };
    
    this.tasks[idx] = updated;
    this.saveTasks();
    
    // 重新调度该任务
    if (this.scheduled.has(taskId)) {
      try {
        this.scheduled.get(taskId).stop();
      } catch (_) {}
      this.scheduled.delete(taskId);
    }
    
    if (executeCallback) {
      this.scheduleTask(updated, executeCallback);
    }
    
    return updated;
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
    
    this.tasks.splice(idx, 1);
    this.saveTasks();
    
    // 停止调度
    if (this.scheduled.has(taskId)) {
      try {
        this.scheduled.get(taskId).stop();
      } catch (_) {}
      this.scheduled.delete(taskId);
    }
    
    return true;
  }
}

module.exports = TelegramTaskManager;
