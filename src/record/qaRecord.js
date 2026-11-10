'use strict';

const fs = require('fs');
const path = require('path');

/** 存储文件路径：项目根目录/data/qa-records.json */
const STORE_FILE = path.join(__dirname, '..', '..', 'data', 'qa-records.json');

// 说明：这里不使用模块级内存缓存。
// 测试文件（ESM）与 server（CJS）会各自持有一份模块实例，
// 缓存无法跨实例同步，会导致"清空磁盘后仍读到旧数据"。
// 本项目并发极低，每次直接读盘即可。

/** 确保存储目录和文件存在 */
function ensureStore() {
  const dir = path.dirname(STORE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, '[]', 'utf8');
  }
}

/** 从磁盘读取全部记录 */
function readAll() {
  ensureStore();
  let raw = '[]';
  try {
    raw = fs.readFileSync(STORE_FILE, 'utf8');
  } catch (_) {
    raw = '[]';
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) parsed = [];
  } catch (_) {
    parsed = [];
  }
  return parsed;
}

/** 将全部记录写回磁盘 */
function writeAll(records) {
  const data = Array.isArray(records) ? records.slice() : [];
  ensureStore();
  const tmp = STORE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, STORE_FILE);
}

/** 生成简单唯一 id */
function genId() {
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 8)
  );
}

/**
 * 新增一条问答记录
 * @param {object} record - 包含 question / answer / sources / mode 等字段
 * @returns {object} 新记录（带 id、createdAt）
 */
function add(record) {
  const list = readAll();
  const now = new Date().toISOString();
  const item = {
    id: genId(),
    question: (record && record.question) || '',
    answer: (record && record.answer) || '',
    sources: Array.isArray(record && record.sources) ? record.sources : [],
    mode: (record && record.mode) || 'demo',
    createdAt: now
  };
  list.push(item);
  writeAll(list);
  return item;
}

/**
 * 返回记录列表，最新在前
 * @param {{limit?:number}} [opts]
 * @returns {Array}
 */
function list(opts) {
  const all = readAll();
  // 先按时间正序：旧记录在前，新记录在后
  const sorted = all.slice().sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return ta - tb;
  });
  // 反转数组，实现最新记录排在最前面（实验故意改坏就注释这一行）
  sorted.reverse();

  let limit = opts && opts.limit;
  if (typeof limit !== 'number' || Number.isNaN(limit) || limit < 1) {
    limit = sorted.length;
  }
  return sorted.slice(0, limit);
}

/** 兼容占位：内存缓存已移除（readAll 每次直接读盘），保留供测试调用 */
function resetCache() { /* no-op */ }

module.exports = {
  add,
  list,
  readAll,
  writeAll,
  resetCache,
  STORE_FILE
};
