#!/usr/bin/env bash
# AplusNexus — 运行镜像管理
#
# 背景：本项目仓库位于 /sdcard（FUSE 文件系统），该挂载带 noexec 且不支持符号链接，
# 因此 node_modules 无法安装、esbuild/vite 等原生二进制无法执行。
#
# 方案：源码单一真源保留在仓库内；在 /home（f2fs）建立「运行镜像」目录：
#   * 前端等条目以「符号链接」桥接 —— vite 通过 preserveSymlinks 直接读取仓库源码，改动实时生效；
#   * server/ 与 shared/ 使用「真实副本」 —— Node 的 ESM 解析会沿导入者的真实路径向上
#     查找 node_modules，软链会导致解析失败，因此这两个目录必须落为真实文件，由本脚本同步。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WS="$(cd "$HERE/.." && pwd)"
RUN="${APLUSNEXUS_RUN_DIR:-/home/julian/AplusNexusRun}"

# 不参与镜像的顶层条目
SKIP_RE='^(\.git|\.run|node_modules|data|backups|scripts|\.vscode|\.idea)$'
# 需要真实副本（而非软链）的目录：Node ESM 依赖解析要求
COPY_DIRS=(server shared)

is_copy_dir() {
  local n="$1" d
  for d in "${COPY_DIRS[@]}"; do [ "$n" = "$d" ] && return 0; done
  return 1
}

link_entry() {
  local name="$1" target="$WS/$1" link="$RUN/$1"
  [ -e "$target" ] || [ -L "$target" ] || return 0
  if [ -L "$link" ] && [ "$(readlink "$link")" = "$target" ]; then return 0; fi
  rm -rf "$link"
  ln -s "$target" "$link"
}

# 单向同步：把仓库源目录复制进运行镜像（仅复制更新的文件，避免无谓触碰）
sync_copy_dir() {
  local name="$1" src="$WS/$1" dst="$RUN/$1"
  [ -d "$src" ] || return 0
  # 若之前是软链，先移除
  [ -L "$dst" ] && rm -f "$dst"
  mkdir -p "$dst"
  cp -u -r "$src/." "$dst/"
}

ensure_run_dir() {
  mkdir -p "$RUN"
  local entry name
  for entry in "$WS"/* "$WS"/.[!.]*; do
    [ -e "$entry" ] || [ -L "$entry" ] || continue
    name="$(basename "$entry")"
    [[ "$name" =~ $SKIP_RE ]] && continue
    if is_copy_dir "$name"; then
      sync_copy_dir "$name"
    else
      link_entry "$name"
    fi
  done
  mkdir -p "$RUN/data"
  echo "运行镜像就绪: $RUN"
}

install_deps() {
  ensure_run_dir
  # 锁文件桥接回仓库，纳入版本管理
  local lock="$WS/package-lock.json"
  if [ -L "$RUN/package-lock.json" ] && [ "$(readlink "$RUN/package-lock.json")" != "$lock" ]; then
    rm -f "$RUN/package-lock.json"
  fi
  [ -e "$lock" ] || : > "$lock"
  [ -L "$RUN/package-lock.json" ] || ln -sfn "$lock" "$RUN/package-lock.json"

  echo "正在安装依赖到 $RUN ..."
  ( cd "$RUN" && npm install --no-audit --no-fund )
  echo "依赖安装完成。"
}

case "${1:-ensure}" in
  ensure) ensure_run_dir ;;
  sync) ensure_run_dir ;;
  install) install_deps ;;
  *) echo "用法: $0 [ensure|sync|install]" >&2; exit 2 ;;
esac
