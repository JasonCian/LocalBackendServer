/**
 * 请求队列管理器
 * 
 * 功能：
 * - 限制并发请求数（防止资源耗尽）
 * - 优先级队列（重要请求优先处理）
 * - 超时控制（防止请求挂起）
 * - 背压管理（队列满时返回 503）
 */

/**
 * 请求队列类
 */
class RequestQueue {
  constructor(maxConcurrent = 20, maxQueueSize = 1000, requestTimeoutMs = 30000) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
    this.requestTimeoutMs = requestTimeoutMs;

    // 运行中的请求数
    this.running = 0;

    // 等待队列：{ fn, priority, resolve, reject, createdAt }
    this.queue = [];

    // 统计指标
    this.stats = {
      processed: 0,       // 已处理
      rejected: 0,        // 被拒绝
      timedOut: 0,        // 超时
      totalWaitTime: 0,   // 总等待时间（ms）
      peakQueueSize: 0    // 最大队列大小
    };

    // 定期清理超时任务
    this.cleanupInterval = setInterval(() => this._cleanupTimeouts(), 5000);
  }

  /**
   * 将任务加入队列
   * 
   * @param {Function} fn - 异步任务函数
   * @param {number} priority - 优先级（高优先级先执行）
   * @returns {Promise} 任务结果
   */
  async enqueue(fn, priority = 0) {
    // 1. 队列满时拒绝
    if (this.queue.length >= this.maxQueueSize) {
      this.stats.rejected++;
      const err = new Error(`队列已满（${this.queue.length}/${this.maxQueueSize}），请稍后重试`);
      err.code = 'QUEUE_FULL';
      throw err;
    }

    // 2. 创建 Promise
    return new Promise((resolve, reject) => {
      const task = {
        fn,
        priority,
        resolve,
        reject,
        createdAt: Date.now(),
        timeoutHandle: null
      };

      // 3. 加入队列并排序
      this.queue.push(task);
      this.queue.sort((a, b) => b.priority - a.priority);

      // 4. 更新峰值
      if (this.queue.length > this.stats.peakQueueSize) {
        this.stats.peakQueueSize = this.queue.length;
      }

      // 5. 尝试处理
      this._process();
    });
  }

  /**
   * 处理队列中的任务
   * @private
   */
  async _process() {
    // 1. 已达到并发上限或队列为空
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    // 2. 从队列中取出高优先级任务
    const task = this.queue.shift();

    // 3. 设置超时
    task.timeoutHandle = setTimeout(() => {
      this.stats.timedOut++;
      task.reject(new Error(`请求超时（${this.requestTimeoutMs}ms）`));
    }, this.requestTimeoutMs);

    // 4. 执行任务
    this.running++;
    const waitTime = Date.now() - task.createdAt;
    this.stats.totalWaitTime += waitTime;

    try {
      const result = await task.fn();
      clearTimeout(task.timeoutHandle);
      this.stats.processed++;
      task.resolve(result);
    } catch (err) {
      clearTimeout(task.timeoutHandle);
      task.reject(err);
    } finally {
      this.running--;

      // 继续处理下一个任务
      this._process();
    }
  }

  /**
   * 清理超时任务
   * @private
   */
  _cleanupTimeouts() {
    const now = Date.now();
    const timeoutTasks = this.queue.filter(
      task => now - task.createdAt > this.requestTimeoutMs * 2
    );

    for (const task of timeoutTasks) {
      const idx = this.queue.indexOf(task);
      if (idx !== -1) {
        this.queue.splice(idx, 1);
        clearTimeout(task.timeoutHandle);
        this.stats.timedOut++;
        task.reject(new Error('任务超时被清理'));
      }
    }
  }

  /**
   * 获取队列统计信息
   */
  getStats() {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueueSize: this.maxQueueSize,
      ...this.stats,
      avgWaitTime: this.stats.processed > 0 
        ? Math.round(this.stats.totalWaitTime / this.stats.processed)
        : 0
    };
  }

  /**
   * 获取健康状态
   */
  getHealth() {
    const stats = this.getStats();
    const queueUtilization = stats.queued / this.maxQueueSize;
    const concurrencyUtilization = stats.running / this.maxConcurrent;

    return {
      healthy: queueUtilization < 0.8 && concurrencyUtilization < 0.9,
      queueUtilization: (queueUtilization * 100).toFixed(1) + '%',
      concurrencyUtilization: (concurrencyUtilization * 100).toFixed(1) + '%',
      riskLevel: queueUtilization > 0.9 ? 'critical' : 
                 queueUtilization > 0.7 ? 'high' :
                 queueUtilization > 0.5 ? 'medium' : 'low'
    };
  }

  /**
   * 清空队列和停止处理
   */
  shutdown() {
    clearInterval(this.cleanupInterval);

    // 拒绝所有待处理的任务
    for (const task of this.queue) {
      clearTimeout(task.timeoutHandle);
      task.reject(new Error('服务器正在关闭'));
    }

    this.queue = [];
    this.running = 0;
  }
}

module.exports = RequestQueue;
