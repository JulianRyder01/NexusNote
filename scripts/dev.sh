#!/usr/bin/env bash
# 启动开发环境：Fastify 后端 + Vite 前端（并行）
#
# 前端：vite 经软链直接读取仓库源码，改动即时热更新。
# 后端：源码是运行镜像内的真实副本，故此处启动一个后台同步循环，
#       检测到仓库改动后同步到镜像，由 tsx watch 触发重启。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WS="$(cd "$HERE/.." && pwd)"
RUN="${APLUSNEXUS_RUN_DIR:-/home/julian/AplusNexusRun}"
SYNC_INTERVAL="${APLUSNEXUS_SYNC_INTERVAL:-2}"

bash "$HERE/run-env.sh" ensure

if [ ! -d "$RUN/node_modules" ]; then
  echo "未找到依赖，请先运行: npm run setup" >&2
  exit 1
fi

export APLUSNEXUS_WORKSPACE="$WS"
export NODE_PATH="$RUN/node_modules"
export PATH="$RUN/node_modules/.bin:$PATH"
export DATABASE_PATH="${DATABASE_PATH:-$WS/data/aplusnexus.db}"

# 后台同步循环：仓库 server/ shared/ -> 运行镜像
sync_loop() {
  while :; do
    sleep "$SYNC_INTERVAL"
    for d in server shared; do
      [ -d "$WS/$d" ] || continue
      cp -u -r "$WS/$d/." "$RUN/$d/" 2>/dev/null || true
    done
  done
}
sync_loop &
SYNC_PID=$!
trap 'kill "$SYNC_PID" 2>/dev/null || true' EXIT INT TERM

cd "$RUN"
"$RUN/node_modules/.bin/concurrently" \
  --names "server,web" \
  --prefix-colors "magenta,cyan" \
  --kill-others-on-fail \
  "tsx watch server/index.ts" \
  "vite"
