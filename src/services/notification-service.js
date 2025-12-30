/**
 * 通知服务模块
 * 
 * 支持多种通知方式：
 * - 钉钉机器人 Webhook
 * - 飞书/Lark 机器人 Webhook
 * - 自定义 Webhook
 */

const http = require('http');
const https = require('https');

/**
 * 根据目标类型构建通知载荷
 * 
 * @param {Object} target - 通知目标配置 {type, url, headers}
 * @param {string} text - 通知文本内容
 * @returns {Object} JSON 载荷对象
 */
function buildNotificationPayload(target, text) {
  const type = String(target?.type || 'custom').toLowerCase();
  
  if (type === 'dingtalk') {
    return { msgtype: 'text', text: { content: text } };
  }
  
  if (type === 'feishu' || type === 'lark') {
    return { msg_type: 'text', content: { text } };
  }
  
  // 自定义格式
  return { message: text };
}

/**
 * 发送 JSON POST 请求到 Webhook
 * 
 * @param {string} targetUrl - Webhook URL
 * @param {Object} payload - JSON 载荷
 * @param {Object} extraHeaders - 额外的 HTTP 头
 * @returns {Promise<void>}
 */
function postJsonWebhook(targetUrl, payload, extraHeaders) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(targetUrl);
      const body = Buffer.from(JSON.stringify(payload || {}));
      const options = {
        method: 'POST',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: (u.pathname || '/') + (u.search || ''),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body.length,
          ...(extraHeaders || {})
        }
      };
      const client = u.protocol === 'https:' ? https : http;
      const req = client.request(options, res => {
        res.on('data', () => {});
        res.on('end', resolve);
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 发送通知到所有配置的目标
 * 
 * @param {Array} targets - 通知目标数组
 * @param {string} title - 通知标题
 * @param {string} [detail] - 详细信息（可选）
 * @param {Function} logger - 日志记录函数
 * @returns {Promise<void>}
 */
async function notifyAll(targets, title, detail, logger) {
  if (!targets || !targets.length) return;
  
  const text = detail ? `${title}\n${detail}` : title;
  
  for (const target of targets) {
    const urlStr = target && (target.url || target.endpoint);
    if (!urlStr) continue;
    
    const payload = buildNotificationPayload(target, text);
    try {
      await postJsonWebhook(urlStr, payload, target.headers);
      if (logger) {
        logger('INFO', `通知发送成功 -> ${urlStr}`);
      }
    } catch (err) {
      if (logger) {
        logger('ERROR', '通知发送失败', `${urlStr} ${err && err.message ? err.message : err}`);
      }
    }
  }
}

module.exports = {
  notifyAll,
  buildNotificationPayload,
  postJsonWebhook
};
