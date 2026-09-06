#!/bin/bash
#
# 3D 章石 glb 本地缓存预拉（B 线 · dev 专用）。
#
# 背景：本机网络对 blob.vercel-storage.com 的大文件（5MB+）传输不稳
# （浏览器/服务端直连均会间歇中断），curl 走系统代理最稳——dev 环境
# 由本脚本把 blob 上的 glb 预拉进 public/blob-cache/，前端在开发模式
# 下读本地缓存（Seal3DStudio 的 toAssetProxyUrl 约定）。
#
# 生产不受影响：线上直连 blob（CORS 通、网络正常）。
#
# 用法：bash scripts/seal-3d-face/fetch-blob-cache.sh <blob_url> [<blob_url>…]
# 示例：bash scripts/seal-3d-face/fetch-blob-cache.sh \
#   https://i5y1y4ahjeuoicd3.public.blob.vercel-storage.com/seal-3d/<task_id>.glb

set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
CACHE="$DIR/../../public/blob-cache"
PROXY="${HTTPS_PROXY:-http://127.0.0.1:12450}"

[ $# -ge 1 ] || { echo "用法: $0 <blob_url>…"; exit 1; }
mkdir -p "$CACHE"

for URL in "$@"; do
  # 路径形如 seal-3d/<task_id>.glb——缓存保持同构子目录
  PATHNAME="${URL#*public.blob.vercel-storage.com/}"
  DEST="$CACHE/$PATHNAME"
  mkdir -p "$(dirname "$DEST")"
  echo "[fetch] $PATHNAME"
  curl -sS --fail -x "$PROXY" --retry 3 --max-time 300 -o "$DEST" "$URL"
  SIZE=$(stat -f%z "$DEST")
  echo "  ✓ $SIZE bytes → $DEST"
done

echo "完成。缓存目录：$CACHE（git 忽略，可随时删除重拉）"
