-- 纪念日 / 累计天数（counters）
--
-- 用途：记录「从某天起现在是第几天」或「距离某天还有几天」，
-- 例如结婚纪念日、离职第 N 天、距离生日还有几天。
--
-- 两个维度组合出四种常见用法：
--   mode=since + repeat=none   → 「离职第 1234 天」（一直往上涨）
--   mode=since + repeat=yearly → 「结婚第 2335 天 / 6 周年」（还能算下一个周年）
--   mode=until + repeat=none   → 「距离出发还有 12 天」（一次性倒计时）
--   mode=until + repeat=yearly → 「距离生日还有 32 天」（每年循环的倒计时）

create table if not exists counters (
  id         bigserial primary key,
  user_id    text not null references users(sub) on delete cascade,
  name       text not null,                        -- 「结婚纪念日」「离职」
  icon       text,                                 -- 图标键名（见 src/components/icons.tsx）
  start_day  date not null,                        -- 起始日 / 目标日
  mode       text not null default 'since',        -- since 累计 | until 倒计时
  repeat     text not null default 'none',         -- none 只算一次 | yearly 每年循环
  color      text,
  note       text,
  sort       integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists counters_user_idx on counters (user_id, sort, id) where active = true;
