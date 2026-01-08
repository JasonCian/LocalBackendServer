/**
 * 速率限制中间件
 * 
 * 功能：
 * - 基于 IP 的请求限流
 * - 时间窗口控制
 * - 实时限流信息查询
 */

/**
 * 速率限制器类
 */
class RateLimiter {
  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests;     // 时间窗口内最大请求数
    this.windowMs = windowMs;           // 时间窗口（毫秒）
    this.clients = new Map();           // IP -> { count, resetTime, rejected }

    // 定期清理过期数据
    this.cleanupInterval = setInterval(() => this._cleanup(), windowMs);
  }

  /**
   * 检查请求是否被允许
   * 
   * @param {string} clientIP - 客户端 IP
   * @returns {boolean} 是否允许
   */
  check(clientIP) {
    const now = Date.now();
    const client = this.clients.get(clientIP);

    // 如果客户端不存在或时间窗口已过期，创建新的窗口
    if (!client || now >= client.resetTime) {
      this.clients.set(clientIP, {
        count: 1,
        resetTime: now + this.windowMs,
        rejected: 0
      });
      return true; // 允许请求
    }

    // 如果在限制内，增加计数
    if (client.count < this.maxRequests) {
      client.count++;
      return true;
    }

    // 超过限制
    client.rejected++;
    return false;
  }

  /**
   * 获取客户端的限流信息
   * 
   * @param {string} clientIP - 客户端 IP
   * @returns {Object|null} 限流信息或 null
   */
  getClientInfo(clientIP) {
    const client = this.clients.get(clientIP);
    if (!client) return null;

    const now = Date.now();
    const resetIn = Math.max(0, client.resetTime - now);

    return {
      requests: client.count,
      maxRequests: this.maxRequests,
      rejected: client.rejected,
      resetIn: Math.ceil(resetIn / 1000), // 转换为秒
      allowedIn: resetIn
    };
  }

  /**
   * 清理过期的客户端数据
   * @private
   */
  _cleanup() {
    const now = Date.now();
    const expired = [];

    for (const [ip, client] of this.clients) {
      if (now >= client.resetTime + this.windowMs) {
        expired.push(ip);
      }
    }

    for (const ip of expired) {
      this.clients.delete(ip);
    }

    if (expired.length > 0) {
      // 可选：记录清理日志
      // console.log(`[RateLimiter] 清理 ${expired.length} 个过期客户端`);
    }
  }

  /**
   * 获取全局统计信息
   */
  getStats() {
    return {
      activeClients: this.clients.size,
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
      totalRejected: Array.from(this.clients.values()).reduce((sum, c) => sum + c.rejected, 0)
    };
  }

  /**
   * 重置某个客户端的限流计数
   * 
   * @param {string} clientIP - 客户端 IP
   */
  reset(clientIP) {
    if (this.clients.has(clientIP)) {
      this.clients.set(clientIP, {
        count: 0,
        resetTime: Date.now() + this.windowMs,
        rejected: 0
      });
    }
  }

  /**
   * 清空所有限流数据
   */
  clear() {
    this.clients.clear();
  }

  /**
   * 关闭清理定时器
   */
  shutdown() {
    clearInterval(this.cleanupInterval);
  }
}

/**
 * 创建速率限制中间件
 * 
 * @param {RateLimiter} limiter - 限流器实例
 * @param {Function} logger - 日志函数
 * @returns {Function} 中间件函数
 */
function createRateLimitMiddleware(limiter, logger) {
  return function rateLimitMiddleware(req, res) {
    // 获取客户端 IP
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                     req.socket.remoteAddress ||
                     '0.0.0.0';

    // 检查是否超限
    if (!limiter.check(clientIP)) {
      const info = limiter.getClientInfo(clientIP);

      if (logger) {
        logger('WARN', `速率限制触发: ${clientIP} - ${info.requests}/${limiter.maxRequests}`);
      }

      // 返回 429 Too Many Requests
      res.writeHead(429, {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': Math.ceil(info.resetIn)
      });

      res.end(JSON.stringify({
        success: false,
        message: '请求过于频繁，请稍后重试',
        retryAfter: info.resetIn,
        rateLimit: {
          limit: limiter.maxRequests,
          current: info.requests,
          window: limiter.windowMs
        }
      }));

      return true; // 表示请求被限流
    }

    return false; // 表示请求被允许
  };
}

module.exports = {
  RateLimiter,
  createRateLimitMiddleware
};
