/** 环境变量集中读取。密钥只走 env / .secrets，不进代码、不进 git。 */
export const env = {
  databaseUrl: process.env.DATABASE_URL || '',
  oidcIssuer: process.env.OIDC_ISSUER || '',
  oidcClientId: process.env.OIDC_CLIENT_ID || '',
  oidcClientSecret: process.env.OIDC_CLIENT_SECRET || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Asia/Shanghai',
  /** 未配置 OIDC 时允许匿名单机模式（仅本地开发；生产会强制走 SSO） */
  allowAnon: process.env.ALLOW_ANON === '1',
  /** 首个登录的用户是否自动成为管理员（用于习惯/分类等全局配置的维护） */
  firstUserIsAdmin: process.env.FIRST_USER_IS_ADMIN !== '0',
  deepseekKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekBase: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  /** 单用户每日 AI 调用上限（防止误用烧钱） */
  aiDailyLimit: Number(process.env.AI_DAILY_LIMIT || 100),
};

export const API_KEY_PREFIX = 'll-';
export const ANON_SUB = 'anonymous';
