import { defineConfig } from 'vitest/config';

/**
 * Vitest 配置
 * 只收集 tests/ 下的 *.test.js；
 * 排除 Playwright 的 *.e2e.spec.js（两者 API 不兼容，混跑会报错）。
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    exclude: ['**/node_modules/**', 'tests/**/*.e2e.spec.js'],
  },
});
