#!/usr/bin/env bash
# 构建产物并本地预览（生产模式）
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WS="$(cd "$HERE/.." && pwd)"
RUN="${APLUSNEXUS_RUN_DIR:-/home/julian/AplusNexusRun}"

bash "$HERE/run-env.sh" ensure

if [ ! -d "$RUN/node_modules" ]; then
  echo "未找到依赖，请先运行: npm run setup" >&2
  exit 1
fi

export APLUSNEXUS_WORKSPACE="$WS"
export NODE_PATH="$RUN/node_modules"
export PATH="$RUN/node_modules/.bin:$PATH"

cd "$RUN"

echo "正在构建前端 ..."
vite build

echo "启动预览服务（后端托管静态文件）..."
exec tsx server/index.ts
