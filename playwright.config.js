'use strict';

/**
 * Playwright 配置
 * - 测试目录 tests/，只匹配 *.e2e.spec.js，避免误扫 vitest 的 *.test.js
 * - webServer：自动启停 node src/server.js，本地与 CI 都无需手动开服务
 * - baseURL：page.goto('/') 指向本地 3000
 */
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.spec.js',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: false,   // 串行，避免多 worker 并发写 qa-records.json
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node src/server.js',
    url: 'http://localhost:3000',
    reuseExistingServer: true,   // 已有服务直接复用，避免端口冲突
    timeout: 15 * 1000,
  },
});
