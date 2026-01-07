/**
 * Bing Daily Image proxy route
 * Fetches Bing's JSON server-side to avoid browser CORS.
 */

const https = require('https');

const REQUEST_TIMEOUT_MS = 6000;

function handleBingDaily(req, res, appendLog) {
  const url = 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1';

  try {
    const request = https.get(url, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        try {
          const json = JSON.parse(data);
          const img = json && json.images && json.images[0];
          const imageUrl = img && img.url ? ('https://www.bing.com' + img.url) : null;
          if (imageUrl) {
            appendLog && appendLog('INFO', 'Bing 日图获取成功', imageUrl);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, imageUrl }));
          } else {
            appendLog && appendLog('WARN', 'Bing JSON 无有效图片字段');
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, message: '无图片数据' }));
          }
        } catch (e) {
          appendLog && appendLog('ERROR', '解析 Bing JSON 失败', e && (e.stack || e.message));
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: '解析失败' }));
        }
      });
    });

    request.on('error', (err) => {
      appendLog && appendLog('ERROR', '请求 Bing 接口失败', err && err.message);
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: '上游不可用' }));
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      appendLog && appendLog('WARN', '请求 Bing 接口超时');
      try { request.destroy(); } catch (_) {}
      res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: '请求超时' }));
    });

  } catch (err) {
    appendLog && appendLog('ERROR', 'Bing 代理异常', err && (err.stack || err.message));
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, message: '服务器错误' }));
  }
}

module.exports = { handleBingDaily };