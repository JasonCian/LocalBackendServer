/**
 * Telegram 路由处理器
 * 
 * 处理 Telegram 服务的所有 HTTP 请求，包括：
 * - 页面渲染
 * - 登录认证 API
 * - 消息发送 API
 * - 任务管理 API
 */

const fs = require('fs');
const path = require('path');
const { parseJsonBody } = require('../middleware/multipart-parser');

/**
 * 读取 Telegram 页面 HTML
 * 
 * @param {string} appRoot - 应用根目录
 * @param {Function} logger - 日志函数
 * @returns {string} HTML 内容
 */
function getTelegramPageHTML(appRoot, logger) {
  try {
    return fs.readFileSync(path.join(appRoot, 'public', 'telegram.html'), 'utf8');
  } catch (e) {
    if (logger) {
      logger('ERROR', '无法读取 telegram.html', e && e.message);
    }
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Error</title></head><body><h1>错误：无法加载 telegram.html</h1><p>${e && e.message}</p></body></html>`;
  }
}

/**
 * 发送 JSON 响应
 * 
 * @param {http.ServerResponse} res - 响应对象
 * @param {number} code - HTTP 状态码
 * @param {Object} obj - JSON 对象
 */
function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

/**
 * 处理 Telegram 路由请求
 * 
 * @param {http.IncomingMessage} req - 请求对象
 * @param {http.ServerResponse} res - 响应对象
 * @param {string} requestPath - 请求路径
 * @param {Object} telegramService - Telegram 服务实例
 * @param {string} appRoot - 应用根目录
 * @param {Function} logger - 日志函数
 */
async function handleTelegram(req, res, requestPath, telegramService, appRoot, logger) {
  try {
    // GET /telegram -> 页面
    if (req.method === 'GET' && (requestPath === '/telegram' || requestPath === '/telegram/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getTelegramPageHTML(appRoot, logger));
      return;
    }

    // API: POST /telegram/api/start （发送验证码）
    if (req.method === 'POST' && requestPath === '/telegram/api/start') {
      const body = await parseJsonBody(req);
      const phone = String(body.phone || '').trim();
      if (!phone) return sendJSON(res, 400, { success: false, message: '缺少 phone' });

      try {
        const result = await telegramService.sendCode(phone);
        return sendJSON(res, 200, result);
      } catch (e) {
        logger('ERROR', 'Telegram 发送验证码失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '发送验证码失败' });
      }
    }

    // API: POST /telegram/api/verify （校验验证码 / 2FA）
    if (req.method === 'POST' && requestPath === '/telegram/api/verify') {
      const body = await parseJsonBody(req);
      const { stateId, code, password } = body || {};
      
      try {
        const result = await telegramService.verify(stateId, code, password);
        return sendJSON(res, 200, result);
      } catch (e) {
        logger('ERROR', 'Telegram 验证失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '验证失败' });
      }
    }

    // API: POST /telegram/api/logout
    if (req.method === 'POST' && requestPath === '/telegram/api/logout') {
      const body = await parseJsonBody(req);
      const { stateId } = body || {};
      
      try {
        await telegramService.logout(stateId);
        return sendJSON(res, 200, { success: true, message: '已注销' });
      } catch (e) {
        logger('ERROR', 'Telegram 注销失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '注销失败' });
      }
    }

    // API: GET /telegram/api/health
    if (req.method === 'GET' && requestPath === '/telegram/api/health') {
      try {
        const health = await telegramService.getHealth();
        return sendJSON(res, 200, { success: true, ...health });
      } catch (e) {
        logger('ERROR', 'Telegram 健康检查失败', e && (e.stack || e.message));
        return sendJSON(res, 500, { success: false, message: e && e.message ? e.message : '健康检查失败' });
      }
    }

    // API: POST /telegram/api/sendNow { to, message }
    if (req.method === 'POST' && requestPath === '/telegram/api/sendNow') {
      const body = await parseJsonBody(req);
      const { to, message } = body || {};
      if (!to || !message) return sendJSON(res, 400, { success: false, message: '缺少 to 或 message' });
      
      try {
        await telegramService.sendNow(to, message);
        return sendJSON(res, 200, { success: true });
      } catch (e) {
        logger('ERROR', 'Telegram 即时发送失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '发送失败' });
      }
    }

    // 任务 API（/telegram/api/tasks, /telegram/api/tasks/:id）
    if (requestPath === '/telegram/api/tasks' && req.method === 'GET') {
      const tasks = telegramService.getTasks();
      return sendJSON(res, 200, { success: true, tasks });
    }
    
    if (requestPath === '/telegram/api/tasks' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.to || !body.message) {
        return sendJSON(res, 400, { success: false, message: '缺少 to 或 message' });
      }
      
      try {
        const task = telegramService.createTask(body);
        return sendJSON(res, 200, { success: true, task });
      } catch (e) {
        logger('ERROR', 'Telegram 创建任务失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '创建任务失败' });
      }
    }
    
    if (requestPath.startsWith('/telegram/api/tasks/') && req.method === 'PUT') {
      const id = requestPath.split('/').pop();
      const body = await parseJsonBody(req);
      
      try {
        const updated = telegramService.updateTask(id, body);
        if (!updated) {
          return sendJSON(res, 404, { success: false, message: '任务不存在' });
        }
        return sendJSON(res, 200, { success: true, task: updated });
      } catch (e) {
        logger('ERROR', 'Telegram 更新任务失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '更新任务失败' });
      }
    }
    
    if (requestPath.startsWith('/telegram/api/tasks/') && req.method === 'DELETE') {
      const id = requestPath.split('/').pop();
      
      try {
        const success = telegramService.deleteTask(id);
        if (!success) {
          return sendJSON(res, 404, { success: false, message: '任务不存在' });
        }
        return sendJSON(res, 200, { success: true });
      } catch (e) {
        logger('ERROR', 'Telegram 删除任务失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '删除任务失败' });
      }
    }

    // 其它：404
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, message: '未匹配的 Telegram 路由' }));
  } catch (err) {
    logger('ERROR', 'Telegram 路由处理异常', err && (err.stack || err.message));
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, message: err.message || '内部错误' }));
  }
}

module.exports = {
  handleTelegram,
  sendJSON,
  getTelegramPageHTML
};
