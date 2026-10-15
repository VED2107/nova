#!/usr/bin/env bash
# Downloads the pinned libmpv development build for Windows x86_64 into vendor/libmpv/.
# The build is pinned by URL and SHA-256. See docs/adr/0003-libmpv-distribution-and-licensing.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/vendor/libmpv"
URL="https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/20261015/mpv-dev-x86_64-20261015-git-492bae0768.7z"
SHA256="5db58c1768587b35f2d8daa11b53de4aec58197c00ea1d676f998f183a358ba8"
SEVENZR_URL="https://www.7-zip.org/a/7zr.exe"

if [[ -f "$DEST/libmpv-2.dll" && -f "$DEST/SOURCE.txt" ]] && grep -q "$SHA256" "$DEST/SOURCE.txt"; then
  echo "libmpv already present at $DEST"
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading $URL"
curl -fsSL -o "$TMP/mpv-dev.7z" "$URL"
echo "$SHA256  $TMP/mpv-dev.7z" | sha256sum -c -

SEVENZ="$(command -v 7z || command -v 7zr || true)"
if [[ -z "$SEVENZ" ]]; then
  curl -fsSL -o "$TMP/7zr.exe" "$SEVENZR_URL"
  SEVENZ="$TMP/7zr.exe"
fi

rm -rf "$DEST"
mkdir -p "$DEST"
"$SEVENZ" x -y -o"$DEST" "$TMP/mpv-dev.7z" >/dev/null
{
  echo "url=$URL"
  echo "sha256=$SHA256"
  echo "fetched=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$DEST/SOURCE.txt"
echo "libmpv installed to $DEST"
ls -la "$DEST"
