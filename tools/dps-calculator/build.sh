#!/usr/bin/env bash
# 构建内置配装计算器，输出到 client/public/dps-calculator/。
# 用法：bash tools/dps-calculator/build.sh [--force]
# 产物不进 git；打包发版（.github/workflows/release.yml）前会自动跑这个脚本。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
REPO="https://github.com/jx3dps-online/jx3dps-online-public.git"
COMMIT="230eac473429502908b2307e8571df547a9c034b"
SRC="${DPS_CALC_SRC:-$HERE/.cache/src}"
OUT="$ROOT/client/public/dps-calculator"

sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
# 上游提交、补丁、桥接、引擎、本脚本任何一个变了都要重新构建
PATCH_HASH="$( (echo "$COMMIT"; cat "$HERE/bridge.ts" "$HERE/engine.ts" "$HERE/apply-patches.mjs" "$HERE/build.sh") | sha | cut -c1-16)"

if [ "${1:-}" != "--force" ] && [ -f "$OUT/VERSION.json" ] && grep -q "\"patch\": \"$PATCH_HASH\"" "$OUT/VERSION.json"; then
  echo "内置计算器已是最新（$PATCH_HASH），跳过。要重新构建请加 --force。"
  exit 0
fi

echo "[1/4] 取上游源码 $COMMIT"
mkdir -p "$SRC"
if [ ! -d "$SRC/.git" ]; then
  git -C "$SRC" init -q
  git -C "$SRC" remote add origin "$REPO"
fi
git -C "$SRC" config core.longpaths true
git -C "$SRC" config core.autocrlf false
if ! git -C "$SRC" cat-file -e "$COMMIT^{commit}" 2>/dev/null; then
  git -C "$SRC" fetch -q --depth 1 origin "$COMMIT"
fi
git -C "$SRC" reset -q --hard "$COMMIT"
git -C "$SRC" clean -fdq -e node_modules

echo "[2/4] 安装上游依赖"
(cd "$SRC" && pnpm install --frozen-lockfile --ignore-scripts)

echo "[3/4] 打补丁并构建（约 3 分钟）"
node "$HERE/apply-patches.mjs" "$SRC"
(
  cd "$SRC"
  CI=false GENERATE_SOURCEMAP=false REACT_APP_BUILD_TYPE=local PUBLIC_URL=./ \
    node --max-old-space-size=6144 scripts/build.js
)

echo "[4/4] 复制到 $OUT"
# 先在临时目录拼好产物，再就地覆盖、只删新产物里没有的旧文件。
# 不整个删掉目录：开发服务（vite）记着 public 下有哪些文件，目录被删后它会把这些文件当成不存在。
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/out"
cp -R "$SRC/build/." "$STAGE/out/"
# JCL 转换器（9.5 MB）只给网页版的 JCL 导入用，local 模式关掉了这个入口；_headers、robots.txt 是网站部署用的
rm -rf "$STAGE/out/jcl-wasm" "$STAGE/out/_headers" "$STAGE/out/robots.txt"
cp "$SRC/LICENSE" "$STAGE/out/LICENSE.txt"
cat > "$STAGE/out/VERSION.json" <<EOF
{
  "upstream": "$REPO",
  "commit": "$COMMIT",
  "patch": "$PATCH_HASH",
  "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
mkdir -p "$OUT"
cp -R "$STAGE/out/." "$OUT/"
(cd "$OUT" && find . -type f | LC_ALL=C sort) > "$STAGE/old.txt"
(cd "$STAGE/out" && find . -type f | LC_ALL=C sort) > "$STAGE/new.txt"
# 不用 xargs -d：macOS 的 xargs 没有这个参数，发版的 Mac 机器会在这里失败
LC_ALL=C comm -23 "$STAGE/old.txt" "$STAGE/new.txt" > "$STAGE/stale.txt"
while IFS= read -r f; do rm -f -- "$OUT/$f"; done < "$STAGE/stale.txt"
find "$OUT" -mindepth 1 -type d -empty -delete
echo "完成：$(du -sh "$OUT" | cut -f1)，$(find "$OUT" -type f | wc -l | tr -d ' ') 个文件"
