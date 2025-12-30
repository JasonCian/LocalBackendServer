/**
 * HTML 转义工具模块
 * 
 * 提供 HTML 字符转义功能，防止 XSS 攻击
 */

/**
 * HTML 特殊字符映射表
 */
const htmlEscapeMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
};

/**
 * 转义 HTML 特殊字符
 * 
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的安全文本
 */
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, m => htmlEscapeMap[m]);
}

module.exports = {
  escapeHtml
};
