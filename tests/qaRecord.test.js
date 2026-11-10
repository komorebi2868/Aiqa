/**
 * 被测模块：qaRecord.js
 * 测试范围：问答记录的新增、查询、分页、持久读写
 */
import { describe, it, expect, beforeEach } from 'vitest';
const qa = require('../src/record/qaRecord');

describe('qaRecord 模块单元测试', () => {
  // 每个用例执行前清空数据与缓存，避免用例互相污染
  beforeEach(() => {
    qa.resetCache();
    qa.writeAll([]);
  });

  it('add()新增记录，总记录数+1，字段完整保存', () => {
    const before = qa.readAll().length;
    const rec = qa.add({
      question: '测试问题',
      answer: '测试回答',
      sources: ['demo'],
      mode: 'demo'
    });
    const after = qa.readAll().length;
    expect(after).toBe(before + 1);
    expect(rec.id).toBeDefined();
    expect(rec.createdAt).toBeDefined();
    expect(rec.question).toBe('测试问题');
  });

  it('list()返回记录按【最新创建在前】排序', () => {
    // 先后插入两条记录
    qa.add({ question: '第一条' });
    qa.add({ question: '第二条' });
    const res = qa.list();
    // 第二条后插入，应该排在数组第0位
    expect(res[0].question).toBe('第二条');
    expect(res[1].question).toBe('第一条');
  });

  it('list(limit)传入1，仅返回最新1条记录', () => {
    qa.add({ question: 'A' });
    qa.add({ question: 'B' });
    const res = qa.list({ limit: 1 });
    expect(res.length).toBe(1);
    expect(res[0].question).toBe('B');
  });

  it('writeAll写入的数据，readAll可以完整读取，保证数据持久一致性', () => {
    const testData = [
      { id: 't1', question: 'Q1', answer: 'A1', createdAt: new Date().toISOString() }
    ];
    qa.writeAll(testData);
    qa.resetCache();
    const out = qa.readAll();
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('t1');
  });
});
