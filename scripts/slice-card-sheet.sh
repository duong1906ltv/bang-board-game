#!/usr/bin/env bash
# Slice a sheet of N card images laid out in a single row into the per-card
# illustrations that <PlayingCard> loads from public/cards/<defId>.png.
#
#   ./scripts/slice-card-sheet.sh sheet.png bang missed beer indians
#
# Only the *illustration* is extracted, not the whole card: our card face draws
# its own frame, name, effect text and suit/rank, so keeping the printed card's
# frame and title would double them up.
#
# Tunables (fractions of one card's box) if a sheet is cropped differently:
#   ART_TOP / ART_BOTTOM  vertical span of the illustration panel   (default .22/.80)
#   ART_LEFT / ART_RIGHT  horizontal span                           (default .07/.93)
#   ROW_BOTTOM            how far down the sheet the card row ends  (default .82)
#                         — excludes any caption text under the cards
set -euo pipefail

sheet=${1:?usage: slice-card-sheet.sh <sheet-image> <defId> [defId...]}
shift
[ $# -gt 0 ] || { echo "give at least one card id" >&2; exit 1; }

ART_TOP=${ART_TOP:-0.22}
ART_BOTTOM=${ART_BOTTOM:-0.80}
ART_LEFT=${ART_LEFT:-0.07}
ART_RIGHT=${ART_RIGHT:-0.93}
ROW_BOTTOM=${ROW_BOTTOM:-0.82}

out="$(cd "$(dirname "$0")/.." && pwd)/public/cards"
mkdir -p "$out"

SW=$(magick identify -format '%w' "$sheet")
SH=$(magick identify -format '%h' "$sheet")
row_h=$(awk -v h="$SH" -v f="$ROW_BOTTOM" 'BEGIN{printf "%d", h*f}')
n=$#
col_w=$((SW / n))

i=0
for id in "$@"; do
  x=$((i * col_w))
  # Crop this card's column (minus any caption row), trim the transparent
  # margin so the card box is tight, then cut out the illustration panel.
  magick "$sheet" -crop "${col_w}x${row_h}+${x}+0" +repage \
    -trim +repage \
    -set option:ax "%[fx:w*$ART_LEFT]" -set option:ay "%[fx:h*$ART_TOP]" \
    -set option:aw "%[fx:w*($ART_RIGHT-$ART_LEFT)]" \
    -set option:ah "%[fx:h*($ART_BOTTOM-$ART_TOP)]" \
    -crop '%[aw]x%[ah]+%[ax]+%[ay]' +repage \
    -background none -alpha remove -alpha off \
    -resize '360x360^' -strip \
    "$out/$id.png"
  echo "$out/$id.png  <-  column $((i + 1))/$n"
  i=$((i + 1))
done

echo
echo "Check the crops, then reload the app — public/cards/<id>.png wins over the vector art."
