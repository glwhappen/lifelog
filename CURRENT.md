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

## 已完成（P0.1 视觉回归 2026-10-10）

- [x] 7 个页面 × 亮/暗 × 桌面/手机 全量截图检查，无 JS 报错
- [x] 空数据状态（首次登录）逐页检查
- [x] 交互状态：速记、勾选待办、习惯打卡、底部「更多」弹层、签发 API Key（含 toast）
- [x] 修掉 10 个问题，其中最严重的是**手机端整页无法滚动**

## 已完成（测试 2026-10-10）

- [x] 177 个自动化用例（97 单元 + 80 集成），`npm test` / `npm run test:db`
- [x] 集成测试覆盖 REST 与 MCP 协议、API Key 鉴权、工具输出字段契约
- [x] CI（GitHub Actions）：类型检查 + 迁移 + 测试 + 构建
- [x] 测试暴露并修复 5 个问题（非法日期、pending 漏未来任务、add_task 文档与行为不一致、
      无时间戳 GPX 抽稀失效、currentUser 无请求上下文抛错）

## 已完成（v0.2.0 产品化审计 2026-10-10）

- [x] 安全：CSRF 中间件、读写分离限流、安全响应头、错误不外泄、robots noindex
- [x] 健壮性：pg 连接池 error 监听（此前数据库重启会静默杀进程）、语句超时、错误边界
- [x] 产品缺口：流水/待办可在页面上编辑与删除、全量 JSON 导出、PWA 可加主屏
- [x] 修 3 个静默 bug：搜索索引失效、四类任务字段名不一致导致截止日/完成时间不显示、
      接口回传内部异常
- [x] 性能：overview 查询并行化
- [x] 测试 203 个（+26）

## 已完成（v0.3.0 速记 AI 化 2026-10-10）

- [x] 网页速记框接模型：理解自然语言、可改/删、一次多动作
- [x] 一键撤销（更新类在执行前快照，能真正回滚）
- [x] 删除需确认；模型不可用自动退回规则分流
- [x] 关思考 + 写完就停：单次成本 5600 → 2700 tokens
- [x] 测试 232 个（+29），模型调用全部 mock

## 已完成（v0.3.1 图标 2026-10-10）

- [x] 全部 emoji 换成 lucide 线性图标（导航/类型/习惯/按钮/标题/空态/错误页）
- [x] 习惯图标改存键名 + 30 个图标的选择器；老 emoji 数据兼容
- [x] 心情 1-5 用线性表情；品牌标记与 favicon 统一
- [x] 修 2 个显示问题：设置页 markdown 星号外露、侧栏 logo 缺样式
- [x] README 截图重拍

## 进行中

- [ ] 语音说一句 → 自动记录（可复用 asr.hsfp.cn）
- [ ] 截图/文件上传 → AI 解析后自动记录

## 已知问题 / 待办

见 `TODO.md`。

## 关键信息

- 端口：4225（稳定）/ 4226（测试）；DB 容器 `life-db`（不暴露宿主机）
- 数据卷：`./volumes/db`
- 密钥：`.secrets/life.env`
- NPM proxy host id：197（life）/ 198（life_dev）
- Authentik：Application slug `lifelog`，provider name `LifeLog`
