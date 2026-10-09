#!/bin/sh
# 容器入口：先跑数据库迁移，再启动 Next.js server。
# 迁移是幂等的（记录在 schema_migrations），多容器部署时给从容器设 RUN_MIGRATIONS=0。
set -e

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  if [ -z "$DATABASE_URL" ]; then
    echo "[entrypoint] 警告：DATABASE_URL 为空，跳过迁移"
  else
    echo "[entrypoint] 执行数据库迁移…"
    node scripts/migrate.mjs
  fi
fi

exec node server.js
