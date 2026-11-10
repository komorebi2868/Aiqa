'use strict';

/**
 * 文件：tests/ask.e2e.spec.js
 * 被测应用：AI 答疑助手（http://localhost:3000）
 * 覆盖流程：首页提问 → 回答展示 → 历史列表 → 刷新后仍存在（已落盘）
 *
 * 定位策略：全部使用语义化 id（#question / #askBtn / #answer / #history）。
 * 注意页面里没有 #result，回答面板就是 #answer 本身
 * （空状态时带 .empty，渲染回答后移除）。
 *
 * 竞态规避：提交按钮请求中会变「思考中…」并禁用，
 * 因此不按文案定位，而是等它恢复 enabled 再断言。
 */

const { test, expect } = require('@playwright/test');

const QUESTION = '什么是 Spec 驱动开发？';

test.describe('AIQA 端到端：提问 → 回答 → 历史 → 刷新持久化', () => {

  test('完整流程：提交问题 → 看到回答 → 历史出现 → 刷新后仍在', async ({ page }) => {
    // ---------- 1. 打开首页 ----------
    await page.goto('/');

    const input = page.locator('#question');
    const submitBtn = page.locator('#askBtn');
    await expect(input).toBeVisible();
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();

    // ---------- 2. 输入问题并提交 ----------
    await input.fill(QUESTION);
    await submitBtn.click();

    // 等请求结束：按钮从 disabled 恢复为可用
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });

    // ---------- 3. 回答面板出现且文本非空 ----------
    const answerPanel = page.locator('#answer');
    await expect(answerPanel).toBeVisible();
    await expect(answerPanel).not.toHaveClass(/empty/);
    const answerText = (await answerPanel.textContent()) || '';
    expect(answerText.trim().length).toBeGreaterThan(0);

    // 来源说明面板也应显示
    await expect(page.locator('#meta')).toBeVisible();

    // ---------- 4. 历史列表新增该条，且排在最前 ----------
    const historyList = page.locator('#history');
    const firstItem = historyList.locator('li[data-id]').first();
    await expect(firstItem).toContainText(QUESTION);

    const recordId = await firstItem.getAttribute('data-id');
    expect(recordId).toBeTruthy();

    // ---------- 5. 刷新后仍然存在（说明已落盘） ----------
    await page.reload();

    const persistedItem = page
      .locator('#history')
      .locator(`li[data-id="${recordId}"]`);
    await expect(persistedItem).toBeVisible();
    await expect(persistedItem).toContainText(QUESTION);

    // 刷新后仍排在最前
    await expect(page.locator('#history li[data-id]').first())
      .toHaveAttribute('data-id', recordId);
  });

});
