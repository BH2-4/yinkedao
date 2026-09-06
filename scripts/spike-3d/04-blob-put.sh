#!/bin/bash
#
# @vercel/blob 落盘 spike —— 纯 curl 复刻 @vercel/blob put() 的 HTTP 协议。
#
# 为什么不用 vercel CLI / @vercel/blob 包：CLI 的 node fetch 走不了本机
# 代理（同 Meshy 根因），而 put 的底层协议是公开 HTTP（源码
# vercel/storage packages/blob/src/{api,put-helpers}.ts）：
#   PUT https://blob.vercel-storage.com/?pathname=<encoded>
#   authorization: Bearer <BLOB_READ_WRITE_TOKEN>
#   x-api-version: 11
#   x-add-random-suffix: 0   （固定文件名，不加随机后缀）
#   x-content-type: model/gltf-binary
#
# 前置（一次性，均已执行）：
#   建店   POST /v1/storage/stores/blob {name:seal-3d-spike, access:public} → store_i5Y1Y4ahJeUOiCD3
#   连项目 POST /v1/storage/stores/{id}/connections {projectId, type:integration}
#          → BLOB_READ_WRITE_TOKEN 随 env 下发（解密拉取）
#
# 用法：bash scripts/spike-3d/04-blob-put.sh <文件> <pathname>
# 示例：bash scripts/spike-3d/04-blob-put.sh output/seal.glb seal-spike/seal.glb

set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
FILE="${1:-$DIR/output/seal.glb}"
PATHNAME="${2:-seal-spike/seal.glb}"
PROXY="${HTTPS_PROXY:-http://127.0.0.1:12450}"
VTOKEN="$(tr -d '[:space:]' < "$DIR/../../.vercel-token")"

# BLOB token 从项目 env 单条端点解密提取（token 只落 /tmp，不进项目不进 git）。
# 坑：列表端点 ?decryptSecrets=true 返回的是 v2 加密壳（eyJ2...），
#     单条端点 /env/{id}?decryptSecrets=true 才返回 vercel_blob_rw_ 原始值。
BTOKEN_FILE=/tmp/seal-spike-blob-token
if [ ! -s "$BTOKEN_FILE" ]; then
  echo "[1] 拉取 BLOB_READ_WRITE_TOKEN（单条端点解密）…"
  curl -sS -x "$PROXY" -H "Authorization: Bearer $VTOKEN" \
    "https://api.vercel.com/v9/projects/prj_77ye01EbrzMmoOnBGYSb4f2mIoTD/env?decryptSecrets=true" \
    -o /tmp/blob-env-list.json
  python3 - <<'PYEOF'
import json, urllib.request, os
envs = json.load(open('/tmp/blob-env-list.json')).get('envs', [])
hit = next((e for e in envs if e.get('key') == 'BLOB_READ_WRITE_TOKEN'), None)
assert hit, 'env 中无 BLOB_READ_WRITE_TOKEN——先连接 store 到项目'
print(f"  目标 env id: {hit['id']}")
PYEOF
  ENV_ID=$(python3 -c "
import json
envs = json.load(open('/tmp/blob-env-list.json')).get('envs', [])
print(next(e['id'] for e in envs if e.get('key')=='BLOB_READ_WRITE_TOKEN'))")
  curl -sS -x "$PROXY" -H "Authorization: Bearer $VTOKEN" \
    "https://api.vercel.com/v9/projects/prj_77ye01EbrzMmoOnBGYSb4f2mIoTD/env/$ENV_ID?decryptSecrets=true" \
    | python3 -c "
import json, sys
tok = json.load(sys.stdin).get('value')
assert tok and tok.startswith('vercel_blob_rw_'), f'解密失败：{str(tok)[:30]}'
open('$BTOKEN_FILE', 'w').write(tok)
print(f'  原始 token 已缓存 {len(tok)} 字符（vercel_blob_rw_… 值不回显）')"
fi
BTOKEN="$(cat "$BTOKEN_FILE")"

SIZE=$(stat -f%z "$FILE")
echo "[2] PUT ${PATHNAME}（${SIZE} 字节 = $(echo "scale=1; $SIZE/1048576" | bc) MB）…"

ENC_PATHNAME=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$PATHNAME")
HTTP_CODE=$(curl -sS -x "$PROXY" -X PUT \
  -H "authorization: Bearer $BTOKEN" \
  -H "x-api-version: 11" \
  -H "x-add-random-suffix: 0" \
  -H "x-content-type: model/gltf-binary" \
  --data-binary "@$FILE" \
  "https://blob.vercel-storage.com/?pathname=$ENC_PATHNAME" \
  -o /tmp/blob-put-resp.json -w "%{http_code}")

echo "  HTTP $HTTP_CODE"
python3 -c "
import json
r = json.load(open('/tmp/blob-put-resp.json'))
if 'url' in r:
    print('✅ 已落盘：')
    print('   url        =', r['url'])
    print('   pathname   =', r['pathname'])
    print('   contentType=', r['contentType'])
else:
    print('✗ 失败：', json.dumps(r, ensure_ascii=False)[:300])"

# [3] 回验：GET 远端字节数与本地一致
URL=$(python3 -c "import json;print(json.load(open('/tmp/blob-put-resp.json')).get('url',''))" 2>/dev/null || true)
if [ -n "$URL" ] && [ "$URL" != "" ]; then
  REMOTE=$(curl -sS -x "$PROXY" -o /dev/null -w "%{size_download}" "$URL")
  echo "[3] 回验：远端 ${REMOTE} vs 本地 ${SIZE} 字节 $([ "$REMOTE" = "$SIZE" ] && echo '✅ 一致' || echo '❌ 不一致')"
fi
