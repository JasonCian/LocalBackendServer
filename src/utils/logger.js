/**
 * 日志工具模块
 * 
 * 提供简单的日志记录功能，支持：
 * - 控制台输出
 * - 文件追加写入（logs/service.log）
 * - 多种日志级别（INFO, ERROR）
 * - 自动创建日志目录
 */

const fs = require('fs');
const path = require('path');

// 应用根目录
const appRoot = path.resolve(__dirname, '../..');

// 日志目录和文件路径
const logDir = path.join(appRoot, 'logs');
const logFile = path.join(logDir, 'service.log');

/**
 * 确保日志目录存在
 * 如果目录不存在则创建，创建失败不会抛出异常
 */
function ensureLogDir() {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (e) {
    // 如果日志目录无法创建，继续运行但只输出到控制台
    console.error('无法创建日志目录:', e.message);
  }
}

/**
 * 记录日志
 * 
 * @param {string} level - 日志级别（INFO, ERROR, WARN 等）
 * @param {string} msg - 主要消息内容
 * @param {string} [extra] - 可选的额外信息（如错误堆栈）
 */
function appendLog(level, msg, extra) {
  const time = new Date().toISOString();
  const line = `[${time}] [${level}] ${msg}` + (extra ? ` ${extra}` : '') + '\n';
  
  // 尝试写入文件
  try {
    ensureLogDir();
    fs.appendFileSync(logFile, line, 'utf8');
  } catch (e) {
    // 忽略文件写入错误，至少保持控制台输出
  }
  
  // 输出到控制台
  if (level === 'ERROR') {
    console.error(msg, extra || '');
  } else {
    console.log(msg, extra || '');
  }
}

module.exports = {
  appendLog,
  ensureLogDir,
  logFile
};
