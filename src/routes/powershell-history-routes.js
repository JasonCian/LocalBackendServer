/**
 * PowerShell 历史管理路由处理器
 * 
 * 处理所有 PowerShell 历史管理相关的 HTTP 请求
 */

const fs = require('fs');
const path = require('path');
const url = require('url');

/**
 * 读取请求体
 * 
 * @param {http.IncomingMessage} req - 请求对象
 * @returns {Promise<Object>} 解析后的请求体
 */
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * 发送JSON响应
 * 
 * @param {http.ServerResponse} res - 响应对象
 * @param {number} statusCode - HTTP状态码
 * @param {Object} data - 响应数据
 */
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

/**
 * 处理 PowerShell 历史请求
 * 
 * @param {http.IncomingMessage} req - 请求对象
 * @param {http.ServerResponse} res - 响应对象
 * @param {string} requestPath - 请求路径
 * @param {PowerShellHistoryService} service - 服务实例
 * @param {Function} logger - 日志函数
 * @param {string} mountPath - 挂载路径（默认 /powershell）
 */
async function handlePowerShellHistory(req, res, requestPath, service, logger, mountPath = '/powershell') {
  try {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    // 静态文件: 主页
    if (req.method === 'GET' && (pathname === mountPath || pathname === mountPath + '/')) {
      const htmlPath = path.resolve(__dirname, '../../public/powershell-history.html');
      if (fs.existsSync(htmlPath)) {
        const html = fs.readFileSync(htmlPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } else {
        sendJSON(res, 404, { success: false, message: '页面文件不存在' });
      }
      return;
    }

    // API: 获取历史（带时间戳的记录）
    if (req.method === 'GET' && pathname === `${mountPath}/api/history`) {
      const limit = query.limit ? parseInt(query.limit) : null;
      const records = service.getHistoryRecords(limit);
      sendJSON(res, 200, { success: true, history: records });
      return;
    }

    // API: 清理历史（应用过滤规则）
    if (req.method === 'POST' && pathname === `${mountPath}/api/history/clean`) {
      // 清理历史：应用过滤规则 + 去重
      try {
        const result = service.cleanHistory();
        sendJSON(res, 200, { 
          success: true, 
          message: '历史清理完成', 
          cleanResult: result 
        });
      } catch (err) {
        logger('ERROR', 'PowerShell历史清理失败', err.message);
        sendJSON(res, 500, { success: false, message: err.message });
      }
      return;
    }

    // API: 编辑历史记录
    if (req.method === 'PUT' && pathname.startsWith(`${mountPath}/api/history/`)) {
      const id = pathname.split('/').pop();
      const body = await readRequestBody(req);
      const record = service.editHistoryRecord(id, body.command);
      if (record) {
        sendJSON(res, 200, { success: true, record, message: '命令已更新' });
      } else {
        sendJSON(res, 404, { success: false, message: '记录不存在' });
      }
      return;
    }

    // API: 删除历史记录
    if (req.method === 'DELETE' && pathname.startsWith(`${mountPath}/api/history/`)) {
      const id = pathname.split('/').pop();
      const success = service.deleteHistoryRecord(id);
      sendJSON(res, 200, { success, message: success ? '记录已删除' : '记录不存在' });
      return;
    }

    // API: 获取统计信息
    if (req.method === 'GET' && pathname === `${mountPath}/api/stats`) {
      const stats = service.getStats();
      sendJSON(res, 200, { success: true, stats });
      return;
    }

    // API: 获取规则列表
    if (req.method === 'GET' && pathname === `${mountPath}/api/rules`) {
      const rules = service.getRules();
      sendJSON(res, 200, { success: true, rules });
      return;
    }

    // API: 创建规则
    if (req.method === 'POST' && pathname === `${mountPath}/api/rules`) {
      const body = await readRequestBody(req);
      const rule = service.addRule(body);
      sendJSON(res, 201, { success: true, rule });
      return;
    }

    // API: 更新规则
    if (req.method === 'PUT' && pathname.startsWith(`${mountPath}/api/rules/`)) {
      const ruleId = pathname.split('/').pop();
      const body = await readRequestBody(req);
      const rule = service.updateRule(ruleId, body);
      sendJSON(res, 200, { success: true, rule });
      return;
    }

    // API: 删除规则
    if (req.method === 'DELETE' && pathname.startsWith(`${mountPath}/api/rules/`)) {
      const ruleId = pathname.split('/').pop();
      const success = service.deleteRule(ruleId);
      sendJSON(res, 200, { success, message: success ? '删除成功' : '规则不存在' });
      return;
    }

    // API: 测试规则
    if (req.method === 'POST' && pathname === `${mountPath}/api/rules/test`) {
      const body = await readRequestBody(req);
      const result = service.testRule(body.command, body.ruleId);
      sendJSON(res, 200, { success: true, result });
      return;
    }

    // API: 获取快捷指令列表
    if (req.method === 'GET' && pathname === `${mountPath}/api/shortcuts`) {
      const category = query.category;
      let shortcuts;
      
      if (category) {
        shortcuts = service.getQuickCommandsByCategory(category);
      } else {
        shortcuts = service.getQuickCommands();
      }
      
      sendJSON(res, 200, { success: true, shortcuts });
      return;
    }

    // API: 获取分类列表
    if (req.method === 'GET' && pathname === `${mountPath}/api/shortcuts/categories`) {
      const categories = service.getQuickCommandCategories();
      sendJSON(res, 200, { success: true, categories });
      return;
    }

    // API: 创建快捷指令（将指令写入历史文件）
    if (req.method === 'POST' && pathname === `${mountPath}/api/shortcuts`) {
      const body = await readRequestBody(req);
      const command = service.addQuickCommand(
        body.command,
        body.category || 'custom',
        body.description || ''
      );
      sendJSON(res, 201, { success: true, command, message: '快捷指令已添加到PowerShell历史中' });
      return;
    }

    // API: 删除快捷指令
    if (req.method === 'DELETE' && pathname.startsWith(`${mountPath}/api/shortcuts/`)) {
      const id = pathname.split('/').pop();
      const success = service.deleteQuickCommand(id);
      sendJSON(res, 200, { success, message: success ? '快捷指令已删除' : '快捷指令不存在' });
      return;
    }

    // 未知路由
    sendJSON(res, 404, { success: false, message: '未找到该API端点' });

  } catch (err) {
    logger('ERROR', 'PowerShell历史请求处理失败', err.message);
    sendJSON(res, 500, { success: false, message: err.message });
  }
}

module.exports = {
  handlePowerShellHistory
};
