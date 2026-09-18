#!/usr/bin/env bash
# 一次性环境准备：建立运行镜像并安装依赖
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$HERE/run-env.sh" install
