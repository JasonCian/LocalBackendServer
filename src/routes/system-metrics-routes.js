/**
 * 系统监控路由
 * 提供 JSON 快照与 SSE 流
 */

function checkToken(req, expected) {
  if (!expected) return true;
  const header = req.headers['x-metrics-token'] || req.headers['x-token'] || '';
  return String(header) === String(expected);
}

async function handleSystemMetrics(req, res, requestPath, service, logger, mount = '/metrics', token = '') {
  if (!service) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, message: '系统监控服务未启用' }));
    return;
  }

  if (!checkToken(req, token)) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, message: '未授权' }));
    return;
  }

  // GET /metrics
  if (req.method === 'GET' && (requestPath === mount || requestPath === `${mount}/`)) {
    try {
      const snapshot = await service.getSnapshot();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ success: true, data: snapshot }));
    } catch (err) {
      if (logger) logger('ERROR', '获取系统监控快照失败', err && err.message);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: '内部错误' }));
    }
    return;
  }

  // GET /metrics/stream
  if (req.method === 'GET' && requestPath === `${mount}/stream`) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive'
    });

    let closed = false;
    const heartbeat = setInterval(() => {
      if (!closed) res.write(': ping\n\n');
    }, 15000);

    const unsubscribe = service.subscribe((snapshot) => {
      if (closed) return;
      res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    });

    req.on('close', () => {
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ success: false, message: '未匹配的系统监控路由' }));
}

module.exports = {
  handleSystemMetrics
};
