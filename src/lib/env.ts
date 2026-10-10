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
  /** 速记框的 AI 解析开关（默认：有 key 就开） */
  aiCaptureEnabled: process.env.AI_CAPTURE_ENABLED ? process.env.AI_CAPTURE_ENABLED === '1' : true,
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 45_000),
  /** 速记框每分钟最多几次 AI 解析（每次都要花钱，必须限） */
  aiRatePerMin: Number(process.env.AI_RATE_PER_MIN || 20),
  /** 单用户每日 AI 调用上限（防误用烧钱） */
  aiDailyLimit: Number(process.env.AI_DAILY_LIMIT || 300),
};

export const API_KEY_PREFIX = 'll-';
export const ANON_SUB = 'anonymous';
