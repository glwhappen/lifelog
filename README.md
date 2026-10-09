# LifeLog · 生活记录

> 一个自托管的个人生活记录平台。待办、完成、灵感、习惯、收支、位置、健康——**一处记录，AI 可读可写**。

LifeLog 不是又一个 todo 应用。它想解决的是：

> 我的生活数据散落在十几个 App 里，AI 看不见它们，所以永远只能给我泛泛的建议。

LifeLog 把所有值得记的东西收进**一张统一流水表**，再用 **MCP** 把它们交给大模型。
于是你问「我最近为什么睡不好」，AI 真的能去看你的睡眠、咖啡因、加班记录和支出，而不是猜。

```
┌─ 人 ─┐                                    ┌─ AI ─┐
│ 网页 │──┐                              ┌──│ Claude │
└──────┘  │    ┌──────────────────────┐  │  └────────┘
          ├───▶│  LifeLog (Next.js)   │◀─┤  ┌─ Cursor ─┐
┌─ 手机 ─┐│    │  ┌────────────────┐  │  ├──│ pi       │
│  语音  │┘    │  │  统一流水表     │  │  │  └──────────┘
└────────┘     │  └────────────────┘  │  │  ┌─ 任意 MCP 客户端 ┐
               └──────────┬───────────┘  └──│ HTTP + API Key    │
                          │                 └───────────────────┘
                    ┌─────┴─────┐
                    │ PostgreSQL│
                    └───────────┘
```

---

## 目录

- [能记什么](#能记什么)
- [AI 怎么用](#ai-怎么用)
- [快速开始](#快速开始)
- [配置](#配置)
- [接入单点登录](#接入单点登录)
- [接入 AI（MCP）](#接入-ai-mcp)
- [REST API](#rest-api)
- [数据模型](#数据模型)
- [开发](#开发)
- [部署](#部署)
- [路线图](#路线图)
- [许可](#许可)

---

## 能记什么

| 模块 | 说明 |
|---|---|
| **待办** | 今日计划、收集箱、截止日、优先级、标签、逾期提醒、顺延 |
| **完成** | 今天做完的事（含没预先计划的临时完成）。和待办是同一份数据的两个视图 |
| **灵感** | 一句话闪念，零摩擦 |
| **笔记 / 总结** | 当天复盘、随想、日记，支持 Markdown |
| **习惯打卡** | 布尔型（早起/运动）与计数型（喝水 8 杯），热力图 + 连续天数 |
| **收支** | 支出/收入、分类、备注；分类构成、逐日趋势、最大支出、月度对比 |
| **位置** | 打开页面即可记录当前位置；支持 GPX 轨迹导入与抽稀；地图回放 |
| **健康指标** | 体重、腰围、睡眠、饮水、心情、精力、专注时长、运动……任意数值型指标 |
| **每日总结** | 心情 1-5、精力 1-5、手写总结（AI 摘要可选） |

**再加一条**：`quick_capture` —— 丢一句话进去，自动分流。
「午饭 35」→ 支出；「跑步 5 公里」→ 运动；「明天要交周报」→ 待办；「想法: …」→ 灵感。

---

## AI 怎么用

这是本项目的核心卖点：**MCP 是一等公民，不是补丁**。

内置 26 个工具，全部同时暴露给网页、REST 和 MCP：

**读**

| 工具 | 用途 |
|---|---|
| `get_day` | 某一天的全貌（待办/完成/流水/打卡/收支/位置/总结）——回答「我今天怎么样」 |
| `query_entries` | 按类型/时间/关键词/标签检索流水 |
| `list_tasks` | 待办查询（未完成/今天/逾期/已完成/全部） |
| `finance_summary` | 收支汇总与分类构成 |
| `habit_stats` | 习惯完成率、连续天数、逐日明细 |
| `stats_overview` | 区间综合统计（写周报/月报用它） |
| `daily_digest` | 导出紧凑 Markdown——**直接把「我这一周」喂给模型** |
| `list_locations` | 位置轨迹 + 总里程 |
| `search_all` | 全库关键词搜索 |
| `list_habits` / `who_am_i` | 习惯清单 / 身份与连续记录天数 |

**写**

| 工具 | 用途 |
|---|---|
| `add_task` / `complete_task` / `update_task` / `postpone_task` / `delete_task` | 待办全生命周期 |
| `add_idea` / `add_note` | 灵感、笔记、总结 |
| `log_expense` / `log_income` | 收支 |
| `check_habit` / `uncheck_habit` / `add_habit` / `delete_habit` | 习惯打卡与管理 |
| `log_metric` | 体重/睡眠/饮水/心情/专注…… |
| `log_location` | 位置（可自动逆地理编码） |
| `save_summary` | 当天总结 + 心情/精力 |
| `update_entry` / `delete_entry` | 改删流水 |
| `quick_capture` | 一句话智能分流 |

典型对话：

> **你**：把我今天做完的事整理成周报，顺便说说我这周花钱有没有异常。
>
> **AI**：*(调用 `stats_overview` + `finance_summary` + `daily_digest`)* …

> **你**：昨天下午我应该是在外面，帮我记一下。
>
> **AI**：*(调用 `list_locations` 确认轨迹，再 `log_location` 补记)* …

---

## 快速开始

```bash
git clone https://github.com/<you>/lifelog.git
cd lifelog

# 1) 配置环境变量
cp .env.example .env
```

最省事的本地试跑（不需要 SSO）：

```bash
# .env
echo "ALLOW_ANON=1" >> .env
echo "DATABASE_URL=postgres://lifelog:lifelog@localhost:5432/lifelog" >> .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env

# 2) 起数据库
docker run -d --name lifelog-db -p 5432:5432 \
  -e POSTGRES_DB=lifelog -e POSTGRES_USER=lifelog -e POSTGRES_PASSWORD=lifelog \
  postgres:17-alpine

# 3) 装依赖 → 迁移 → 起开发服务器
npm install
npm run migrate
npm run dev      # http://localhost:4226
```

或者直接走 Docker Compose（含数据库，生产同款）：

```bash
mkdir -p .secrets
cat > .secrets/life.env <<'EOF'
DATABASE_URL=postgres://lifelog:change-me@life-db:5432/lifelog
SESSION_SECRET=换成 32 位以上随机串
ALLOW_ANON=1
EOF
echo "POSTGRES_PASSWORD=change-me" > .env
docker compose build
docker compose up -d          # 4225 稳定版 / 4226 测试版
```

打开 <http://127.0.0.1:4225/api/health> 应返回 `{"ok":true,"db":"up"}`。

---

## 配置

全部通过环境变量，见 [`.env.example`](./.env.example)。

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL 连接串 |
| `SESSION_SECRET` | ✅ | 会话签名密钥（32 位以上随机串） |
| `OIDC_ISSUER` | 生产必填 | IdP 的 issuer，如 `https://auth.example.com/application/o/lifelog/` |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | 生产必填 | OAuth2 客户端凭据 |
| `OIDC_SCOPE` | | 默认 `openid profile email` |
| `ALLOW_ANON` | | `1` = 无人登录时使用匿名单机账号（**仅本地调试**） |
| `DEFAULT_TIMEZONE` | | 默认 `Asia/Shanghai`；用户可在设置页单独改 |
| `GEOCODE_URL` | | 逆地理编码模板，如 `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={lat}&lon={lng}`（留空则只存坐标） |
| `DEEPSEEK_API_KEY` 等 | | 可选，供后续「截图/语音自动解析」使用 |

---

## 接入单点登录

LifeLog 是纯 OIDC 客户端，**不建用户表、不存密码**。任何标准 IdP 都行。

### Authentik

1. 管理后台 → **Applications → Create with Provider**，类型选 **OAuth2/OpenID Connect**。
2. Redirect URI 填两个（稳定版 + 测试版）：
   - `https://life.example.com/auth/callback`
   - `https://life_dev.example.com/auth/callback`
3. Scope 选 `openid`、`profile`、`email`。
4. 复制 Client ID / Secret 填进环境变量，`OIDC_ISSUER` 填
   `https://auth.example.com/application/o/<应用slug>/`。

> ⚠️ 用 Authentik 的 REST API 或 ORM 建 Provider 时，`grant_types` 默认是**空数组**，
> 不显式设成 `["authorization_code","refresh_token"]` 就会在授权阶段报
> `invalid_request / The request is otherwise malformed`。面板建则没这个问题。

### Keycloak / Auth0 / 其它

只要能提供 `.well-known/openid-configuration` 就能用，
回调地址固定为 `https://<你的域名>/auth/callback`。

---

## 接入 AI（MCP）

LifeLog 内置 **Streamable HTTP MCP 服务端**，地址固定为：

```
https://<你的域名>/api/mcp
```

鉴权用 API Key（在网页 **设置 → API Key** 里签发，明文只显示一次，库里只存 sha256）。

### Claude Desktop / Cursor / 其它支持 HTTP MCP 的客户端

```json
{
  "mcpServers": {
    "lifelog": {
      "type": "http",
      "url": "https://life.example.com/api/mcp",
      "headers": { "Authorization": "Bearer ll-你的密钥" }
    }
  }
}
```

### 命令行验证

```bash
curl -s https://life.example.com/api/mcp \
  -H "Authorization: Bearer ll-你的密钥" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### 权限

签发 Key 时可选 `read` / `write`：

- 只读 Key 适合「让 AI 帮我分析」，写不进去；
- 读写 Key 适合「让 AI 帮我记录」。
- 每个 Key 都独立可吊销，`last_used_at` 可追溯。

> 想要 stdio 形态？用 [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) 之类的桥接即可，
> 服务端不需要为此改写。

---

## REST API

MCP 之外，同一套能力也提供普通 REST（网页前端就是用它）：

```bash
# 列出全部能力
curl https://life.example.com/api/v1/tools -H "Authorization: Bearer ll-xxx"

# 读：GET + 查询参数
curl "https://life.example.com/api/v1/get_day?date=2026-10-10" -H "Authorization: Bearer ll-xxx"

# 写：POST + JSON
curl -X POST https://life.example.com/api/v1/log_expense \
  -H "Authorization: Bearer ll-xxx" -H "Content-Type: application/json" \
  -d '{"amount": 35, "category": "餐饮", "note": "午饭"}'

# 导出 Markdown（直接喂模型 / 存笔记库）
curl "https://life.example.com/api/v1/daily_digest?days=7&format=markdown" -H "Authorization: Bearer ll-xxx"
```

工具名与 MCP 完全一致——**一处定义，三处可用**（见 `src/lib/tools.ts`）。

---

## 数据模型

设计上只有两个概念：

### 1. 统一流水 `entries`

所有能被记录的东西都往这里落一行。**这样 AI 一次查询就能拿到「我今天的一切」**，不用跨十几张表拼。

```
entries(user_id, kind, day, happened_at, title, content,
        amount, currency, category, tags[], source, meta jsonb, task_id)
```

`kind` 取值：`done idea note expense income mood energy sleep weight water workout
focus reading gratitude dream social weather location metric`

### 2. 专用投影表

需要状态机、唯一约束或复杂查询的才单独建表：

| 表 | 为什么需要独立 |
|---|---|
| `tasks` | 有状态机（pending/done/cancelled）+ 计划日/截止日/优先级/子任务 |
| `habits` + `habit_logs` | `(habit_id, day)` 唯一约束保证打卡幂等；计数型要累加 |
| `locations` | 数据量最大（轨迹点），需要地理索引与独立抽稀策略 |
| `daily_summaries` | `(user_id, day)` 唯一，承载心情/精力/总结 |
| `api_keys` | 只存 sha256，独立吊销 |
| `attachments` | 截图/录音（供后续 AI 解析），bytea |

**所有表都带 `user_id`**：单机自用是一个人，多用户/开源场景天然可扩展。

数据库变更一律新增 `migrations/NNN_*.sql`，只加不改。

---

## 开发

```bash
npm run dev          # :4226
npm run typecheck    # tsc --noEmit
npm run build        # next build
npm run migrate      # 执行 migrations/*.sql
```

```
src/
  app/               页面 + API 路由
    api/mcp/         MCP 服务端（Streamable HTTP）
    api/v1/[...path] REST（与 MCP 共用工具定义）
    api/keys/        API Key 签发/吊销
    auth/            OIDC 登录回调
  lib/
    tools.ts         ★ 工具层：REST 与 MCP 的唯一事实源
    entries.ts       统一流水
    tasks.ts         待办/完成
    habits.ts        习惯
    finance.ts       收支统计
    locations.ts     位置 + GPX 解析
    stats.ts         综合统计
    digest.ts        Markdown 导出
    dates.ts         时区安全的日期处理
    db.ts / auth.ts / apikey.ts
migrations/          数据库结构（只加不改）
docker/entrypoint.sh 容器入口（先迁移再启动）
```

### 两条铁律

1. **加能力只改 `src/lib/tools.ts`** —— 加一个工具，网页、REST、MCP 同时获得，不要在别处复制业务逻辑。
2. **所有日期计算走 `dates.ts`** —— 服务器可能是 UTC，`new Date().toISOString().slice(0,10)` 会算错「今天」。

---

## 部署

```bash
docker compose build && docker compose up -d
```

- `life`（稳定版）→ `172.17.0.1:4225`，负责执行迁移；
- `life-dev`（测试版）→ `172.17.0.1:4226`，`RUN_MIGRATIONS=0`，**先在这里验收再上稳定版**；
- `life-db` → PostgreSQL 17，数据在 `./volumes/db`，**不暴露到宿主机**。

反向代理（nginx / NPM / Caddy）指向即可。用 NPM 时给代理主机开 `http2_support`，
否则同一张通配证书下的多站点会出现 `421 Misdirected Request`。

容器健康检查已内置：`GET /api/health` 会真的查一次数据库，
避免「进程活着但库连不上」被当成健康。

升级：

```bash
git pull && docker compose build && docker compose up -d life-dev   # 先在 dev 看
docker compose up -d life                                          # 没问题再切稳定版
```

回滚：把镜像 tag 切回上一个即可，数据库因为「只加不改」不会因此损坏。

---

## 路线图

- [x] 统一流水 + 待办/完成 + 灵感/笔记 + 习惯 + 收支 + 位置 + 健康指标
- [x] 每日总结、心情/精力
- [x] MCP 服务端 + REST + API Key + Markdown 导出
- [ ] AI 对话：语音说一句 → 自动记录
- [ ] 截图 / 文件上传 → AI 识别后自动记录（如账单截图→支出）
- [ ] 轨迹地图回放（GPX 已支持导入）
- [ ] 每日/每周提醒推送（Webhook）
- [ ] 语义检索（embedding）
- [ ] 移动端 PWA 离线缓存

---

## 许可

MIT
