// Original flat-style SVG illustrations for a few iconic cards. These are our
// own vector art (no copyrighted material) embedded as data URIs. Drop more
// entries here to illustrate additional cards; PlayingCard uses them via
// CARD_IMAGE when present, else falls back to the emoji icon.

const svg = (inner: string) =>
  "data:image/svg+xml," +
  encodeURIComponent(
    // width/height are required: without an intrinsic size an SVG data-URI
    // won't render as a CSS background-image or via canvas drawImage.
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='96' viewBox='0 0 120 96'>${inner}</svg>`
  );

// A reusable "hand holding a card" symbol (local coords ~ -6..31 wide, 2..56
// tall). Referenced via <use href='#hc'> by the draw cards (Stagecoach / Wells
// Fargo) so N hands = draw N.
const HAND_CARD =
  `<g id='hc'>
     <rect x='6' y='2' width='22' height='34' rx='3' fill='#fdf9ef' stroke='#3f2a12' stroke-width='2'/>
     <line x1='10' y1='8' x2='24' y2='8' stroke='#cbb489' stroke-width='1.6'/>
     <line x1='10' y1='13' x2='21' y2='13' stroke='#cbb489' stroke-width='1.6'/>
     <g stroke='#9a6238' stroke-width='1.4' stroke-linejoin='round'>
       <g fill='#eec293'>
         <path d='M6 42 v-8 a3 3 0 0 1 6 0 v8 z'/>
         <path d='M12 42 v-10 a3 3 0 0 1 6 0 v10 z'/>
         <path d='M18 42 v-9 a3 3 0 0 1 6 0 v9 z'/>
         <path d='M24 42 v-7 a2.6 2.6 0 0 1 5.2 0 v7 z'/>
       </g>
       <path d='M3 42 h28 v8 a6 6 0 0 1 -6 6 h-16 a6 6 0 0 1 -6 -6 z' fill='#e8bd8e'/>
       <path d='M3 44 q-6 2 -6 8 q0 5 5 6' fill='#eec293'/>
     </g>
   </g>`;

// A gun's range as a token at the bottom: a circle with a faint cross and the
// centered number (matches the Panic! distance marker style).
const rangeBadge = (n: number) =>
  `<circle cx='60' cy='76' r='13' fill='#fff' stroke='#3a2410' stroke-width='2.5'/>
   <text x='60' y='76' text-anchor='middle' dominant-baseline='central' font-family='Georgia, "Times New Roman", serif' font-weight='bold' font-size='17' fill='#3a2410'>${n}</text>
   <g stroke='#c9b48a' stroke-width='1.4' opacity='0.55' stroke-linecap='round'>
     <line x1='60' y1='66' x2='60' y2='86'/><line x1='50' y1='76' x2='70' y2='76'/>
   </g>`;

// A revolver (short handgun) — Schofield.
const revolver =
  `<g fill='#222' stroke='#222' stroke-linejoin='round'>
     <rect x='52' y='30' width='36' height='6' rx='2'/>
     <path d='M40 26 h14 v16 h-14 z'/>
     <circle cx='45' cy='34' r='7'/>
     <path d='M38 42 q-3 15 -10 19 q5 5 10 3 q8 -7 11 -19 z'/>
     <path d='M41 42 a8 8 0 0 0 9 6' fill='none' stroke='#222' stroke-width='2'/>
   </g>`;

// A long gun (carbine/rifle) with a variable barrel length — the longer the
// barrel, the greater the range.
const rifle = (barrel: number) =>
  `<g fill='#222' stroke='#222' stroke-linejoin='round'>
     <path d='M6 32 q-3 0 -3 3 l0 12 q0 3 4 3 l16 -2 v-16 z'/>
     <rect x='22' y='32' width='14' height='14' rx='1'/>
     <rect x='36' y='36' width='${barrel}' height='4' rx='1'/>
     <path d='M24 46 q0 8 8 8 q6 0 6 -6' fill='none' stroke='#222' stroke-width='2.5'/>
     <line x1='31' y1='46' x2='31' y2='51' stroke='#222' stroke-width='2'/>
   </g>`;

// Illustrated (raster) card art dropped into public/cards/<defId>.png. Preferred
// over the vector CARD_ART below when a file is present; if the file is missing
// the <img> error path falls back to the SVG, then to the emoji icon, so an
// unfinished set of illustrations degrades instead of breaking.
export const CARD_PHOTO_IDS = [
  "bang", "missed", "beer", "indians", "volcanic", "duel", "panic", "gatling",
  "cat-balou", "general-store", "saloon", "stagecoach", "wells-fargo",
  "remington", "rev-carabine", "winchester", "barrel", "dynamite", "jail",
  "scope", "mustang", "schofield",
];

export const CARD_PHOTO: Record<string, string> = Object.fromEntries(
  CARD_PHOTO_IDS.map((id) => [id, `/cards/${id}.png`])
);

export const CARD_ART: Record<string, string> = {
  // Revolver firing to the left with a muzzle flash.
  bang: svg(
    `<g fill='#5b6470' stroke='#2b303a' stroke-width='2' stroke-linejoin='round'>
       <path d='M34 46 h52 v9 h-16 l-6 18 -11 0 4 -18 h-17 z'/>
       <rect x='60' y='55' width='4' height='11'/>
     </g>
     <g fill='#f2b705' stroke='#c47f00' stroke-width='1'>
       <polygon points='34,50 16,40 22,50 16,60'/>
       <circle cx='12' cy='50' r='4'/>
     </g>`
  ),
  // A hat pierced by an arrow — the shot went through the hat, not you: Missed!
  missed: svg(
    `<g fill='#7a5330' stroke='#3f2a12' stroke-width='2.5' stroke-linejoin='round'>
       <ellipse cx='58' cy='64' rx='30' ry='8'/>
       <path d='M43 64 C 41 40, 48 33, 58 33 C 68 33, 75 40, 73 64 Z'/>
     </g>
     <path d='M43 60 q15 7 30 0' fill='none' stroke='#2a1a0c' stroke-width='4'/>
     <line x1='20' y1='46' x2='98' y2='50' stroke='#5a3a1c' stroke-width='4' stroke-linecap='round'/>
     <path d='M98 50 l -12 -4 l 3 11 z' fill='#3a2410'/>
     <g stroke='#c0392b' stroke-width='3' stroke-linecap='round'>
       <line x1='20' y1='46' x2='12' y2='40'/>
       <line x1='20' y1='46' x2='12' y2='50'/>
     </g>`
  ),
  // A near-horizontal bullet (slightly tilted) with a green + at its tail —
  // spend the shot, gain a life.
  beer: svg(
    `<g transform='rotate(12 62 50)'>
       <rect x='42' y='42' width='28' height='16' rx='3' fill='#e0b23c' stroke='#8a6a18' stroke-width='1.5'/>
       <path d='M70 42 Q 90 50 70 58 Z' fill='#c99226' stroke='#8a6a18' stroke-width='1.5'/>
       <line x1='48' y1='42' x2='48' y2='58' stroke='#8a6a18' stroke-width='1.5'/>
     </g>
     <g stroke='#2ecc71' stroke-width='7' stroke-linecap='round'>
       <line x1='52' y1='40' x2='52' y2='62'/>
       <line x1='41' y1='51' x2='63' y2='51'/>
     </g>`
  ),
  // Three dynamite sticks with a lit fuse.
  dynamite: svg(
    `<g stroke='#6b1a1a' stroke-width='2'>
       <rect x='42' y='34' width='12' height='46' rx='3' fill='#c0392b'/>
       <rect x='56' y='34' width='12' height='46' rx='3' fill='#c0392b'/>
       <rect x='70' y='34' width='12' height='46' rx='3' fill='#c0392b'/>
     </g>
     <rect x='38' y='50' width='48' height='9' fill='#7a4a12'/>
     <path d='M82 34 q16 -8 18 -24' fill='none' stroke='#555' stroke-width='3'/>
     <circle cx='100' cy='9' r='6' fill='#ffb300'/><circle cx='100' cy='9' r='3' fill='#fff3c4'/>`
  ),
  // Draw! a Heart = a Missed!: a card with a heart, an equals sign, then the
  // hat-pierced-by-arrow Missed! symbol.
  barrel: svg(
    `<rect x='6' y='28' width='30' height='42' rx='4' fill='#fdf9ef' stroke='#3f2a12' stroke-width='2'/>
     <path d='M21 60 C 10 51, 14 41, 21 47 C 28 41, 32 51, 21 60 Z' fill='#c0392b' stroke='#7a1f1f' stroke-width='1'/>
     <g fill='#3a2410'>
       <rect x='42' y='44' width='13' height='4.5' rx='2'/>
       <rect x='42' y='52' width='13' height='4.5' rx='2'/>
     </g>
     <g fill='#7a5330' stroke='#3f2a12' stroke-width='2' stroke-linejoin='round'>
       <ellipse cx='87' cy='62' rx='23' ry='6'/>
       <path d='M76 62 C 75 43, 80 38, 87 38 C 94 38, 99 43, 98 62 Z'/>
     </g>
     <path d='M76 59 q11 5 22 0' fill='none' stroke='#2a1a0c' stroke-width='3'/>
     <line x1='63' y1='47' x2='112' y2='50' stroke='#5a3a1c' stroke-width='3' stroke-linecap='round'/>
     <path d='M112 50 l -10 -3 l 2 9 z' fill='#3a2410'/>
     <g stroke='#c0392b' stroke-width='2.5' stroke-linecap='round'>
       <line x1='63' y1='47' x2='56' y2='42'/>
       <line x1='63' y1='47' x2='56' y2='51'/>
     </g>`
  ),
  // Jail bars.
  jail: svg(
    `<rect x='32' y='24' width='58' height='54' rx='2' fill='#dfe3e6' stroke='#5a5f63' stroke-width='2'/>
     <g fill='#8a9096'>
       <rect x='40' y='24' width='6' height='54'/><rect x='54' y='24' width='6' height='54'/>
       <rect x='68' y='24' width='6' height='54'/><rect x='82' y='24' width='6' height='54'/>
     </g>
     <rect x='30' y='22' width='62' height='6' fill='#5a5f63'/><rect x='30' y='76' width='62' height='6' fill='#5a5f63'/>`
  ),
  // Telescope / scope with crosshair glint.
  scope: svg(
    `<g transform='rotate(-25 60 52)'>
       <rect x='34' y='44' width='50' height='18' rx='9' fill='#3a4a5a' stroke='#1f2a36' stroke-width='2'/>
       <rect x='80' y='40' width='10' height='26' rx='3' fill='#26323e'/>
       <circle cx='40' cy='53' r='6' fill='#8fd0ff'/>
     </g>
     <g stroke='#2ecc71' stroke-width='2'><line x1='96' y1='16' x2='108' y2='28'/><line x1='108' y1='16' x2='96' y2='28'/></g>`
  ),
  // Gatling gun: rotating barrels + crank.
  gatling: svg(
    `<circle cx='34' cy='52' r='12' fill='#374151' stroke='#1f2937' stroke-width='2'/>
     <rect x='34' y='44' width='40' height='16' rx='4' fill='#6b7280' stroke='#374151' stroke-width='2'/>
     <g fill='#4b5563' stroke='#2b333f' stroke-width='1'>
       <rect x='72' y='39' width='34' height='6' rx='3'/><rect x='72' y='49' width='34' height='6' rx='3'/><rect x='72' y='59' width='34' height='6' rx='3'/>
     </g>
     <rect x='44' y='60' width='6' height='18' fill='#374151'/>`
  ),
  // Cat Balou: a card struck out by a red X, a cowboy hat beside it — force a
  // card to be discarded.
  "cat-balou": svg(
    `<rect x='14' y='18' width='42' height='60' rx='5' fill='#fdf9ef' stroke='#3f2a12' stroke-width='2.5'/>
     <g stroke='#e02424' stroke-width='6' stroke-linecap='round'>
       <line x1='20' y1='24' x2='50' y2='72'/>
       <line x1='50' y1='24' x2='20' y2='72'/>
     </g>
     <g fill='#7a5330' stroke='#3f2a12' stroke-width='2.5' stroke-linejoin='round'>
       <ellipse cx='88' cy='64' rx='27' ry='8'/>
       <path d='M75 64 C 73 43, 79 37, 88 37 C 97 37, 103 43, 101 64 Z'/>
     </g>
     <path d='M75 60 q13 6 26 0' fill='none' stroke='#2a1a0c' stroke-width='4'/>`
  ),
  // Indians!: a bullet struck out by a red X (discard a Bang!) beside two
  // overlapping hats pierced by an arrow (the raid).
  indians: svg(
    `<g stroke-linejoin='round'>
       <rect x='14' y='44' width='20' height='14' rx='2' fill='#e0b23c' stroke='#8a6a18' stroke-width='1.5'/>
       <path d='M34 44 Q 48 51 34 58 Z' fill='#c99226' stroke='#8a6a18' stroke-width='1.5'/>
       <line x1='19' y1='44' x2='19' y2='58' stroke='#8a6a18' stroke-width='1.5'/>
     </g>
     <g stroke='#e02424' stroke-width='5.5' stroke-linecap='round'>
       <line x1='14' y1='40' x2='48' y2='62'/>
       <line x1='48' y1='40' x2='14' y2='62'/>
     </g>
     <g fill='#8a5a2b' stroke='#3f2a12' stroke-width='2' stroke-linejoin='round'>
       <ellipse cx='74' cy='60' rx='17' ry='5'/>
       <path d='M62 60 C 61 47, 66 42, 74 42 C 82 42, 87 47, 86 60 Z'/>
     </g>
     <g fill='#a86a30' stroke='#3f2a12' stroke-width='2' stroke-linejoin='round'>
       <ellipse cx='95' cy='66' rx='17' ry='5'/>
       <path d='M83 66 C 82 53, 87 48, 95 48 C 103 48, 108 53, 107 66 Z'/>
     </g>
     <line x1='56' y1='50' x2='114' y2='58' stroke='#5a3a1c' stroke-width='3' stroke-linecap='round'/>
     <path d='M114 58 l -10 -3 l 2 8 z' fill='#3a2410'/>
     <g stroke='#c0392b' stroke-width='2.5' stroke-linecap='round'>
       <line x1='56' y1='50' x2='50' y2='45'/>
       <line x1='56' y1='50' x2='50' y2='54'/>
     </g>`
  ),
  // Panic!: a hand holding a card beside a ①-distance token — take a card from a
  // player at distance 1.
  panic: svg(
    `<g transform='rotate(-8 33 30)'>
       <rect x='19' y='6' width='27' height='42' rx='4' fill='#fdf9ef' stroke='#3f2a12' stroke-width='2'/>
       <line x1='24' y1='13' x2='41' y2='13' stroke='#cbb489' stroke-width='2'/>
       <line x1='24' y1='19' x2='37' y2='19' stroke='#cbb489' stroke-width='2'/>
     </g>
     <g stroke='#9a6238' stroke-width='1.6' stroke-linejoin='round' stroke-linecap='round'>
       <g fill='#eec293'>
         <path d='M20 58 v-12 a4 4 0 0 1 8 0 v12 z'/>
         <path d='M28 58 v-15 a4 4 0 0 1 8 0 v15 z'/>
         <path d='M36 58 v-13 a4 4 0 0 1 8 0 v13 z'/>
         <path d='M44 58 v-10 a3.5 3.5 0 0 1 7 0 v10 z'/>
       </g>
       <path d='M17 58 h37 v10 a8 8 0 0 1 -8 8 h-21 a8 8 0 0 1 -8 -8 z' fill='#e8bd8e'/>
       <path d='M20 61 h32' fill='none' stroke='#c98f5e' stroke-width='1.2'/>
       <path d='M17 60 q-9 3 -9 11 q0 6 6 7' fill='#eec293'/>
     </g>
     <circle cx='93' cy='48' r='17' fill='#fff' stroke='#3a2410' stroke-width='3'/>
     <g stroke='#3a2410' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round' fill='none'>
       <path d='M89 42 l5 -3 v18'/>
       <line x1='87' y1='57' x2='99' y2='57'/>
     </g>
     <g stroke='#c9b48a' stroke-width='1.5' opacity='0.55' stroke-linecap='round'>
       <line x1='93' y1='34' x2='93' y2='62'/>
       <line x1='79' y1='48' x2='107' y2='48'/>
     </g>`
  ),
  // Stagecoach: two hands each holding a card — draw 2.
  stagecoach: svg(`<defs>${HAND_CARD}</defs>
     <use href='#hc' transform='translate(16 16)'/>
     <use href='#hc' transform='translate(62 16)'/>`),
  // Wells Fargo: three hands each holding a card — draw 3.
  "wells-fargo": svg(`<defs>${HAND_CARD}</defs>
     <use href='#hc' transform='translate(6 26) scale(0.8)'/>
     <use href='#hc' transform='translate(44 16) scale(0.8)'/>
     <use href='#hc' transform='translate(82 26) scale(0.8)'/>`),
  // Saloon: the Beer heal symbol beside three hats in a triangle — everyone heals.
  saloon: svg(
    `<g transform='rotate(12 28 46)'>
       <rect x='12' y='40' width='24' height='13' rx='3' fill='#e0b23c' stroke='#8a6a18' stroke-width='1.5'/>
       <path d='M36 40 Q 52 46 36 53 Z' fill='#c99226' stroke='#8a6a18' stroke-width='1.5'/>
       <line x1='17' y1='40' x2='17' y2='53' stroke='#8a6a18' stroke-width='1.5'/>
     </g>
     <g stroke='#2ecc71' stroke-width='6' stroke-linecap='round'>
       <line x1='24' y1='37' x2='24' y2='55'/>
       <line x1='15' y1='46' x2='33' y2='46'/>
     </g>
     <g fill='#7a5330' stroke='#3f2a12' stroke-width='2' stroke-linejoin='round'>
       <g transform='translate(86 30)'>
         <ellipse cx='0' cy='6' rx='15' ry='4.5'/>
         <path d='M-10 6 C -11 -8, -6 -12, 0 -12 C 6 -12, 11 -8, 10 6 Z'/>
       </g>
       <g transform='translate(73 58)'>
         <ellipse cx='0' cy='6' rx='15' ry='4.5'/>
         <path d='M-10 6 C -11 -8, -6 -12, 0 -12 C 6 -12, 11 -8, 10 6 Z'/>
       </g>
       <g transform='translate(101 58)'>
         <ellipse cx='0' cy='6' rx='15' ry='4.5'/>
         <path d='M-10 6 C -11 -8, -6 -12, 0 -12 C 6 -12, 11 -8, 10 6 Z'/>
       </g>
     </g>`
  ),
  // Guns: the weapon drawn up top, range token below. Barrel length grows with
  // range — revolver (1–2) → carbine (3) → rifle (4) → long rifle (5).
  volcanic: svg(revolver + rangeBadge(1)),
  schofield: svg(revolver + rangeBadge(2)),
  remington: svg(rifle(30) + rangeBadge(3)),
  "rev-carabine": svg(rifle(52) + rangeBadge(4)),
  winchester: svg(rifle(70) + rangeBadge(5)),
};
