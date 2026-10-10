#!/usr/bin/env bash
# 用途: 起一个一次性 Postgres 容器、跑迁移、执行全部测试（含集成测试），跑完自动销毁
# 用法: bash scripts/test-with-db.sh [vitest 参数...]   例：bash scripts/test-with-db.sh tests/integration
# 入参: 透传给 vitest；可用 TEST_DB_PORT 指定端口（默认由 docker 自动分配）
# 出参: vitest 输出；退出码同 vitest
# 依赖: docker, node
# 关键词: 测试, test, 集成测试, integration, vitest, postgres, 临时数据库, ci, 真库测试
# 更新: 2026-10-10
set -euo pipefail

NAME=lifelog-test-db
# 默认让 docker 自动分配宿主端口（固定端口很容易撞上别人已经在跑的容器）
PORT_SPEC="127.0.0.1::5432"
[ -n "${TEST_DB_PORT:-}" ] && PORT_SPEC="127.0.0.1:${TEST_DB_PORT}:5432"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

echo "[test] 启动临时 Postgres（$NAME）…"
docker run -d --rm --name "$NAME" \
  -e POSTGRES_DB=lifelog -e POSTGRES_USER=lifelog -e POSTGRES_PASSWORD=lifelog \
  -p "$PORT_SPEC" \
  postgres:17-alpine >/dev/null

PORT=$(docker port "$NAME" 5432/tcp 2>/dev/null | head -1 | sed 's/.*://')
if [ -z "$PORT" ]; then
  echo "[test] 拿不到容器端口，退出" >&2
  exit 1
fi
echo "[test] 宿主端口 $PORT"

for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U lifelog -d lifelog >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! docker exec "$NAME" pg_isready -U lifelog -d lifelog >/dev/null 2>&1; then
  echo "[test] 数据库 60 秒内没起来，容器状态与日志：" >&2
  docker ps -a --filter "name=$NAME" >&2
  docker logs "$NAME" 2>&1 | tail -20 >&2
  exit 1
fi

export TEST_DATABASE_URL="postgres://lifelog:lifelog@127.0.0.1:$PORT/lifelog"
export DATABASE_URL="$TEST_DATABASE_URL"
echo "[test] 执行迁移…"
node scripts/migrate.mjs

echo "[test] 跑测试…"
npx vitest run "$@"
