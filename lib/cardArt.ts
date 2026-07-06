// Original flat-style SVG illustrations for a few iconic cards. These are our
// own vector art (no copyrighted material) embedded as data URIs. Drop more
// entries here to illustrate additional cards; PlayingCard uses them via
// CARD_IMAGE when present, else falls back to the emoji icon.

const svg = (inner: string) =>
  "data:image/svg+xml," +
  encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 96'>${inner}</svg>`);

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
  // Bullet whizzing past + a green dodge arc.
  missed: svg(
    `<g stroke='#8a8f98' stroke-width='4' stroke-linecap='round'>
       <line x1='16' y1='40' x2='32' y2='40'/><line x1='20' y1='54' x2='36' y2='54'/>
     </g>
     <ellipse cx='52' cy='47' rx='13' ry='8' fill='#caa15a' stroke='#7a4a12' stroke-width='2'/>
     <path d='M72 26 q26 10 16 46' fill='none' stroke='#2ecc71' stroke-width='6' stroke-linecap='round'/>
     <path d='M80 66 l8 8 10 -6' fill='none' stroke='#2ecc71' stroke-width='6' stroke-linecap='round'/>`
  ),
  // Frothy beer mug.
  beer: svg(
    `<rect x='38' y='32' width='42' height='50' rx='5' fill='#e8a13a' stroke='#7a4a12' stroke-width='3'/>
     <rect x='38' y='58' width='42' height='24' rx='2' fill='#d98f28'/>
     <g fill='#fff8e8' stroke='#7a4a12' stroke-width='2'>
       <circle cx='46' cy='30' r='8'/><circle cx='60' cy='24' r='10'/><circle cx='73' cy='30' r='8'/>
       <rect x='36' y='30' width='46' height='8' rx='4'/>
     </g>
     <path d='M80 42 h12 a9 9 0 0 1 9 9 v8 a9 9 0 0 1 -9 9 h-12' fill='none' stroke='#7a4a12' stroke-width='5'/>`
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
  // Wooden barrel with hoops and staves.
  barrel: svg(
    `<path d='M42 26 q18 -6 36 0 l5 44 q-23 8 -46 0 z' fill='#b5763a' stroke='#5a3312' stroke-width='3'/>
     <g stroke='#7a4a12' stroke-width='2' opacity='0.6'>
       <line x1='54' y1='24' x2='53' y2='74'/><line x1='63' y1='22' x2='63' y2='76'/><line x1='72' y1='24' x2='73' y2='74'/>
     </g>
     <rect x='39' y='36' width='46' height='7' fill='#4a2b0e'/>
     <rect x='38' y='58' width='48' height='7' fill='#4a2b0e'/>`
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
};
