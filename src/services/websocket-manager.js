/**
 * WebSocket 服务管理器 - 实时推送
 * 
 * 功能：
 * - 连接管理（连接/断开、心跳、重连）
 * - 事件订阅/发布
 * - 消息路由
 * - 错误恢复
 */

const EventEmitter = require('events');

/**
 * WebSocket 客户端包装类
 */
class WebSocketClient {
  constructor(socket, id) {
    this.socket = socket;
    this.id = id;
    this.subscriptions = new Set();
    this.isAlive = true;
    this.createdAt = Date.now();
  }

  /**
   * 订阅频道
   */
  subscribe(channel) {
    this.subscriptions.add(channel);
  }

  /**
   * 取消订阅
   */
  unsubscribe(channel) {
    this.subscriptions.delete(channel);
  }

  /**
   * 清空所有订阅
   */
  clearSubscriptions() {
    this.subscriptions.clear();
  }

  /**
   * 发送消息
   */
  send(message) {
    try {
      if (this.socket.readyState === 1) { // OPEN
        this.socket.send(JSON.stringify(message));
        return true;
      }
    } catch (err) {
      // 忽略错误
    }
    return false;
  }

  /**
   * 获取连接信息
   */
  getInfo() {
    return {
      id: this.id,
      subscriptions: Array.from(this.subscriptions),
      isAlive: this.isAlive,
      uptime: Date.now() - this.createdAt,
      state: this.socket.readyState
    };
  }

  /**
   * 关闭连接
   */
  close(code = 1000, reason = 'Normal closure') {
    try {
      this.socket.close(code, reason);
    } catch (err) {
      // 忽略错误
    }
  }
}

/**
 * WebSocket 服务管理器
 */
class WebSocketManager extends EventEmitter {
  constructor(logger) {
    super();
    this.logger = logger;
    this.clients = new Map();
    this.clientCounter = 0;
    this.channels = new Map();
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      messagesReceived: 0,
      messagesSent: 0,
      errors: 0
    };

    // 定期心跳检测
    this.heartbeatInterval = setInterval(() => this._sendHeartbeats(), 30000);

    logger('INFO', '✅ WebSocket 管理器已初始化');
  }

  /**
   * 处理新连接
   */
  handleConnection(socket) {
    const clientId = `ws_${++this.clientCounter}`;
    const client = new WebSocketClient(socket, clientId);

    this.clients.set(clientId, client);
    this.stats.totalConnections++;
    this.stats.activeConnections++;

    this.logger('INFO', `[WS] 客户端连接: ${clientId}`);

    // 处理消息
    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this._handleMessage(clientId, message);
      } catch (err) {
        this.logger('WARN', `[WS] 消息解析失败: ${err.message}`);
        this.stats.errors++;
      }
    });

    // 处理关闭
    socket.on('close', () => {
      this.clients.delete(clientId);
      this.stats.activeConnections--;
      this.logger('INFO', `[WS] 客户端断开: ${clientId}`);
    });

    // 处理错误
    socket.on('error', (err) => {
      this.logger('ERROR', `[WS] 客户端错误: ${err.message}`);
      this.stats.errors++;
    });

    // 发送欢迎消息
    client.send({
      type: 'welcome',
      clientId,
      timestamp: Date.now(),
      message: '欢迎连接到实时推送服务'
    });

    // 触发连接事件
    this.emit('client:connected', { clientId, client });
  }

  /**
   * 私有方法：处理客户端消息
   */
  _handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { type, channel, data } = message;
    this.stats.messagesReceived++;

    switch (type) {
      case 'subscribe':
        if (channel) {
          client.subscribe(channel);
          this._addChannelSubscriber(channel, clientId);
          client.send({
            type: 'subscribed',
            channel,
            timestamp: Date.now()
          });
          this.logger('INFO', `[WS] 客户端 ${clientId} 订阅频道: ${channel}`);
        }
        break;

      case 'unsubscribe':
        if (channel) {
          client.unsubscribe(channel);
          this._removeChannelSubscriber(channel, clientId);
          client.send({
            type: 'unsubscribed',
            channel,
            timestamp: Date.now()
          });
          this.logger('INFO', `[WS] 客户端 ${clientId} 取消订阅: ${channel}`);
        }
        break;

      case 'ping':
        client.send({
          type: 'pong',
          timestamp: Date.now()
        });
        break;

      case 'get_subscriptions':
        client.send({
          type: 'subscriptions',
          subscriptions: Array.from(client.subscriptions),
          timestamp: Date.now()
        });
        break;

      default:
        this.logger('WARN', `[WS] 未知消息类型: ${type}`);
    }
  }

  /**
   * 私有方法：添加频道订阅者
   */
  _addChannelSubscriber(channel, clientId) {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel).add(clientId);
  }

  /**
   * 私有方法：移除频道订阅者
   */
  _removeChannelSubscriber(channel, clientId) {
    if (this.channels.has(channel)) {
      this.channels.get(channel).delete(clientId);
      if (this.channels.get(channel).size === 0) {
        this.channels.delete(channel);
      }
    }
  }

  /**
   * 私有方法：发送心跳
   */
  _sendHeartbeats() {
    const heartbeat = {
      type: 'heartbeat',
      timestamp: Date.now(),
      stats: {
        activeConnections: this.stats.activeConnections,
        messagesReceived: this.stats.messagesReceived,
        messagesSent: this.stats.messagesSent
      }
    };

    this.clients.forEach(client => {
      if (!client.send(heartbeat)) {
        // 发送失败，标记为死亡
        client.isAlive = false;
      }
    });
  }

  /**
   * 发布事件到频道
   */
  publish(channel, data, metadata = {}) {
    if (!this.channels.has(channel)) return 0;

    const message = {
      type: 'event',
      channel,
      data,
      metadata,
      timestamp: Date.now()
    };

    let count = 0;
    const subscribers = this.channels.get(channel);

    subscribers.forEach(clientId => {
      const client = this.clients.get(clientId);
      if (client && client.send(message)) {
        count++;
        this.stats.messagesSent++;
      }
    });

    return count;
  }

  /**
   * 发送通知到特定客户端
   */
  notify(clientId, type, data) {
    const client = this.clients.get(clientId);
    if (!client) return false;

    const message = {
      type,
      data,
      timestamp: Date.now()
    };

    if (client.send(message)) {
      this.stats.messagesSent++;
      return true;
    }
    return false;
  }

  /**
   * 广播消息到所有客户端
   */
  broadcast(type, data) {
    const message = {
      type,
      data,
      timestamp: Date.now()
    };

    let count = 0;
    this.clients.forEach(client => {
      if (client.send(message)) {
        count++;
        this.stats.messagesSent++;
      }
    });

    return count;
  }

  /**
   * 获取频道信息
   */
  getChannelInfo(channel) {
    if (!this.channels.has(channel)) {
      return null;
    }

    const subscribers = this.channels.get(channel);
    return {
      name: channel,
      subscriberCount: subscribers.size,
      subscribers: Array.from(subscribers)
    };
  }

  /**
   * 获取所有频道列表
   */
  listChannels() {
    const channels = [];
    this.channels.forEach((subscribers, channel) => {
      channels.push({
        name: channel,
        subscriberCount: subscribers.size
      });
    });
    return channels;
  }

  /**
   * 获取客户端信息
   */
  getClientInfo(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return null;
    return client.getInfo();
  }

  /**
   * 列出所有客户端
   */
  listClients() {
    const clients = [];
    this.clients.forEach(client => {
      clients.push(client.getInfo());
    });
    return clients;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      channels: this.channels.size,
      clients: this.clients.size
    };
  }

  /**
   * 关闭所有连接
   */
  async shutdown() {
    this.logger('INFO', '[WS] 关闭所有 WebSocket 连接...');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    const closePromises = Array.from(this.clients.values()).map(
      client =>
        new Promise(resolve => {
          client.close(1001, 'Server shutdown');
          setTimeout(resolve, 100);
        })
    );

    await Promise.all(closePromises);
    this.clients.clear();
    this.channels.clear();

    this.logger('INFO', '[WS] WebSocket 连接已全部关闭');
  }
}

module.exports = WebSocketManager;
