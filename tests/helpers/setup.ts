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

// AI 相关的默认值：让 aiEnabled() 为真，但 base 指向一个不可能连通的地址，
// 真正要发请求的用例会 mock 掉 fetch —— 测试永远不会真的花钱调模型。
process.env.DEEPSEEK_API_KEY ||= 'test-key';
process.env.DEEPSEEK_BASE_URL ||= 'https://ai.invalid/v1';
process.env.DEEPSEEK_MODEL ||= 'test-model';
