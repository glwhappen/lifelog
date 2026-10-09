# CHANGELOG

本项目遵循 [约定式提交](https://www.conventionalcommits.org/)。

## [0.1.1] — 2026-10-10

一轮完整的视觉回归（桌面/手机 × 亮色/暗色 × 7 个页面 + 空态 + 交互态）后修的 bug。

### Fixed

- **手机端整页无法滚动**：列方向 flex 子项 `.app-col` 默认 `min-height: auto`，
  拒绝收缩导致 `.main` 被撑成内容高度，而 body 是 `overflow: hidden` ——
  手机上只能看到每个页面的顶部。补 `min-height: 0` 修复。
- **逾期任务显示「原计划」却没有日期**：工具层输出字段是 `planned`，
  页面读的是 `planned_day`，统一成 `planned_day`。
- **「今日收支」明细时间显示 `Invalid Date`**：`get_day` 的 finance items
  映射时丢了 `happened_at`。
- **财务页「净额」击穿卡片**：`.stat` 缺 `min-width: 0`，长数字撑破网格；
  同时新增 `moneyShort()`（≥1 万显示为「¥1.66万」，完整值放 `title`）。
- **暗色主题下输入框占位符几乎不可见**：补 `::placeholder` 颜色并重置
  Firefox 的默认 `opacity`；同时给 body 加 `color-scheme`，
  让日期选择器/滚动条等原生控件跟随主题。
- **空数据时统计/财务的柱状图显示成一条虚线**（`min-height: 2px`），
  看起来像坏掉；改为无数据时不渲染图表并给出提示。
- **「今天总结」的心情/精力挤在同一行**，标签错位；拆成两行各自带标签。
- 时间轴里数值型条目重复显示名称与单位（正文一处、右侧一处）。
- 暗色主题的次要文字（`--fg-faint`）对比度偏低，`#6f7885` → `#8b93a1`。

### Changed

- 流水类型的图标与中文名原先散落在 3 处（今日页、统计页、Markdown 导出），
  合并到 `src/lib/kinds.ts` 作为单一事实源。
- 时间轴的类型标签由「英文 kind 名」改为「图标 + 中文名」；
  无标题无正文的条目不再显示「（无内容）」，改由类型标签承载信息。
- 打卡热力图改为**按周对齐**（每列 7 天，GitHub 风格），可以看出星期规律与断点。

### Docs

- 新增 `kinds.ts`、`moneyShort()`、`hhmm(iso, tz)` 的注释说明，
  并在 AGENTS.md 记录「日期一律走 dates.ts、时间一律传用户时区」。

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
