/**
 * 文件：tests/ask.integration.test.js
 * 被测对象：src/server.js（http 原生）+ src/routes/ask.js + src/record/qaRecord.js
 * 测试方式：Supertest 直接注入 createServer() 产出的 http.Server 实例
 *          （不占用真实端口、不需要后台进程）
 * 覆盖接口：POST /api/ask、GET /api/history
 */

import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/server.js';
import qaRecord from '../src/record/qaRecord.js';

// qaRecord.js 导出的 STORE_FILE 是 CommonJS 命名属性，
// ESM default import 拿到的是整个 module.exports 对象
const STORE_FILE = qaRecord.STORE_FILE;

describe('AIQA 接口集成测试（Supertest）', () => {
  /** Supertest 代理的 http.Server 实例，所有请求打在同一个 server 上 */
  let api;
  /** 保留 http.Server 引用，afterAll 时显式关闭 */
  let server;

  beforeAll(() => {
    // createServer() 返回 http.Server，supertest 直接接管
    server = createServer();
    api = request(server);
  });

  /** vitest 5.x 禁止 fixture 用位置参数 done，改用 async Promise */
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  /**
   * 每个用例前清空磁盘文件 + 重置模块内 cache，
   * 保证用例之间数据隔离，POST 写入的数据不会泄漏到下一个用例
   *
   * 双重保险：直接 fs.writeFileSync 清空磁盘文件 + qaRecord.resetCache()
   * 因为 qaRecord.writeAll([]) 依赖模块自身能正确解析 STORE_FILE，
   * 但 CommonJS 模块的 cache 与 ESM import 之间可能有隔离。
   */
  beforeEach(() => {
    // 1) 直接操作磁盘文件（最可靠的方式）
    try { fs.writeFileSync(STORE_FILE, '[]', 'utf8'); } catch (_) {}
    // 2) 告诉模块"文件已经变了，别用内存缓存"
    qaRecord.resetCache();
    // 3) 再用模块 API 确认一次
    qaRecord.writeAll([]);
    qaRecord.resetCache();
  });

  // ===============================================================
  // POST /api/ask
  // ===============================================================
  describe('POST /api/ask', () => {

    /**
     * 接口契约：正常提问返回 200
     * 验证目标：status=200，body.ok=true，data 中 id/question/answer/sources/mode/createdAt 完整
     */
    it('正常提问，返回 200 + ok:true + 完整 data 字段', async () => {
      const res = await api
        .post('/api/ask')
        .set('Content-Type', 'application/json')
        .send({ question: '什么是 Spec 驱动开发？' });

      expect(res.status).toBe(200);
      expect(res.body).toBeTypeOf('object');
      expect(res.body.ok).toBe(true);

      const data = res.body.data;
      expect(data).toBeDefined();
      expect(typeof data.id).toBe('string');
      expect(data.id.length).toBeGreaterThan(0);
      expect(data.question).toBe('什么是 Spec 驱动开发？');
      expect(typeof data.answer).toBe('string');
      expect(data.answer.length).toBeGreaterThan(0);   // 回答非空
      expect(Array.isArray(data.sources)).toBe(true);
      expect(data.sources.length).toBeGreaterThan(0);
      expect(data.mode).toBe('demo');
      expect(typeof data.createdAt).toBe('string');
    });

    /**
     * 接口契约：question 为空字符串返回 400
     * 验证目标：status=400，body.ok=false，error 信息精确匹配
     */
    it('question 为空字符串，返回 400 + 错误信息', async () => {
      const res = await api
        .post('/api/ask')
        .set('Content-Type', 'application/json')
        .send({ question: '' });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('问题内容不能为空');
    });

    /**
     * 接口契约：question 为纯空格/制表符/换行，与空字符串同等处理 → 400
     * 代码路径：ask.js 里 question.trim() 后判空
     */
    it('question 为纯空格/制表符/换行，返回 400', async () => {
      const res = await api
        .post('/api/ask')
        .set('Content-Type', 'application/json')
        .send({ question: '   \t\n   ' });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('问题内容不能为空');
    });

    /**
     * 防御性：请求体完全缺 question 字段
     * 代码路径：ask.js 里 typeof question !== 'string' 分支
     */
    it('请求体缺 question 字段（{}），返回 400', async () => {
      const res = await api
        .post('/api/ask')
        .set('Content-Type', 'application/json')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('问题内容不能为空');
    });

    /**
     * 防御性：question 为非字符串（数字/布尔）
     * 代码路径：ask.js 里 typeof question !== 'string' 分支
     */
    it('question 为非字符串（数字），返回 400', async () => {
      const res = await api
        .post('/api/ask')
        .set('Content-Type', 'application/json')
        .send({ question: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    /**
     * 防御性：请求体不是合法 JSON
     * 代码路径：readJsonBody 解析失败 → 400 "请求体解析失败"
     */
    it('请求体非法 JSON，返回 400', async () => {
      const res = await api
        .post('/api/ask')
        .set('Content-Type', 'application/json')
        .send('{not valid json');

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

  });

  // ===============================================================
  // GET /api/history
  // ===============================================================
  describe('GET /api/history', () => {

    /**
     * 接口契约：无参数返回所有记录（默认 limit=20），最新在前
     * 数据准备：手动写入三条不同时间戳的记录
     */
    it('空历史返回空数组', async () => {
      const res = await api.get('/api/history');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(0);
    });

    /**
     * 数据准备：通过 POST /api/ask 写入 3 条，然后 GET 验证排序
     * 这是"接口之间的数据传递"关键验证点
     */
    it('POST 写入 3 条后，GET 按时间倒序返回', async () => {
      const qs = ['问题 A（最早）', '问题 B（中间）', '问题 C（最新）'];
      for (const q of qs) {
        await api.post('/api/ask').send({ question: q });
      }

      const res = await api.get('/api/history');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveLength(3);
      // 最新的"问题 C"应该排在数组第 0 位
      expect(res.body.data[0].question).toBe('问题 C（最新）');
      expect(res.body.data[1].question).toBe('问题 B（中间）');
      expect(res.body.data[2].question).toBe('问题 A（最早）');
    });

    /**
     * 接口契约：limit 参数截断数量，仍然最新在前
     */
    it('?limit=1 仅返回最新 1 条', async () => {
      for (const q of ['Q1', 'Q2', 'Q3']) {
        await api.post('/api/ask').send({ question: q });
      }

      const res = await api.get('/api/history?limit=1');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].question).toBe('Q3');
    });

    it('?limit=2 返回最新 2 条', async () => {
      for (const q of ['Q1', 'Q2', 'Q3']) {
        await api.post('/api/ask').send({ question: q });
      }

      const res = await api.get('/api/history?limit=2');

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].question).toBe('Q3');
      expect(res.body.data[1].question).toBe('Q2');
    });

    /**
     * 防御性：非法 limit（负数、0、非数字）应降级为默认值（无限制）
     */
    it('?limit=-1 或 ?limit=abc 等价于无 limit（返回全部）', async () => {
      await api.post('/api/ask').send({ question: 'X' });
      await api.post('/api/ask').send({ question: 'Y' });

      const a = await api.get('/api/history?limit=-1');
      const b = await api.get('/api/history?limit=abc');

      expect(a.body.data).toHaveLength(2);
      expect(b.body.data).toHaveLength(2);
    });

  });

  // ===============================================================
  // 跨接口联动：POST 写入 → GET 查到 → 数据一致
  // ===============================================================
  describe('接口联动：POST /api/ask 写入 → GET /api/history 查到', () => {

    /**
     * 核心验证：POST 刚写入的那条，GET 立刻能查到，且字段值完全一致
     * 这是最关键的集成点——证明两个接口共享同一份持久化存储
     */
    it('POST 写入的记录，GET 能查到且字段值一致', async () => {
      const postRes = await api
        .post('/api/ask')
        .send({ question: '联动测试问题' });

      expect(postRes.status).toBe(200);
      const written = postRes.body.data;

      const getRes = await api.get('/api/history?limit=1');
      expect(getRes.status).toBe(200);
      expect(getRes.body.data).toHaveLength(1);

      const found = getRes.body.data[0];
      // 关键字段必须和 POST 返回的一致
      expect(found.id).toBe(written.id);
      expect(found.question).toBe(written.question);
      expect(found.answer).toBe(written.answer);
      expect(found.mode).toBe(written.mode);
      expect(found.createdAt).toBe(written.createdAt);
    });

  });

  // ===============================================================
  // 未匹配路由：返回 404 接口不存在
  // ===============================================================
  describe('路由兜底', () => {

    it('GET /api/unknown 返回 404 + ok:false', async () => {
      const res = await api.get('/api/unknown');

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('接口不存在');
    });

  });

});
