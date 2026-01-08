/**
 * 性能指标收集器
 * 
 * 功能：
 * - 跟踪请求响应时间
 * - 监控内存使用
 * - 收集错误率
 * - 生成性能报告
 */

/**
 * 性能收集器类
 */
class PerformanceCollector {
  constructor(logger) {
    this.logger = logger;

    // 请求指标
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],           // 最近1000个请求的响应时间
      errorRate: 0,                // 错误率（%）
      avgResponseTime: 0,          // 平均响应时间（ms）
      maxResponseTime: 0,          // 最大响应时间（ms）
      minResponseTime: Infinity    // 最小响应时间（ms）
    };

    // 内存指标
    this.memory = {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0,
      maxHeapUsed: 0
    };

    // WebSocket 指标
    this.websocket = {
      connections: 0,
      maxConnections: 0,
      messagesReceived: 0,
      messagesSent: 0,
      errors: 0
    };

    // 启动时间
    this.startTime = Date.now();
    this.sampleInterval = setInterval(() => this._collectMemory(), 10000);
  }

  /**
   * 记录请求指标
   */
  recordRequest(responseTimeMs, success = true) {
    this.metrics.totalRequests++;

    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // 记录响应时间
    this.metrics.responseTimes.push(responseTimeMs);
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes.shift();
    }

    // 更新统计
    this.metrics.maxResponseTime = Math.max(
      this.metrics.maxResponseTime,
      responseTimeMs
    );

    this.metrics.minResponseTime = Math.min(
      this.metrics.minResponseTime,
      responseTimeMs
    );

    // 计算平均响应时间
    this.metrics.avgResponseTime = Math.round(
      this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length
    );

    // 计算错误率
    this.metrics.errorRate = this.metrics.totalRequests > 0
      ? ((this.metrics.failedRequests / this.metrics.totalRequests) * 100).toFixed(2)
      : 0;
  }

  /**
   * 收集内存指标
   * @private
   */
  _collectMemory() {
    const usage = process.memoryUsage();

    this.memory.heapUsed = Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100;
    this.memory.heapTotal = Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100;
    this.memory.external = Math.round(usage.external / 1024 / 1024 * 100) / 100;
    this.memory.rss = Math.round(usage.rss / 1024 / 1024 * 100) / 100;

    // 记录最大内存使用
    this.memory.maxHeapUsed = Math.max(this.memory.maxHeapUsed, this.memory.heapUsed);

    // 告警检查
    if (this.memory.heapUsed > 500) {
      this.logger('WARN', `⚠️ 内存使用过高: ${this.memory.heapUsed}MB`);
    }
  }

  /**
   * 更新 WebSocket 指标
   */
  updateWebSocket(connections, messagesReceived = 0, messagesSent = 0, errors = 0) {
    this.websocket.connections = connections;
    this.websocket.maxConnections = Math.max(this.websocket.maxConnections, connections);

    if (messagesReceived > 0) this.websocket.messagesReceived += messagesReceived;
    if (messagesSent > 0) this.websocket.messagesSent += messagesSent;
    if (errors > 0) this.websocket.errors += errors;
  }

  /**
   * 获取完整的性能报告
   */
  getReport() {
    const uptime = Math.round((Date.now() - this.startTime) / 1000);

    return {
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`,
      
      // 请求指标
      requests: {
        total: this.metrics.totalRequests,
        successful: this.metrics.successfulRequests,
        failed: this.metrics.failedRequests,
        errorRate: `${this.metrics.errorRate}%`,
        avgResponseTime: `${this.metrics.avgResponseTime}ms`,
        maxResponseTime: `${this.metrics.maxResponseTime}ms`,
        minResponseTime: `${this.metrics.minResponseTime}ms`
      },

      // 内存指标
      memory: {
        heapUsed: `${this.memory.heapUsed}MB`,
        heapTotal: `${this.memory.heapTotal}MB`,
        external: `${this.memory.external}MB`,
        rss: `${this.memory.rss}MB`,
        maxHeapUsed: `${this.memory.maxHeapUsed}MB`
      },

      // WebSocket 指标
      websocket: {
        connections: this.websocket.connections,
        maxConnections: this.websocket.maxConnections,
        messagesReceived: this.websocket.messagesReceived,
        messagesSent: this.websocket.messagesSent,
        errors: this.websocket.errors
      },

      // 系统指标
      system: {
        ...process.cpuUsage(),
        uptime: uptime
      }
    };
  }

  /**
   * 获取简化的健康状态
   */
  getHealthStatus() {
    const errorRate = parseFloat(this.metrics.errorRate);
    const memory = this.memory.heapUsed / this.memory.heapTotal;

    return {
      status: errorRate > 10 || memory > 0.9 ? 'unhealthy' : 
              errorRate > 5 || memory > 0.75 ? 'warning' : 'healthy',
      errorRate: `${this.metrics.errorRate}%`,
      memoryUsage: `${Math.round(memory * 100)}%`,
      uptime: Math.round((Date.now() - this.startTime) / 1000)
    };
  }

  /**
   * 重置指标
   */
  reset() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],
      errorRate: 0,
      avgResponseTime: 0,
      maxResponseTime: 0,
      minResponseTime: Infinity
    };

    this.websocket = {
      connections: 0,
      maxConnections: 0,
      messagesReceived: 0,
      messagesSent: 0,
      errors: 0
    };

    this.startTime = Date.now();
  }

  /**
   * 清理资源
   */
  shutdown() {
    clearInterval(this.sampleInterval);
  }
}

module.exports = PerformanceCollector;
