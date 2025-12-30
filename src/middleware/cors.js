/**
 * CORS 中间件模块
 * 
 * 提供跨域资源共享（CORS）支持
 * 允许来自不同域的浏览器访问服务器资源
 */

/**
 * 应用 CORS 头到响应对象
 * 
 * @param {http.ServerResponse} res - HTTP 响应对象
 * @param {boolean} enabled - 是否启用 CORS
 */
function applyCorsHeaders(res, enabled) {
  if (enabled) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
  }
}

/**
 * 处理 OPTIONS 预检请求
 * 
 * @param {http.ServerResponse} res - HTTP 响应对象
 * @returns {boolean} 如果处理了 OPTIONS 请求返回 true
 */
function handleOptionsRequest(res) {
  res.writeHead(204);
  res.end();
  return true;
}

module.exports = {
  applyCorsHeaders,
  handleOptionsRequest
};
