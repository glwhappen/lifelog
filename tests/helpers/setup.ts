/**
 * vitest 全局前置：必须在任何 src/lib 模块被 import 之前设置环境变量，
 * 因为 src/lib/env.ts 是在模块加载时读一次 process.env。
 */
process.env.SESSION_SECRET ||= 'test-session-secret-please-change-0123456789';
process.env.DEFAULT_TIMEZONE ||= 'Asia/Shanghai';

// 集成测试用测试库；没设就保持原样（集成用例会自动 skip）
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
