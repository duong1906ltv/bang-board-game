#!/usr/bin/env bash
# Import character portraits into public/characters/<characterId>.png.
#
#   ./scripts/import-character-art.sh ~/Downloads/*.png
#
# The character id is derived from the file name ("Bart Cassidy.png" ->
# bart-cassidy), which is how CHARACTER_PHOTO in lib/characterArt.ts looks them up.
#
# Sources have come in two shapes so far, so the framing is configurable:
#   * square, portrait sitting above a drawn character card — that card repeats the
#     name and ability our own face already prints, so KEEP_PCT=58 cuts it off.
#       SHAVE=5% KEEP_PCT=58 ./scripts/import-character-art.sh ~/Downloads/*.png
#   * portrait, a framed scene inside a decorative parchment border — CROP takes the
#     inner scene, then the default ASPECT keeps its top.
#       CROP=780x835+74+175 ./scripts/import-character-art.sh ~/Downloads/*.png
#
# Whatever is kept must be anchored at the TOP: the card renders the art with
# object-fit: cover, so a centre crop of a standing figure loses the head.
#
# Tunables: CROP (explicit inner-scene geometry, wins over SHAVE), SHAVE (margin to
# trim, default 5%), ASPECT (w/h to crop down to from the top, default 1.17 — the
# card's 154x132 art panel), KEEP_PCT (keep this % of height instead of ASPECT).
set -euo pipefail

[ $# -gt 0 ] || { echo "usage: import-character-art.sh <image>..." >&2; exit 1; }
SHAVE=${SHAVE:-5%}
CROP=${CROP:-}
ASPECT=${ASPECT:-1.17}
KEEP_PCT=${KEEP_PCT:-}

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/public/characters"
mkdir -p "$out"

for src in "$@"; do
  base=$(basename "$src"); base=${base%.*}
  # Squeeze runs of spaces/underscores and trim the ends before hyphenating: file
  # names have arrived as "suzy.png", "lucky duke.png" and "calamity-janet .png",
  # and a stray space would otherwise become a trailing dash in the id.
  id=$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]' | tr -d '.' \
       | tr -s ' _' '  ' | sed 's/^ *//; s/ *$//' | tr ' ' '-')
  tmp=$(mktemp -t charart).png
  if [ -n "$CROP" ]; then
    magick "$src" -crop "$CROP" +repage "$tmp"
  else
    magick "$src" -shave "${SHAVE}x${SHAVE}" +repage "$tmp"
  fi
  if [ -n "$KEEP_PCT" ]; then
    keep="100%x${KEEP_PCT}%+0+0"
  else
    w=$(magick identify -format '%w' "$tmp")
    keep="${w}x$(awk -v w="$w" -v a="$ASPECT" 'BEGIN{printf "%d", w/a}')+0+0"
  fi
  magick "$tmp" -gravity north -crop "$keep" +repage -resize 560x -strip "$out/$id.png"
  rm -f "$tmp"
  printf '%-22s -> %s (%s)\n' "$base" "$id.png" "$(magick identify -format '%wx%h' "$out/$id.png")"
  grep -q "\"$id\"" "$root/lib/types.ts" \
    || echo "   WARNING: no character with id \"$id\" — check the file name" >&2
done
