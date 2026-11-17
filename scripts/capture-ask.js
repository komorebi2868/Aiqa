'use strict';

/**
 * CI 专用：对正在运行的容器（http://localhost:3000）完成一次提问并截图。
 * 由 .github/workflows/ci.yml 的 docker job 调用，产物上传为 Actions artifact。
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

(async () => {
  const outDir = path.join(__dirname, '..', 'artifacts');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto('http://localhost:3000/');
  await page.fill('#question', '容器内提问成功了吗？');
  await page.click('#askBtn');

  // 提交按钮在请求期间为 disabled，恢复可用即表示请求结束
  await page.waitForFunction(() => {
    const btn = document.querySelector('#askBtn');
    return btn && !btn.disabled;
  });
  await page.waitForSelector('#answer:not(.empty)');

  const file = path.join(outDir, 'ask-success.png');
  await page.screenshot({ path: file, fullPage: true });
  await browser.close();

  console.log('截图已保存：' + file);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
