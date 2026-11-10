'use strict';

/**
 * 文件：scripts/verify-ui.js
 * 用途：把手动浏览器验证操作固化为可重复执行的 Playwright 脚本
 * 覆盖操作：
 *   1. 打开 http://localhost:3000，打印页面标题并截图
 *   2. 在问题输入框输入「什么是 MCP？」，点击提交，等待回答渲染后截图
 *   3. 收集浏览器控制台 error/warning 与失败网络请求，输出结论
 *
 * 运行：node scripts/verify-ui.js   （需要服务已在 3000 端口运行）
 * 产物：shots/ 目录下三张 PNG 截图
 *
 * 注意：
 *   - 提交按钮请求中会变「思考中…」且禁用，所以按 id 定位并等待恢复 enabled
 *   - 页面无 #result 元素，回答面板即 #answer 本身
 */

const fs = require('fs');
const path = require('path');
// @playwright/test 内置完整 playwright，可直接复用其 chromium
const { chromium } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const QUESTION = '什么是 MCP？';
const SHOTS_DIR = path.join(__dirname, 'shots');

(async () => {
  // 截图目录
  if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

  // 控制台与网络事件收集器（在导航前挂好，避免漏消息）
  const consoleIssues = [];   // error / warning 级控制台消息
  const pageErrors = [];      // 未捕获的页面异常
  const failedRequests = [];  // 非 2xx 的 HTTP 响应

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleIssues.push(`[console.${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(`[pageerror] ${err.message}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      failedRequests.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });

  try {
    // ---------- 步骤 1：打开首页，查看标题并截图 ----------
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const title = await page.title();
    console.log('页面标题:', title);
    await page.screenshot({ path: path.join(SHOTS_DIR, '01-home.png'), fullPage: true });
    console.log('截图已保存: shots/01-home.png');

    // ---------- 步骤 2：输入问题并提交，等待回答后截图 ----------
    const input = page.locator('#question');
    const submitBtn = page.locator('#askBtn');
    await input.fill(QUESTION);
    await submitBtn.click();

    // 等待请求结束信号：按钮从「思考中…/disabled」恢复 enabled
    await submitBtn.waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => !document.querySelector('#askBtn').disabled,
      null,
      { timeout: 10000 }
    );

    // 回答面板（#answer）应已脱离 empty 状态且文本非空
    const answerPanel = page.locator('#answer');
    await answerPanel.waitFor({ state: 'visible' });
    const answerText = (await answerPanel.textContent() || '').trim();
    console.log('回答文本(前100字):', answerText.slice(0, 100));
    if (!answerText) throw new Error('回答文本为空');

    // 历史列表第一条应为刚提交的问题
    const firstHistory = page.locator('#history li[data-id]').first();
    const firstHistoryText = (await firstHistory.textContent() || '').trim();
    console.log('历史第一条:', firstHistoryText);
    if (!firstHistoryText.includes(QUESTION)) {
      throw new Error(`历史第一条不含新问题: ${firstHistoryText}`);
    }

    await page.screenshot({ path: path.join(SHOTS_DIR, '02-after-ask.png'), fullPage: true });
    console.log('截图已保存: shots/02-after-ask.png');

    // ---------- 步骤 3：输出控制台/网络检查结果 ----------
    console.log('\n===== 控制台与网络检查 =====');
    console.log('error/warning 控制台消息:', consoleIssues.length ? '' : '无');
    consoleIssues.forEach((m) => console.log('  ' + m));
    console.log('未捕获页面异常:', pageErrors.length ? '' : '无');
    pageErrors.forEach((m) => console.log('  ' + m));
    console.log('失败网络请求(>=400):', failedRequests.length ? '' : '无');
    failedRequests.forEach((m) => console.log('  ' + m));

    const clean = !consoleIssues.length && !pageErrors.length && !failedRequests.length;
    console.log('\n结论:', clean ? '控制台干净 ✅' : '发现问题，见上方明细 ❌');
    process.exitCode = clean ? 0 : 1;
  } catch (err) {
    // 失败时也留一张现场截图，便于排查
    try {
      await page.screenshot({ path: path.join(SHOTS_DIR, '99-failure.png'), fullPage: true });
      console.log('失败现场截图: shots/99-failure.png');
    } catch (_) { /* ignore */ }
    console.error('脚本执行失败:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
