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
 * @param {string} mountPath - 挂载路径（默认 /telegram）
 */
async function handleTelegram(req, res, requestPath, telegramService, appRoot, logger, mountPath = '/telegram') {
  try {
    // GET /telegram -> 多账号管理页面
    if (req.method === 'GET' && (requestPath === mountPath || requestPath === mountPath + '/')) {
      const html = fs.readFileSync(path.join(appRoot, 'public', 'telegram-multi-account.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    
    // GET /telegram/legacy -> 原单账号页面
    if (req.method === 'GET' && requestPath === `${mountPath}/legacy`) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getTelegramPageHTML(appRoot, logger));
      return;
    }

    // API: POST /telegram/api/start （发送验证码）
    if (req.method === 'POST' && requestPath === `${mountPath}/api/start`) {
      const body = await parseJsonBody(req);
      const phone = String(body.phone || '').trim();
      const accountId = body.accountId || null;
      if (!phone) return sendJSON(res, 400, { success: false, message: '缺少 phone' });

      try {
        const result = await telegramService.sendCode(phone, accountId);
        return sendJSON(res, 200, result);
      } catch (e) {
        logger('ERROR', 'Telegram 发送验证码失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '发送验证码失败' });
      }
    }

    // API: POST /telegram/api/verify （校验验证码 / 2FA）
    if (req.method === 'POST' && requestPath === `${mountPath}/api/verify`) {
      const body = await parseJsonBody(req);
      const { stateId, code, password, accountId } = body || {};
      
      try {
        const result = await telegramService.verify(stateId, code, password, accountId);
        return sendJSON(res, 200, result);
      } catch (e) {
        logger('ERROR', 'Telegram 验证失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '验证失败' });
      }
    }

    // API: POST /telegram/api/logout
    if (req.method === 'POST' && requestPath === `${mountPath}/api/logout`) {
      const body = await parseJsonBody(req);
      const { stateId, accountId } = body || {};
      
      try {
        await telegramService.logout(stateId, accountId);
        return sendJSON(res, 200, { success: true, message: '已注销' });
      } catch (e) {
        logger('ERROR', 'Telegram 注销失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '注销失败' });
      }
    }

    // API: GET /telegram/api/health （支持查询参数 accountId）
    if (req.method === 'GET' && requestPath.startsWith(`${mountPath}/api/health`)) {
      try {
        const url = require('url');
        const parsed = url.parse(req.url, true);
        const accountId = parsed.query.accountId || null;
        
        const health = await telegramService.getHealth(accountId);
        return sendJSON(res, 200, { success: true, ...health });
      } catch (e) {
        logger('ERROR', 'Telegram 健康检查失败', e && (e.stack || e.message));
        return sendJSON(res, 500, { success: false, message: e && e.message ? e.message : '健康检查失败' });
      }
    }

    // API: POST /telegram/api/sendNow { to, message, accountId }
    if (req.method === 'POST' && requestPath === `${mountPath}/api/sendNow`) {
      const body = await parseJsonBody(req);
      const { to, message, accountId } = body || {};
      if (!to || !message) return sendJSON(res, 400, { success: false, message: '缺少 to 或 message' });
      
      try {
        await telegramService.sendNow(to, message, accountId);
        return sendJSON(res, 200, { success: true });
      } catch (e) {
        logger('ERROR', 'Telegram 即时发送失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '发送失败' });
      }
    }

    // ========== 账号管理 API ==========
    
    // GET /telegram/api/accounts - 获取所有账号
    if (requestPath === `${mountPath}/api/accounts` && req.method === 'GET') {
      try {
        const accounts = await telegramService.getAllAccountsHealth();
        return sendJSON(res, 200, { success: true, accounts });
      } catch (e) {
        logger('ERROR', 'Telegram 获取账号列表失败', e && (e.stack || e.message));
        return sendJSON(res, 500, { success: false, message: e && e.message ? e.message : '获取账号列表失败' });
      }
    }
    
    // POST /telegram/api/accounts - 添加新账号
    if (requestPath === `${mountPath}/api/accounts` && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { phone, name } = body || {};
      if (!phone) return sendJSON(res, 400, { success: false, message: '缺少 phone' });
      
      try {
        const account = telegramService.addAccount(phone, name);
        return sendJSON(res, 200, { success: true, account });
      } catch (e) {
        logger('ERROR', 'Telegram 添加账号失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '添加账号失败' });
      }
    }
    
    // PUT /telegram/api/accounts/:id - 更新账号
    if (requestPath.startsWith(`${mountPath}/api/accounts/`) && req.method === 'PUT') {
      const id = requestPath.split('/').pop();
      const body = await parseJsonBody(req);
      
      try {
        const account = telegramService.updateAccount(id, body);
        if (!account) {
          return sendJSON(res, 404, { success: false, message: '账号不存在' });
        }
        return sendJSON(res, 200, { success: true, account });
      } catch (e) {
        logger('ERROR', 'Telegram 更新账号失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '更新账号失败' });
      }
    }
    
    // DELETE /telegram/api/accounts/:id - 删除账号
    if (requestPath.startsWith(`${mountPath}/api/accounts/`) && req.method === 'DELETE') {
      const id = requestPath.split('/').pop();
      
      try {
        const success = telegramService.removeAccount(id);
        if (!success) {
          return sendJSON(res, 404, { success: false, message: '账号不存在' });
        }
        return sendJSON(res, 200, { success: true });
      } catch (e) {
        logger('ERROR', 'Telegram 删除账号失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '删除账号失败' });
      }
    }
    
    // POST /telegram/api/accounts/:id/switch - 切换活跃账号
    const switchPattern = new RegExp(`^${mountPath.replace(/\//g, '\\/')}\\/api\\/accounts\\/[^\\/]+\\/switch$`);
    if (requestPath.match(switchPattern) && req.method === 'POST') {
      const id = requestPath.split('/')[4];
      
      try {
        const success = telegramService.switchAccount(id);
        if (!success) {
          return sendJSON(res, 404, { success: false, message: '账号不存在' });
        }
        return sendJSON(res, 200, { success: true });
      } catch (e) {
        logger('ERROR', 'Telegram 切换账号失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '切换账号失败' });
      }
    }

    // ========== 任务 API ==========
    
    // GET /telegram/api/tasks（支持查询参数 accountId）
    if (requestPath.startsWith(`${mountPath}/api/tasks`) && req.method === 'GET') {
      const url = require('url');
      const parsed = url.parse(req.url, true);
      const accountId = parsed.query.accountId || null;
      
      const tasks = telegramService.getTasks(accountId);
      return sendJSON(res, 200, { success: true, tasks });
    }
    
    if (requestPath === `${mountPath}/api/tasks` && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const taskType = String(body.type || 'send').toLowerCase();
      
      // 根据任务类型进行不同的验证
      if (taskType === 'listen') {
        // 监听任务：需要 channel
        if (!body.channel) {
          return sendJSON(res, 400, { success: false, message: '缺少 channel（监听频道）' });
        }
      } else {
        // 发送任务：需要 to 和 message
        if (!body.to || !body.message) {
          return sendJSON(res, 400, { success: false, message: '缺少 to 或 message（发送任务）' });
        }
      }
      
      try {
        const task = telegramService.createTask(body);
        return sendJSON(res, 200, { success: true, task });
      } catch (e) {
        logger('ERROR', 'Telegram 创建任务失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '创建任务失败' });
      }
    }
    
    if (requestPath.startsWith(`${mountPath}/api/tasks/`) && req.method === 'PUT') {
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
    
    // POST /telegram/api/runTask { taskId, accountId }  立刻执行一次
    if (requestPath === `${mountPath}/api/runTask` && req.method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.taskId) {
        return sendJSON(res, 400, { success: false, message: '缺少 taskId' });
      }

      try {
        const result = await telegramService.runTaskNow(body.taskId, body.accountId || null);
        if (!result.success) {
          return sendJSON(res, 400, { success: false, message: result.message });
        }
        return sendJSON(res, 200, { success: true, message: result.message });
      } catch (e) {
        logger('ERROR', 'Telegram 执行任务失败', e && (e.stack || e.message));
        return sendJSON(res, 400, { success: false, message: e && e.message ? e.message : '执行任务失败' });
      }
    }

    if (requestPath.startsWith(`${mountPath}/api/tasks/`) && req.method === 'DELETE') {
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
