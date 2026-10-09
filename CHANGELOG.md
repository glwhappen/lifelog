# CHANGELOG

本项目遵循 [约定式提交](https://www.conventionalcommits.org/)。

## [0.2.0] — 2026-10-10

一轮「当作要交付的产品」来做的审计：安全性、健壮性、产品缺口、可测性各过一遍。

### Added

- **流水的编辑与删除**（今日 / 时间轴）：以前打错一个字只能去调 API 或让 AI 改，
  这是最影响手感的缺口。现在每行有编辑入口，按类型显示对应字段（金额/分类、数值/单位…）。
- **待办编辑**：标题、备注、优先级、计划日、截止日、标签都能改，删除前有确认。
- **全量数据导出** `GET /api/export`：JSON、表结构原样、不含密钥。自托管产品的底线是
  数据必须能整包带走。设置页有两个按钮（全部 / 近一年）。
- **PWA**：manifest + 192/512/maskable 图标 + apple-touch-icon，手机可「添加到主屏幕」
  后全屏打开，配合已有的禁缩放/禁下拉，手感接近原生。
- **错误边界**：`error.tsx` / `global-error.tsx` / `not-found.tsx`，
  单个页面渲染失败不再整站白屏。
- **CSRF 防护**：`src/middleware.ts` 对带 Cookie 的写请求校验 `Origin`。
- **限流**：读写分开计数（默认 600 / 120 每分钟），防止跑飞的 AI 循环灌爆数据库。
- **安全响应头**：`frame-ancestors 'none'`、`X-Frame-Options: DENY`、`Permissions-Policy`、
  `robots: noindex`。
- 测试新增 26 个用例（1 个导出的集成用例组 + 限流/中间件单元测试），共 **203** 个。

### Fixed

- **空闲数据库连接出错会让进程直接挂掉**：pg 的 `Pool` 只监听了查询错误，没监听
  `pool.on('error')`。数据库重启 / 网络闪断时，未处理的 `'error'` 事件会静默杀掉 Node 进程。
  同时补上 `statement_timeout`、连接超时与 `application_name`。
- **搜索索引从来没用上**：001 建的 GIN 索引表达式是 `title || content`，
  而查询用的是 `title || content || category`，差一个字段 → 索引失效，`q` 搜索全表扫描。
  表达式已抽成 `SEARCH_EXPR` 常量，并加迁移 002 重建索引。
- **四类任务的字段名各不相同**：`pending` 用 `due`、`done` 用 `at`、`overdue` 用 `planned_day`、
  `inbox` 什么都没有。后果是今日页的「截止日」和「完成时间」因为字段对不上，
  **一直静默不显示**。现在统一成同一个 `taskBrief` 形状，并加了契约测试。
- **接口错误直接回传内部异常信息**：改为只回可读提示，细节进服务端日志。
- 空目录 `src/app/api/upload` 清理（附件表保留，等做截图解析时再实现）。

### Changed

- `overview()` 的 6 个独立查询改为并行（原来是一条条 `await`，白白串行等好几趟）。
- 设置页导出区拆成「摘要 Markdown」与「原始数据 JSON」两组，说明更清楚。

## [0.1.2] — 2026-10-10

补上自动化测试（此前只有 typecheck + build），并修掉测试暴露出来的 3 个问题。

### Added

- **测试体系**：177 个用例（97 单元 + 80 集成），零额外运行时依赖（vitest）
  - `tests/unit/`：时区日期运算与口语日期解析、区间解析、GPX 解析与轨迹抽稀、
    速记分流规则、类型元数据
  - `tests/integration/`：真 Postgres 上的待办/习惯生命周期、`get_day` 聚合、
    财务与统计、Markdown 导出、REST 与 MCP 协议、API Key 鉴权
- `npm test`（单元，不需要数据库）/ `npm run test:db`（自动起临时 Postgres，用完销毁）
- `.github/workflows/test.yml`：类型检查 + 迁移 + 测试 + 构建
- 工具输出的**契约断言**：`get_day` 顶层字段、`habit_stats` 的 `habit` 对象、
  `daily_digest` 的 Markdown 段落都被钉住，防止跨层字段名悄悄漂移

### Fixed

- **`parseLooseDay` 不校验日期有效性**：`2026-13-45` 这种"格式对但日期非法"的串会被
  原样返回（最终写进数据库）。现在会验一次 `Date` 有效性，非法则返回 null。
- **`list_tasks` 的 `pending` 漏掉计划在未来的任务**：任务若计划在明天，在
  今天/未完成/逾期/已完成 四个标签下都看不到，只有「全部」里能找到。
  现在 `pending` = 所有未完成（含未来）。
- **`add_task` 文档与行为不一致**：描述说"不传 planned_day 会进收集箱"，
  代码却默认今天。现在语义明确为「给日期→那天 / 不给→今天 / 显式 null→收集箱」，
  JSON Schema 允许 `null`。
- **轨迹抽稀对无时间戳的 GPX 失效**：原先 `dt` 缺省为 `Infinity` 使条件恒真，
  纯轨迹文件会被原样全量导入。现在缺时间戳时只按距离抽稀。
- **`currentUser()` 在无请求上下文时抛错**：改为把「取不到 cookie」当作未登录，
  纯 API Key 调用方不会因为不在 Next 请求里而 500。

### Changed

- 抽稀逻辑独立成纯函数 `decimateTrack()`，速记判定独立成 `classifyCapture()`，
  两者都可单测。
- 12 个工具的 `description` 补充了入参与使用场景 —— 描述是模型选工具的唯一依据，
  `log_expense` / `log_income` 原先是 5 个字的「记录支出。」。

### Docs

- README 新增「测试」章节（怎么跑、两层各测什么）
- AGENTS.md 补充：改完必跑 `typecheck + test + build`；新增工具必须同步更新契约断言

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
