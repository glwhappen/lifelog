-- LifeLog 初始化（独立 Postgres，public schema）
-- 设计原则：
--   1. entries 是「统一流水」——所有能被记录的东西都往这里落一行，AI 一次查询即可拿到全貌。
--   2. tasks / habits 等是「专用投影表」——需要状态机、唯一约束、复杂查询的才单独建表。
--   3. 一切带 user_id：单机自用是一个人，多用户/开源场景天然可扩展。
--   4. 只加不改：后续 schema 变更一律新增 migrations/NNN_*.sql。

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- 用户
create table if not exists users (
  sub           text primary key,              -- OIDC sub（Authentik 用户 pk）
  username      text not null default 'user',
  name          text,
  email         text,
  avatar_url    text,
  timezone      text not null default 'Asia/Shanghai',
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- 统一流水
-- kind 取值（约定，不设 enum 以便扩展）：
--   done        完成的一件事（含由 tasks 完成时自动镜像过来的）
--   idea        灵感 / 闪念
--   note        笔记、总结、随笔（支持 markdown）
--   expense     支出        income  收入
--   mood        心情        sleep   睡眠    weight 体重 / 腰围
--   water       饮水        workout 运动    focus  专注
--   reading     阅读/观影   gratitude 感恩/三件好事   dream 梦境
--   social      社交        weather 天气  location 位置  metric 其他数值
create table if not exists entries (
  id          bigserial primary key,
  user_id     text not null references users(sub) on delete cascade,
  kind        text not null,
  day         date not null,                       -- 归属日（按用户时区算好的本地日期）
  happened_at timestamptz not null default now(),  -- 精确发生时刻
  title       text,
  content     text,
  amount      numeric(14,2),                       -- 收支金额；也可作数值型 metric 的值
  currency    text not null default 'CNY',
  category    text,                                -- 分类：餐饮/交通/工资…（也可作 metric 的单位维度）
  tags        text[] not null default '{}',
  source      text not null default 'web',         -- web | mcp | import | auto
  meta        jsonb not null default '{}'::jsonb,  -- 类型专属字段（lat/lng、运动时长、睡眠质量…）
  task_id     bigint,                              -- 由任务完成镜像而来时指向 tasks.id
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists entries_user_day_idx   on entries (user_id, day desc) where deleted_at is null;
create index if not exists entries_user_kind_idx  on entries (user_id, kind, day desc) where deleted_at is null;
create index if not exists entries_tags_idx       on entries using gin (tags);
create index if not exists entries_meta_idx       on entries using gin (meta jsonb_path_ops);
create index if not exists entries_content_trgm   on entries using gin ((coalesce(title,'') || ' ' || coalesce(content,'')) gin_trgm_ops);
create index if not exists entries_task_idx       on entries (task_id) where task_id is not null;

-- ---------------------------------------------------------------- 待办 / 完成
-- 「今日待办」= planned_day = 今天 且 status = 'pending'
-- 「今日完成」= done_at::date = 今天（无论当初计划哪天）
create table if not exists tasks (
  id           bigserial primary key,
  user_id      text not null references users(sub) on delete cascade,
  title        text not null,
  note         text,
  status       text not null default 'pending',   -- pending | done | cancelled
  priority     smallint not null default 0,       -- 0 普通 1 重要 2 紧急
  planned_day  date,                              -- 打算哪天做（NULL = 收集箱）
  due_day      date,                              -- 截止日
  done_at      timestamptz,
  tags         text[] not null default '{}',
  parent_id    bigint references tasks(id) on delete cascade,
  sort         integer not null default 0,
  source       text not null default 'web',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists tasks_user_status_idx on tasks (user_id, status, planned_day) where deleted_at is null;
create index if not exists tasks_user_done_idx   on tasks (user_id, done_at desc) where deleted_at is null;
create index if not exists tasks_tags_idx        on tasks using gin (tags);

-- ---------------------------------------------------------------- 习惯打卡
create table if not exists habits (
  id         bigserial primary key,
  user_id    text not null references users(sub) on delete cascade,
  name       text not null,
  icon       text,
  color      text,
  kind       text not null default 'bool',        -- bool（打卡）| count（计数，如喝水 8 杯）
  target     numeric(10,2),                       -- count 型的目标值
  unit       text,
  freq       text not null default 'daily',       -- daily | weekly:N | monthly:N
  sort       integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists habit_logs (
  id         bigserial primary key,
  habit_id   bigint not null references habits(id) on delete cascade,
  user_id    text not null references users(sub) on delete cascade,
  day        date not null,
  value      numeric(10,2) not null default 1,
  note       text,
  created_at timestamptz not null default now(),
  unique (habit_id, day)
);
create index if not exists habit_logs_user_day_idx on habit_logs (user_id, day desc);

-- ---------------------------------------------------------------- 位置
create table if not exists locations (
  id          bigserial primary key,
  user_id     text not null references users(sub) on delete cascade,
  day         date not null,
  happened_at timestamptz not null default now(),
  lat         double precision not null,
  lng         double precision not null,
  accuracy    double precision,
  altitude    double precision,
  speed       double precision,
  place_name  text,                               -- 「深圳市南山区科技园」
  city        text,
  region      text,
  country     text,
  address     text,
  source      text not null default 'web',        -- web | mcp | gpx | manual
  entry_id    bigint references entries(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists locations_user_day_idx on locations (user_id, day desc);
create index if not exists locations_geo_idx      on locations (lat, lng);

-- ---------------------------------------------------------------- 每日总结
create table if not exists daily_summaries (
  id               bigserial primary key,
  user_id          text not null references users(sub) on delete cascade,
  day              date not null,
  mood             smallint,                      -- 1..5
  energy           smallint,                      -- 1..5
  summary          text,                          -- 用户手写
  ai_summary       text,                          -- AI 生成
  ai_generated_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, day)
);

-- ---------------------------------------------------------------- AI 接入密钥
-- 只存 sha256，明文仅签发时返回一次。
create table if not exists api_keys (
  id           bigserial primary key,
  user_id      text not null references users(sub) on delete cascade,
  name         text not null default 'default',
  prefix       text not null,                     -- 明文前 8 位，便于列表里辨认
  key_sha256   text not null unique,
  scopes       text[] not null default '{read}',  -- read | write | admin
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);
create index if not exists api_keys_user_idx on api_keys (user_id) where revoked_at is null;

-- ---------------------------------------------------------------- 附件（截图 / 录音，供 AI 解析）
create table if not exists attachments (
  id         bigserial primary key,
  user_id    text not null references users(sub) on delete cascade,
  entry_id   bigint references entries(id) on delete cascade,
  kind       text not null default 'image',       -- image | audio | file
  filename   text,
  mime       text,
  size       integer,
  data       bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists attachments_user_idx on attachments (user_id, created_at desc);

-- ---------------------------------------------------------------- 迁移记录
create table if not exists schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);
