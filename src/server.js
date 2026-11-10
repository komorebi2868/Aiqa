'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const askRoute = require('./routes/ask');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/** 静态文件 MIME 表 */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8'
};

function sendJson(res, status, payload) {
  if (res.headersSent) {
    try { res.end(); } catch (_) { /* ignore */ }
    return;
  }
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body, 'utf8'),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

/** 从根路径映射到 public 下的静态文件 */
function serveStatic(req, res) {
  const url = req.url || '/';
  let pathname = url.split('?')[0];
  if (pathname === '/') pathname = '/index.html';

  // 防止目录穿越
  const safeName = path.normalize(pathname).replace(/^([\\/])+/, '');
  const filePath = path.join(PUBLIC_DIR, safeName);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not Found');
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    return serveStatic({ ...req, url: pathname + '/index.html' }, res);
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache'
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

/**
 * 创建 HTTP Server 的工厂函数
 * @param {{port?:number}} [options]
 * @returns {http.Server}
 */
function createServer(options) {
  const server = http.createServer(async (req, res) => {
    try {
      // 1) API 路由
      if ((req.url || '').startsWith('/api/')) {
        const handled = await askRoute.handle(req, res);
        if (handled) return;
        return sendJson(res, 404, { ok: false, error: '接口不存在' });
      }

      // 2) 静态文件
      if (serveStatic(req, res)) return;
    } catch (err) {
      console.error('[server] 未处理异常:', err);
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: '服务器内部错误' });
      } else {
        res.end();
      }
    }
  });
  return server;
}

/** 直接运行时的默认启动 */
function main() {
  const port = parseInt(process.env.PORT, 10) || 3000;
  const server = createServer({ port });
  server.listen(port, () => {
    console.log(`AIQA 演示服务已启动：http://localhost:${port}`);
  });
}

// 当该文件被直接运行时启动服务
if (require.main === module) {
  main();
}

module.exports = { createServer };
