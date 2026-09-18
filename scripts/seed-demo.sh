#!/usr/bin/env bash
# 向本地开发库插入一批演示卡片（带 #标签 / 优先级 / due date）。
#
# 用途：本地开发与验收时快速获得有内容的看板与图谱。
# 说明：演示数据只写入本地 data/ 下的 SQLite，data/ 已在 .gitignore 中，不会进仓库。
#       重复执行会重复插入，如需重置请先删除 data/aplusnexus.db。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WS="$(cd "$HERE/.." && pwd)"

BASE="${APLUSNEXUS_BASE_URL:-http://127.0.0.1:3001}"
PASSWORD="${APLUSNEXUS_PASSWORD:-aplusnexus}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

echo "登录 $BASE ..."
CODE="$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" \
  -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"password\":\"$PASSWORD\"}")"
if [ "$CODE" != "200" ]; then
  echo "登录失败（HTTP $CODE）。请确认后端已启动（npm run dev）且密码正确。" >&2
  exit 1
fi

# 演示卡片：覆盖 todo/idea/note/link 四种类型与多个标签领域
CARDS=(
  '[ ] 写 CVPR intro P0 #科研 #CVPR @明天'
  '[ ] 补实验消融表格 P1 #科研 #实验'
  '[ ] 整理参考文献 P2 #科研 #写作'
  '? 多模态情感分析能不能用 RL 做融合 P1 #科研 #多模态 #想法'
  '! 做一个 AI+法律的播客 P2 #内容 #播客'
  '! 用图谱可视化读书笔记 #工具 #图谱 #想法'
  'https://arxiv.org/abs/2401.00001 #论文 #科研 #多模态'
  'https://github.com/d3/d3-force #工具 #图谱'
  '本周复盘：科研推进偏慢，内容产出稳定 #复盘 #科研 #内容'
  '读书笔记：卡片盒笔记法强调不分类 #笔记 #方法 #卡片盒'
  '[x] 回复审稿意见 P0 #科研 #写作'
  '灵感：把 todo 和知识库合成一个网络 #想法 #工具 #图谱'
)

ok=0
for content in "${CARDS[@]}"; do
  # 用 python 做 JSON 转义，避免引号/中文出错
  payload="$(CONTENT="$content" python3 -c 'import json,os;print(json.dumps({"content":os.environ["CONTENT"]},ensure_ascii=False))')"
  code="$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" \
    -X POST "$BASE/api/cards" -H 'content-type: application/json' -d "$payload")"
  if [ "$code" = "201" ]; then ok=$((ok + 1)); else echo "  写入失败（HTTP $code）：$content" >&2; fi
done

echo "已写入 $ok/${#CARDS[@]} 张演示卡片。"
echo -n "当前统计："
curl -s -b "$JAR" "$BASE/api/stats"
echo
echo "提示：图谱视图（#/graph）与看板需要这些数据才有内容。"
