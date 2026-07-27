#!/usr/bin/env bash
# Import one illustration as a card's art: public/cards/<defId>.png.
#
#   ./scripts/import-card-art.sh ~/Downloads/rifle.png volcanic
#
# Two things happen to the image:
#  * the drawn border (if any) is shaved off — our card face draws its own frame;
#  * it is brought to roughly the art panel's aspect ratio, so the card face can
#    fill the panel with it and no letterbox band ever shows. How depends on the
#    source shape:
#      - wider than the panel (a gun, a landscape scene): padded top and bottom
#        with a blurred, stretched copy of itself, which blends into the art's own
#        background. Nothing is cropped.
#      - taller than the panel (a standing character): cropped instead, anchored
#        to the top — blur pads that wide would be very visible, and the bottom of
#        a portrait (boots, ground) is the expendable part. Change with GRAVITY.
#
# Tunables: SHAVE (border to trim, default 3%), PANEL_ASPECT (w/h of the art
# panel, default 1.15 — between the md and sm card layouts), GRAVITY (which edge
# a too-tall source keeps, default north).
set -euo pipefail

src=${1:?usage: import-card-art.sh <image> <defId>}
id=${2:?usage: import-card-art.sh <image> <defId>}
SHAVE=${SHAVE:-3%}
PANEL_ASPECT=${PANEL_ASPECT:-1.15}
GRAVITY=${GRAVITY:-north}

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/public/cards/$id.png"
mkdir -p "$root/public/cards"

tmp=$(mktemp -t cardart).png
trap 'rm -f "$tmp"' EXIT
magick "$src" -shave "${SHAVE}x${SHAVE}" +repage -resize 560x -strip "$tmp"

W=$(magick identify -format '%w' "$tmp")
H=$(magick identify -format '%h' "$tmp")

if awk -v w="$W" -v h="$H" -v a="$PANEL_ASPECT" 'BEGIN{exit !(w/h >= a)}'; then
  # Wider than the panel: pad the height with a blurred backdrop of itself.
  TH=$(awk -v w="$W" -v a="$PANEL_ASPECT" 'BEGIN{printf "%d", w/a}')
  magick \( "$tmp" -resize "${W}x${TH}!" -blur 0x26 \) \( "$tmp" \) \
    -gravity center -composite -strip "$out"
  echo "padded to ${W}x${TH}"
else
  # Taller than the panel: crop the height, keeping the $GRAVITY edge.
  TH=$(awk -v w="$W" -v a="$PANEL_ASPECT" 'BEGIN{printf "%d", w/a}')
  magick "$tmp" -gravity "$GRAVITY" -crop "${W}x${TH}+0+0" +repage -strip "$out"
  echo "cropped to ${W}x${TH} (kept $GRAVITY)"
fi

echo "$out  ($(magick identify -format '%wx%h' "$out"))"
grep -q "\"$id\"" "$root/lib/cardArt.ts" \
  || echo "NOTE: add \"$id\" to CARD_PHOTO_IDS in lib/cardArt.ts for it to be used."
