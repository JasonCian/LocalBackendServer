/**
 * 文件删除路由处理器
 * 
 * 处理文件删除请求，支持：
 * - 批量删除
 * - URL 到本地路径映射
 * - 安全检查（仅删除映射目录内的文件）
 * - PicList 兼容格式
 */

const fs = require('fs');
const { parseJsonBody } = require('../middleware/multipart-parser');
const { mapUrlToLocalPath } = require('../utils/path-resolver');

/**
 * 处理文件删除请求（PicList 兼容）
 * 
 * @param {http.IncomingMessage} req - 请求对象
 * @param {http.ServerResponse} res - 响应对象
 * @param {Object} config - 服务器配置
 * @param {Function} logger - 日志函数
 */
async function handleDelete(req, res, config, logger) {
  try {
    const body = await parseJsonBody(req);
    const list = Array.isArray(body?.list)
      ? body.list
      : Array.isArray(body)
        ? body
        : [];

    if (logger) {
      logger('INFO', `Delete request body length=${list.length}`);
    }

    if (!list.length) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: '缺少删除列表 list' }));
      return;
    }

    const results = [];

    for (const item of list) {
      const target = typeof item === 'string'
        ? item
        : (item?.url || item?.imgUrl || item?.fullResult || item?.path || item?.key || item?.name || '');

      if (!target) {
        results.push({ success: false, target: item, message: '无效的目标' });
        continue;
      }

      const localPath = mapUrlToLocalPath(target, config.directories);
      if (!localPath) {
        results.push({ success: false, target, message: '未找到匹配的目录映射' });
        continue;
      }

      // 安全校验：路径必须在映射目录内
      let inMapped = false;
      const path = require('path');
      const { appRoot } = require('../utils/path-resolver');
      
      for (const dirConfig of config.directories || []) {
        const base = path.isAbsolute(dirConfig.path) ? dirConfig.path : path.join(appRoot, dirConfig.path);
        const normalizedBase = path.normalize(base);
        if (localPath.startsWith(normalizedBase)) {
          inMapped = true;
          break;
        }
      }

      if (!inMapped) {
        results.push({ success: false, target, message: '路径未在映射目录内' });
        continue;
      }

      try {
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
          results.push({ success: true, target, path: localPath });
        } else {
          results.push({ success: false, target, path: localPath, message: '文件不存在' });
        }
      } catch (err) {
        results.push({ success: false, target, path: localPath, message: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const responseBody = {
      success: successCount > 0,
      result: results,
      successCount,
      total: results.length,
      message: successCount > 0 ? '删除完成' : '所有删除操作失败'
    };

    res.writeHead(successCount > 0 ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(responseBody));
  } catch (err) {
    if (logger) {
      logger('ERROR', '删除处理错误', err && err.message);
    }
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, message: err.message }));
  }
}

module.exports = {
  handleDelete
};
