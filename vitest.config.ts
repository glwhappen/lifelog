import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/helpers/setup.ts'],
    // 集成测试要连真库，串行跑避免互相干扰；单元测试很快，串行也无感
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
