# CURRENT.md — 当前状态

> 更新时间：2026-10-10

## 已完成（P0）

- [x] 项目骨架：Next.js 16 + React 19 + 手写 CSS + Semi
- [x] 数据模型：`migrations/001_init.sql`（entries / tasks / habits / habit_logs /
      locations / daily_summaries / api_keys / attachments / users）
- [x] 领域逻辑：`src/lib/{entries,tasks,habits,finance,locations,stats,digest,day,dates}.ts`
- [x] 工具层：`src/lib/tools.ts`（26 个工具，网页/REST/MCP 共用）
- [x] MCP 服务端：`/api/mcp`（Streamable HTTP，无状态，API Key 鉴权）
- [x] REST：`/api/v1/tools`、`GET|POST /api/v1/<tool>`
- [x] 登录：OIDC（Authentik）+ 会话 Cookie + 通用 OIDC 支持
- [x] 页面：今日 / 待办 / 打卡 / 财务 / 时间轴 / 统计 / 设置
- [x] API Key 签发与吊销（sha256 落库，明文只返一次）
- [x] Markdown 导出（`daily_digest?format=markdown`）
- [x] 一句话速记分流（`quick_capture`）
- [x] GPX 轨迹导入（含抽稀）
- [x] Docker Compose（life 4225 / life-dev 4226 / life-db）
- [x] NPM 反代：life.hsfp.cn（id 197）、life_dev.hsfp.cn（id 198）
- [x] Authentik 应用：slug `lifelog`
- [x] 开源文档：README / AGENTS / PROJECT / LICENSE

## 进行中

- [ ] 端到端验收（登录 → 记录 → MCP 调用）
- [ ] 提交首个 git commit

## 已知问题 / 待办

见 `TODO.md`。

## 关键信息

- 端口：4225（稳定）/ 4226（测试）；DB 容器 `life-db`（不暴露宿主机）
- 数据卷：`./volumes/db`
- 密钥：`.secrets/life.env`
- NPM proxy host id：197（life）/ 198（life_dev）
- Authentik：Application slug `lifelog`，provider name `LifeLog`
