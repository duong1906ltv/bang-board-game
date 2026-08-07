// Who is sitting in each chair. Seven CC0 bodies from the same Quaternius pack the
// original single figure came from — verified by hash: the pack's fourth man IS
// cowboy.glb, byte for byte.
//
// The reason this is cheap rather than a rewrite of Avatars.tsx: all seven share ONE
// skeleton. Comparing bind poses joint by joint, the largest disagreement anywhere in
// the rig is 0.0015 units at Torso, which is under a tenth of a millimetre once the
// figure is scaled to the table. So every measurement in Avatars.tsx — head height,
// hip height, where the stool top has to be, how big the fist is, where the fan of
// cards is carried, the arm's reach — was measured once and is still exact for all of
// them. Nothing here needs re-measuring.
//
// The clips are shared for the same reason: an AnimationClip binds to bones by NAME, so
// one authored against this skeleton drives any body wearing it. Only two files carry
// animation; the other five were stripped of theirs, which was 55% of their bytes.
import { useGLTF } from "@react-three/drei";
import { CHARACTERS, type Look } from "@/lib/types";

export interface PersonSpec {
  url: string; // the skinned mesh
  clips: string; // the file its animation comes from, which is usually not the same file
  headY: number; // head bone height once seated, in model units — see MAN / WOMAN below
  handScale: number; // how much the gun fist is taken in — see HAND_SCALE in Avatars.tsx
  shirt: string; // material carrying the player colour — the one thing that must stay unique
}

// The two clip carriers. Men and women get different clips on purpose: the sitting
// animations are genuinely different motions, not one retargeted (18 of 24 channels
// differ), so the women sit differently rather than sitting like men.
//
// And the one number that is NOT shared. Both clips settle by t=0.50 and hold, and both
// leave the hip at exactly 1.102 — so the two families sit at the same depth on the same
// stool. But the men's head settles at 3.401 and the women's at 3.246, with the shoulder
// following it down (2.962 against 2.808). They are shorter people, not differently
// seated ones, and Avatars.tsx scales each figure by this to land its head on the anchor
// every nameplate and crosshair in the scene is written against.
//
// The skin differs in one more place, and only one: the male meshes carry a chunkier
// right hand than left (0.0025 raw against 0.0017), the female meshes are even at 0.0017.
// The skull is within 0.8% once the scaling above is applied, so the hat is unaffected.
const MAN = { clips: "/models/cowboy.glb", headY: 3.401, handScale: 0.85 };
const WOMAN = { clips: "/models/woman-dress.glb", headY: 3.246, handScale: 1 };

const MEN: PersonSpec[] = [
  { ...MAN, url: MAN.clips, shirt: "Shirt" },
  { ...MAN, url: "/models/man-work.glb", shirt: "Shirt" },
  // Two-tone: "Shirt" is the body, "Shirt2" the vest over it, and only the first is
  // tinted so the model keeps an accent of its own.
  { ...MAN, url: "/models/man-vest.glb", shirt: "Shirt" },
  { ...MAN, url: "/models/man-suit.glb", shirt: "Shirt" },
];

const WOMEN: PersonSpec[] = [
  { ...WOMAN, url: WOMAN.clips, shirt: "Dress" },
  { ...WOMAN, url: "/models/woman-shirt.glb", shirt: "Shirt" },
  { ...WOMAN, url: "/models/woman-jeans.glb", shirt: "Shirt" },
];

const ALL = [...MEN, ...WOMEN];

// Bang!'s three women, and the reason the split is 4/3 rather than an even 7: the game
// has exactly this many.
const FEMALE = new Set(["calamity-janet", "rose-doolan", "suzy-lafayette"]);

// Round-robin down the character list rather than hashing the id. A hash looks tidier
// and is worse at this size: the best multiplier tried spread the 13 men 5/1/4/3 and
// the 3 women 2/1/0 — one body carried five characters while another was in the game
// files and reachable by nobody. Dealing them out in order is exactly even (4/3/3/3 and
// 1/1/1), stays even when a character is added, and is just as stable per character.
const BY_CHARACTER = new Map<string, PersonSpec>();
{
  let m = 0;
  let w = 0;
  for (const c of CHARACTERS) {
    const female = FEMALE.has(c.id);
    BY_CHARACTER.set(c.id, female ? WOMEN[w++ % WOMEN.length] : MEN[m++ % MEN.length]);
  }
}

// Keyed on the character, never on the seat, so Slab the Killer is the same man in
// every game instead of whoever happens to sit third. Before the draft resolves there
// is no character to key on, and the seat stands in — over the whole cast, so a table
// waiting to start already looks like a mixed table.
//
// A player who picked at the name box overrides all of that, including Bang!'s own
// casting: choose to be a woman and draw Slab the Killer and you are a woman playing
// Slab the Killer. That is the point of asking. Within the chosen pool the character
// still decides WHICH body, so the answer stays stable from game to game — and the seat
// keeps the choice from collapsing to one figure before the draft resolves.
export function personFor(characterId: string | null | undefined, seat: number, look?: Look): PersonSpec {
  const pool = look === "m" ? MEN : look === "f" ? WOMEN : null;
  if (pool) {
    const i = characterId ? Math.abs(CHARACTERS.findIndex((c) => c.id === characterId)) : seat;
    return pool[i % pool.length];
  }
  return (characterId && BY_CHARACTER.get(characterId)) || ALL[seat % ALL.length];
}

// Same lesson as the guns and the bottles: a file that has not loaded suspends whoever
// asked for it, and here that tears down a seated figure mid-game. Any of the seven can
// be dealt to any table, so there is nothing to be gained by waiting to find out which.
if (typeof window !== "undefined") for (const p of new Set(ALL.flatMap((p) => [p.url, p.clips]))) useGLTF.preload(p);
