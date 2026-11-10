'use strict';

const qaRecord = require('../record/qaRecord');

/** 从请求中读取并解析 JSON body */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString('utf8');
      if (raw.length > 1024 * 1024) {
        // 限制 1MB，防止异常 body
        req.destroy();
        reject(new Error('请求体过大'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/** 发送 JSON 响应 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body, 'utf8'),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

/** 演示模式：根据 question 生成模拟回答 */
function mockAnswer(question) {
  const q = question.trim();
  const templates = [
    `关于“${q}”，这是一个很好的问题。在演示模式下我暂时无法连接真实大模型，但根据常见知识，它通常涉及相关领域的基础概念与实践方法。建议查阅官方文档或相关教程深入学习。`,
    `你问到了：“${q}”。AIQA 演示回答：目前系统运行在离线演示模式，仅返回基于关键词的模拟回复。接入真实 LLM（如 OpenAI、豆包、通义等）后即可获得更准确的答案。`,
    `问题：${q}\n\n模拟回答：在工程实践中，这类问题通常需要结合上下文具体分析。当前为演示模式，回答仅供参考。`
  ];
  const idx = Math.floor(Math.random() * templates.length);
  return templates[idx];
}

/** 演示模式模拟来源列表 */
const MOCK_SOURCES = [
  { title: 'AIQA 演示知识库', url: 'https://example.com/demo-kb' },
  { title: 'Node.js 官方文档', url: 'https://nodejs.org/docs' }
];

/**
 * 路由入口：根据 method + url 分发到具体接口
 * 返回 true 表示已处理，false 表示交给下一个处理器
 */
async function handle(req, res) {
  const url = req.url || '/';
  const method = (req.method || 'GET').toUpperCase();

  // POST /api/ask
  if (method === 'POST' && url.startsWith('/api/ask')) {
    return handleAsk(req, res);
  }

  // GET /api/history
  if (method === 'GET' && url.startsWith('/api/history')) {
    return handleHistory(req, res);
  }

  return false;
}

async function handleAsk(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return sendJson(res, 400, { ok: false, error: '请求体解析失败' });
  }

  const question = (body && body.question);
  if (typeof question !== 'string' || !question.trim()) {
    return sendJson(res, 400, { ok: false, error: '问题内容不能为空' });
  }

  const answer = mockAnswer(question);
  const sources = MOCK_SOURCES;
  const mode = 'demo';

  const saved = qaRecord.add({ question: question.trim(), answer, sources, mode });

  return sendJson(res, 200, { ok: true, data: saved });
}

function handleHistory(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const limitRaw = url.searchParams.get('limit');
  let limit = 20; // 默认 20
  if (limitRaw !== null) {
    const n = parseInt(limitRaw, 10);
    if (!Number.isNaN(n) && n > 0) limit = n;
  }
  const records = qaRecord.list({ limit });
  return sendJson(res, 200, { ok: true, data: records });
}

module.exports = { handle };
