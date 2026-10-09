# PROJECT.md — LifeLog

## 项目概述

自托管个人生活记录平台。把「一个人每天产生的、值得留下的信息」收进一张统一流水表，
再通过 MCP 交给大模型读写，让 AI 真正能基于个人数据给出建议。

- 线上：**life.hsfp.cn**（测试 life_dev.hsfp.cn）
- 代码：`/data/web-code-workspaces/life`（`/root/web-code-workspaces/life` 为软链）
- 负责人：郭力玮
- 状态：P0 已上线（见 `CURRENT.md`）

## 为什么做

现有困境：
1. 生活数据散落在待办 App、记账 App、备忘录、健康 App 里，AI 一个都看不见；
2. 已有 `todo.hsfp.cn`（Vikunja）与 `salary.hsfp.cn`（记账）各自为政，数据不互通；
3. 想「长期了解自己」需要一个能沉淀、能被 AI 读、又能一句话快速录入的地方。

设计取舍：
- **统一流水 + 投影表**，而不是十几个独立的业务表 —— 为了让 AI「一次查询拿到全貌」；
- **MCP 一等公民**，而不是先做 Web 再补 API —— AI 可用性和人可用性同等重要；
- **工具层单一事实源**（`src/lib/tools.ts`）—— 一处定义，网页/REST/MCP 三端可用；
- **独立 Postgres 容器**，不寄生在共享 Supabase 上 —— 开源时零依赖、可整包带走。

## 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | Next.js 16 + React 19 | 与 hsfp.cn 其他自建站一致 |
| UI | 手写 CSS + Semi Design | 移动端原生感（禁缩放/禁下拉）需要精细控制布局 |
| 后端 | Next.js Route Handlers | 无需独立后端服务 |
| 数据库 | PostgreSQL 17（独立容器） | 开源零依赖；`public` schema |
| 认证 | OIDC（Authentik） | 不建用户表、不存密码 |
| AI 接入 | MCP（Streamable HTTP）+ REST + API Key | 大模型生态主流形态 |
| 部署 | Docker Compose + Nginx Proxy Manager | 与现有基建一致 |

## 关键决策

| 决策 | 依据 | 日期 |
|---|---|---|
| `entries` 统一流水 + `tasks`/`habits` 投影表 | AI 需要「一次查询拿到全貌」，跨表拼接是反模式 | 2026-10-10 |
| 待办与完成共用 `tasks` 表（`planned_day` + `done_at`） | 「今日待办」与「今日完成」是同一份数据的两个视图 | 2026-10-10 |
| 完成任务时镜像写 `entries(kind='done')` | 保证流水完整，AI 看一天不会漏 | 2026-10-10 |
| 独立 Postgres 容器（不用共享 Supabase） | 用户要求；开源可整包带走 | 2026-10-10 |
| API Key 而非 OAuth 做 MCP 鉴权 | MCP 客户端配置简单，个人场景够用 | 2026-10-10 |
| 低层 MCP `Server` + JSON Schema（不引 zod） | 避免与 SDK 的 zod 版本冲突 | 2026-10-10 |
| 网页会话视为全权限，Key 按 scope 收窄 | 网页是本人操作；Key 可能给第三方模型 | 2026-10-10 |
| 首个登录用户自动成为管理员 | 开源自托管场景最省事 | 2026-10-10 |

## 目录结构

```
migrations/          数据库结构（只加不改）
scripts/migrate.mjs  迁移执行器
docker/entrypoint.sh 容器入口（先迁移再启动）
src/app/             页面 + API 路由
src/lib/tools.ts     ★ 工具层（网页/REST/MCP 共用）
src/lib/*.ts         领域逻辑（entries/tasks/habits/finance/locations/stats/digest）
```

## 关联笔记

- `[[提示词]]` — 开发规范（技术栈/部署/文件约定）
- `[[我的服务]]` — hsfp.cn 域名占用
- `[[Authentik接入指南]]` — OIDC 接入步骤与坑
- `[[nginx-proxy-manager使用手册]]` — 反代与 http2_support 坑
- `[[本机Docker容器与端口清单]]` — 端口选型
- `[[体检记录-郭力玮]]` — 健康指标模块的需求来源
