#!/usr/bin/env bash
# Build the playground site from an unak/les checkout.
#
#   scripts/build.sh <path-to-unak/les> [out-dir=dist]
#
# Needs Go (the version unak/les's go.mod asks for, or newer), Node.js and `npm ci` done once.
set -euo pipefail

les_dir=$(cd "${1:?usage: scripts/build.sh <path-to-unak/les> [out-dir]}" && pwd)
out=${2:-dist}
root=$(cd "$(dirname "$0")/.." && pwd)

rm -rf "$out"
mkdir -p "$out"
out=$(cd "$out" && pwd)

sha=$(git -C "$les_dir" rev-parse HEAD)
if [ "$(git -C "$les_dir" rev-parse --is-shallow-repository)" = true ]; then
  version="dev-${sha:0:7}"  # the commit count needs full history
else
  version="0.1.$(git -C "$les_dir" rev-list --count HEAD)"  # same scheme as unak/les releases
fi

echo "building les ${version} (${sha:0:7}) for js/wasm with $(go env GOVERSION)"
(
  cd "$les_dir"
  GOOS=js GOARCH=wasm go build -trimpath -ldflags "-s -w -X main.Version=${version}" -o "$out/les.wasm" ./cmd/les
)

goroot=$(go env GOROOT)
wasm_exec="$goroot/lib/wasm/wasm_exec.js"           # Go 1.24+
[ -f "$wasm_exec" ] || wasm_exec="$goroot/misc/wasm/wasm_exec.js"
cp "$wasm_exec" "$out/wasm_exec.js"
cp "$goroot/LICENSE" "$out/LICENSE-go.txt"

node "$root/scripts/build.mjs" \
  --les "$les_dir" --out "$out" \
  --sha "$sha" --version "$version" --go "$(go env GOVERSION)" \
  ${PLAYGROUND_REPO:+--repo "$PLAYGROUND_REPO"}
