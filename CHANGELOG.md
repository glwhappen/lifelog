# CHANGELOG

本项目遵循 [约定式提交](https://www.conventionalcommits.org/)。

## [0.1.0] — 2026-10-10

首个版本：把「个人生活记录」做成一张统一流水表 + 一个 MCP 服务端。

### Added

- **统一流水**：`entries` 表，`kind` 覆盖 done/idea/note/expense/income/mood/energy/
  sleep/weight/water/workout/focus/reading/gratitude/dream/social/weather/location/metric
- **待办与完成**：`tasks` 表（`planned_day` 计划日 + `done_at` 完成时刻）；
  完成时自动镜像一条 `entries(kind='done')`，保证流水完整
- **习惯打卡**：`habits` + `habit_logs`，支持布尔型与计数型，`(habit_id, day)` 唯一保证幂等
- **收支**：分类构成、逐日趋势、月度对比、最大支出
- **位置**：浏览器定位记录；GPX 轨迹导入（按距离/时间抽稀）
- **健康指标**：任意数值型指标 + 每日心情/精力 + 手写总结
- **每日概览** `get_day`：AI 与首页共用的核心聚合
- **工具层** `src/lib/tools.ts`：26 个工具，网页 / REST / MCP 三端共用
- **MCP 服务端** `/api/mcp`（Streamable HTTP，无状态）
- **REST** `/api/v1/tools`、`GET|POST /api/v1/<tool>`，支持 `format=markdown` 导出
- **鉴权**：OIDC 单点登录（不建用户表）+ API Key（sha256 落库、只返一次明文、可吊销、带 scope）
- **一句话速记** `quick_capture`：规则式分流到 支出/收入/待办/灵感/指标/完成/笔记
- **前端**：今日 / 待办 / 打卡 / 财务 / 时间轴 / 统计 / 设置；移动端优先、禁缩放禁下拉、可切暗色
- **导出**：Markdown 摘要（`daily_digest`），可直接喂大模型或存进笔记库
- **部署**：Docker Compose（稳定版 + 测试版 + 独立 Postgres）、健康检查含数据库连通性

### 设计说明

- `entries` 统一流水而非多业务表：为了 AI「一次查询拿到全貌」
- 工具层单一事实源：新增能力只改一处，三端同时生效
- 日期一律按用户时区计算：服务器时区不可信
