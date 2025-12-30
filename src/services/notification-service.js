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
 * @param {Object} target - 通知目标配置 {type, url, headers, format}
 * @param {string} title - 通知标题（用于 Markdown 卡片）
 * @param {string} text - 通知文本内容（支持 Markdown）
 * @param {Array} photos - 图片数组 [{type, photoId, url, ...}]（可选）
 * @returns {Object} JSON 载荷对象
 */
function buildNotificationPayload(target, title, text, photos) {
  const type = String(target?.type || 'custom').toLowerCase();
  const format = String(target?.format || '').toLowerCase();
  
  // 钉钉 Markdown（示例规范：https://open.dingtalk.com/document/robots/internal-chatbot-enables-group-chat-to-send-markdown-messages）
  if (type === 'dingtalk' && format === 'markdown') {
    const payload = {
      msgtype: 'markdown',
      markdown: {
        title: title || '通知',
        text: text || ''
      }
    };
    
    // 如果有图片，添加图片 URL 到 Markdown
    if (photos && photos.length > 0) {
      const photoUrls = photos
        .filter(p => p.url)
        .map(p => `![image](${p.url})`)
        .join('\n');
      if (photoUrls) {
        payload.markdown.text += '\n\n' + photoUrls;
      }
    }
    
    return payload;
  }

  // 钉钉纯文本
  if (type === 'dingtalk') {
    const textContent = photos && photos.length > 0 
      ? `${text}\n\n包含 ${photos.length} 张图片`
      : text;
    return { msgtype: 'text', text: { content: textContent } };
  }
  
  // 飞书/Lark Markdown（支持图片）
  if (type === 'feishu' || type === 'lark') {
    const payload = {
      msg_type: 'post',
      content: {
        post: {
          zh_cn: {
            title: title || '通知',
            content: [
              [{ tag: 'text', text: text }]
            ]
          }
        }
      }
    };
    
    // 如果有图片，添加图片到飞书消息
    if (photos && photos.length > 0) {
      for (const photo of photos) {
        if (photo.url) {
          payload.content.post.zh_cn.content.push([
            { tag: 'img', image_key: photo.url }
          ]);
        }
      }
    }
    
    return payload;
  }
  
  // 自定义格式
  const customPayload = { message: text };
  if (photos && photos.length > 0) {
    customPayload.photos = photos;
  }
  return customPayload;
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
 * @param {Array} [photos] - 图片数组（可选）
 * @returns {Promise<void>}
 */
async function notifyAll(targets, title, detail, logger, photos) {
  if (!targets || !targets.length) return;
  
  const text = detail ? `${title}\n${detail}` : title;
  
  for (const target of targets) {
    const urlStr = target && (target.url || target.endpoint);
    if (!urlStr) continue;
    
    const payload = buildNotificationPayload(target, title, text, photos);
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
