// Character portraits under public/characters/<characterId>.png, cropped by
// scripts/import-character-art.sh. All 16 characters are covered; a character
// missing from this list falls back to the 🤠 glyph rather than an empty panel.

export const CHARACTER_PHOTO_IDS = [
  "bart-cassidy",
  "black-jack",
  "calamity-janet",
  "el-gringo",
  "jesse-jones",
  "jourdonnais",
  "kit-carlson",
  "lucky-duke",
  "paul-regret",
  "pedro-ramirez",
  "rose-doolan",
  "sid-ketchum",
  "slab-the-killer",
  "suzy-lafayette",
  "vulture-sam",
  "willy-the-kid",
];

export const CHARACTER_PHOTO: Record<string, string> = Object.fromEntries(
  CHARACTER_PHOTO_IDS.map((id) => [id, `/characters/${id}.png`])
);
