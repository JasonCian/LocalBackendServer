/**
 * 缓存管理器 - 提供 LRU 缓存和 TTL 支持
 * 
 * 功能：
 * - LRU (最近最少使用) 缓存策略
 * - TTL (生存时间) 自动过期
 * - 命名空间隔离
 * - 性能监控（命中率、大小）
 */

/**
 * CacheEntry - 缓存项
 */
class CacheEntry {
  constructor(key, value, ttl = null) {
    this.key = key;
    this.value = value;
    this.createdAt = Date.now();
    this.ttl = ttl;
    this.accessCount = 0;
    this.lastAccessAt = this.createdAt;
  }

  /**
   * 检查是否过期
   */
  isExpired() {
    if (!this.ttl) return false;
    return Date.now() - this.createdAt > this.ttl;
  }

  /**
   * 获取值（更新访问信息）
   */
  getValue() {
    this.accessCount++;
    this.lastAccessAt = Date.now();
    return this.value;
  }

  /**
   * 获取大小（字节估算）
   */
  getSize() {
    try {
      return JSON.stringify(this.value).length;
    } catch (e) {
      return 0;
    }
  }
}

/**
 * CacheManager - 缓存管理器
 */
class CacheManager {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 50 * 1024 * 1024; // 50MB 默认
    this.maxItems = options.maxItems || 1000; // 最多 1000 项
    this.cleanupInterval = options.cleanupInterval || 60000; // 60s 清理一次
    this.namespaces = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0
    };

    // 定期清理过期项
    this.cleanupTimer = setInterval(() => this._cleanup(), this.cleanupInterval);
  }

  /**
   * 获取或创建命名空间
   */
  _getNamespace(namespace = 'default') {
    if (!this.namespaces.has(namespace)) {
      this.namespaces.set(namespace, new Map());
    }
    return this.namespaces.get(namespace);
  }

  /**
   * 设置缓存
   */
  set(key, value, ttl = null, namespace = 'default') {
    const ns = this._getNamespace(namespace);
    const entry = new CacheEntry(key, value, ttl);

    // 检查是否需要驱逐
    if (this._isFull()) {
      this._evict(namespace);
    }

    ns.set(key, entry);
  }

  /**
   * 获取缓存
   */
  get(key, namespace = 'default') {
    const ns = this._getNamespace(namespace);
    const entry = ns.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // 检查是否过期
    if (entry.isExpired()) {
      ns.delete(key);
      this.stats.expirations++;
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.getValue();
  }

  /**
   * 检查缓存是否存在
   */
  has(key, namespace = 'default') {
    const ns = this._getNamespace(namespace);
    const entry = ns.get(key);

    if (!entry) return false;
    if (entry.isExpired()) {
      ns.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 删除缓存
   */
  delete(key, namespace = 'default') {
    const ns = this._getNamespace(namespace);
    return ns.delete(key);
  }

  /**
   * 清空特定命名空间的缓存
   */
  clear(namespace = 'default') {
    const ns = this._getNamespace(namespace);
    ns.clear();
  }

  /**
   * 获取命名空间统计信息
   */
  getStats(namespace = 'default') {
    const ns = this._getNamespace(namespace);
    const entries = Array.from(ns.values());

    let totalSize = 0;
    let validItems = 0;

    entries.forEach(entry => {
      if (!entry.isExpired()) {
        totalSize += entry.getSize();
        validItems++;
      }
    });

    return {
      items: validItems,
      size: totalSize,
      sizeKB: Math.round(totalSize / 1024),
      hitRate:
        this.stats.hits + this.stats.misses > 0
          ? (
              (this.stats.hits /
                (this.stats.hits + this.stats.misses)) *
              100
            ).toFixed(2) + '%'
          : '0%',
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      expirations: this.stats.expirations
    };
  }

  /**
   * 私有方法：检查是否满了
   */
  _isFull() {
    const totalItems = Array.from(this.namespaces.values()).reduce(
      (sum, ns) => sum + ns.size,
      0
    );
    return totalItems >= this.maxItems;
  }

  /**
   * 私有方法：驱逐最少使用的项
   */
  _evict(namespace = 'default') {
    const ns = this._getNamespace(namespace);

    // 先清理过期项
    const expiredKeys = [];
    ns.forEach((entry, key) => {
      if (entry.isExpired()) {
        expiredKeys.push(key);
      }
    });

    expiredKeys.forEach(key => {
      ns.delete(key);
      this.stats.expirations++;
    });

    // 如果仍然满，使用 LRU 驱逐
    if (this._isFull()) {
      let lruKey = null;
      let lruTime = Infinity;

      ns.forEach((entry, key) => {
        if (entry.lastAccessAt < lruTime) {
          lruTime = entry.lastAccessAt;
          lruKey = key;
        }
      });

      if (lruKey) {
        ns.delete(lruKey);
        this.stats.evictions++;
      }
    }
  }

  /**
   * 私有方法：定期清理过期项
   */
  _cleanup() {
    this.namespaces.forEach((ns, namespace) => {
      const expiredKeys = [];

      ns.forEach((entry, key) => {
        if (entry.isExpired()) {
          expiredKeys.push(key);
        }
      });

      expiredKeys.forEach(key => {
        ns.delete(key);
        this.stats.expirations++;
      });
    });
  }

  /**
   * 销毁缓存管理器（清理定时器）
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 获取全局统计信息
   */
  getGlobalStats() {
    let totalSize = 0;
    let totalItems = 0;

    this.namespaces.forEach(ns => {
      ns.forEach(entry => {
        if (!entry.isExpired()) {
          totalSize += entry.getSize();
          totalItems++;
        }
      });
    });

    return {
      namespaces: this.namespaces.size,
      items: totalItems,
      size: totalSize,
      sizeKB: Math.round(totalSize / 1024),
      sizeMB: (totalSize / 1024 / 1024).toFixed(2),
      hitRate:
        this.stats.hits + this.stats.misses > 0
          ? (
              (this.stats.hits /
                (this.stats.hits + this.stats.misses)) *
              100
            ).toFixed(2) + '%'
          : '0%',
      ...this.stats
    };
  }
}

// 创建全局缓存实例
const globalCache = new CacheManager({
  maxSize: 100 * 1024 * 1024, // 100MB
  maxItems: 2000,
  cleanupInterval: 60000
});

module.exports = {
  CacheManager,
  CacheEntry,
  globalCache
};
