// Random events ("sự kiện ngẫu nhiên") — the house layer on top of Bang!'s rules.
//
// Design: every event is DATA. The engine never branches on an event id; it reads
// a merged `EventEffect` at a handful of fixed checkpoints (see `effectFor` users
// in game.ts). Adding an event means adding one entry to `EVENTS` — no engine
// change. Effects that cannot be expressed declaratively (swapping hands, passing
// guns around the table) get an `onFire` hook which may only touch the narrow
// `EventCtx` primitives the engine hands it, so that damage always flows through
// applyDamage (character abilities + win check stay correct).
//
// Two independent schedulers ("luồng"), see game.ts:
//   • track "turn"  — rolled at the start of every player's turn, from a bag
//                     randomizer so events neither clump nor go missing.
//   • track "table" — rolled once per round (when the turn returns to the round
//                     opener), affects everyone, with a minimum turn gap.
//
// Event damage is deliberately UNSAVEABLE (like Dynamite): Beer cannot cancel it.
// That keeps every event fully synchronous — an event can never leave the table
// waiting on a reaction that nothing would resume.

import type { CardKind } from "./cards";
import type { Player } from "./game";

// Which scheduler rolls this event.
export type EventTrack = "turn" | "table";

// How long the event's effect sticks around:
//  - turn    : the active player's turn only
//  - curse   : attached to ONE player for N of their turns
//  - instant : fires once via onFire, keeps no modifier
//  - lasting : table-wide modifier for N turns
export type EventScope = "turn" | "curse" | "instant" | "lasting";

// Everything the engine can be told to do declaratively. All fields optional;
// several events combine (a turn event + a lasting table event + a curse).
export interface EventEffect {
  // --- hard blocks ---
  noBang?: boolean; // may not play Bang! at all
  bangLimit?: number; // override Bang!/turn budget (0 = none, 99 = unlimited)
  bannedDefIds?: string[]; // these card types cannot be played
  bannedKinds?: CardKind[]; // whole categories cannot be played
  maxPlays?: number; // total cards playable this turn
  noHeal?: boolean; // Beer / Saloon / Sid cannot restore life
  noDamage?: boolean; // ceasefire: damage is nullified
  skipTurn?: boolean; // the turn is forfeited outright
  immune?: boolean; // (curse) this player takes no damage
  protectSheriff?: boolean; // the Sheriff cannot be targeted by Bang!/Duel
  bounty?: boolean; // (curse) whoever kills this player draws 3

  // --- numeric tweaks ---
  rangeDelta?: number;
  rangeOverride?: number;
  distanceDelta?: number; // everyone sees everyone ±N
  drawCount?: number; // override the draw-phase card count
  extraDraw?: number; // add to the draw-phase card count
  handLimitDelta?: number; // ± end-of-turn hand limit
  damageDelta?: number; // ± every hit dealt this turn / round
  incomingDamageDelta?: number; // (curse) ± damage this player receives
  missedNeededDelta?: number; // ± Missed! required to dodge a Bang!
  beerHeal?: number; // how much life a Beer restores

  // --- rule swaps ---
  ignoreOncePerTurn?: boolean; // suspend the "each card type once per turn" house rule
  luckyDraw?: boolean; // every Draw! flips 2 and keeps the better one
  badDraw?: boolean; // every Draw! flips 2 and keeps the worse one
  drunkAim?: boolean; // Bang! hits a random valid target instead of the chosen one
}

// The primitives an `onFire` event may use. Deliberately narrow: no direct access
// to the Room, so an event can't bypass applyDamage / checkWin / the log.
export interface EventCtx {
  current: Player; // whose turn it is right now
  alive(): Player[]; // living players, seat order
  others(): Player[]; // living players except `current`
  randomAlive(n: number): Player[];
  randomOthers(n: number): Player[];
  lowestHp(): Player | null;
  mostCards(): Player | null;

  damage(p: Player, n: number): void; // unsaveable, routed through applyDamage
  damageAll(n: number, opts?: { onlyAbove?: number }): void;
  heal(p: Player, n: number): void;
  healAll(n: number): void;
  draw(p: Player, n: number): void;
  drawAll(n: number): void;
  discardRandom(p: Player, n: number): void;
  discardAllRandom(n: number): void;
  trimToLimit(p: Player): void;
  stealRandom(from: Player, to: Player, n: number): void;

  swapHands(a: Player, b: Player): void;
  swapSeats(a: Player, b: Player): void;
  passHandsAround(): void;
  passGunsAround(): void;
  passDynamiteAround(): void;
  clearEquip(defId: string): number; // remove every copy in play, return how many
  reshuffleDiscard(): void;
  reverseOrder(): void;
  revealRole(p: Player): void;
  generalStore(): void; // open a free General Store pick round
}

export interface GameEventDef {
  id: string;
  emoji: string;
  track: EventTrack;
  scope: EventScope;
  weight: number; // relative draw probability within the eligible pool
  turns?: number; // lasting / curse duration, in turns
  minAlive?: number; // only eligible with at least this many players alive
  maxAlive?: number; // only eligible with at most this many alive
  // Curse target selection. "other" = anyone but the active player.
  target?: "current" | "other" | "lowestHp" | "mostCards";
  effect?: EventEffect;
  onFire?: (ctx: EventCtx) => void;
}

// ─── Registry ────────────────────────────────────────────────────────────────
// Names and descriptions live in lib/i18n.ts (keyed by id), following the same
// pattern as characters and cards. Only mechanics live here.

export const EVENTS: GameEventDef[] = [
  // ── Luồng LƯỢT · hạn chế ───────────────────────────────────────────────────
  { id: "jammed-gun", emoji: "🔧", track: "turn", scope: "turn", weight: 10,
    effect: { noBang: true } },
  { id: "clumsy-hand", emoji: "🤕", track: "turn", scope: "turn", weight: 7,
    effect: { maxPlays: 1 } },
  { id: "prohibition", emoji: "🚫", track: "turn", scope: "turn", weight: 7,
    effect: { bannedDefIds: ["beer", "saloon"], noHeal: true } },
  { id: "short-barrel", emoji: "📏", track: "turn", scope: "turn", weight: 8,
    effect: { rangeOverride: 1 } },
  { id: "fasting", emoji: "🍽️", track: "turn", scope: "turn", weight: 6,
    effect: { bannedDefIds: ["stagecoach", "wells-fargo", "general-store"] } },
  { id: "tied-hands", emoji: "⛓️", track: "turn", scope: "turn", weight: 6,
    effect: { bannedKinds: ["blue", "gun"] } },
  { id: "silence", emoji: "🤫", track: "turn", scope: "turn", weight: 5,
    effect: { bannedDefIds: ["gatling", "indians", "duel"] } },
  { id: "no-looting", emoji: "🧤", track: "turn", scope: "turn", weight: 6,
    effect: { bannedDefIds: ["panic", "cat-balou"] } },
  { id: "drought", emoji: "🌵", track: "turn", scope: "turn", weight: 7,
    effect: { handLimitDelta: -1 } },
  { id: "ceasefire", emoji: "🕊️", track: "turn", scope: "turn", weight: 4,
    effect: { noDamage: true } },
  { id: "oversleep", emoji: "😴", track: "turn", scope: "turn", weight: 3,
    effect: { skipTurn: true } },
  { id: "empty-pockets", emoji: "💸", track: "turn", scope: "turn", weight: 5,
    effect: { drawCount: 1 } },
  { id: "drunk", emoji: "🥴", track: "turn", scope: "turn", weight: 5,
    effect: { drunkAim: true } },
  { id: "hangover", emoji: "🥃", track: "turn", scope: "turn", weight: 3,
    effect: { noBang: true, handLimitDelta: -1 } },

  // ── Luồng LƯỢT · tăng cường ────────────────────────────────────────────────
  { id: "hot-streak", emoji: "🔥", track: "turn", scope: "turn", weight: 7,
    effect: { bangLimit: 99 } },
  { id: "gun-oil", emoji: "🛢️", track: "turn", scope: "turn", weight: 7,
    effect: { bangLimit: 2 } },
  { id: "piercing-round", emoji: "💥", track: "turn", scope: "turn", weight: 5,
    effect: { damageDelta: 1 } },
  { id: "eagle-eye", emoji: "🦅", track: "turn", scope: "turn", weight: 8,
    effect: { rangeDelta: 1 } },
  { id: "sniper-nest", emoji: "🏔️", track: "turn", scope: "turn", weight: 3,
    minAlive: 5, effect: { rangeOverride: 99 } },
  { id: "card-rain", emoji: "🃏", track: "turn", scope: "turn", weight: 8,
    effect: { drawCount: 3 } },
  { id: "frenzy", emoji: "🌀", track: "turn", scope: "turn", weight: 6,
    effect: { ignoreOncePerTurn: true } },
  { id: "dead-eye", emoji: "🎯", track: "turn", scope: "turn", weight: 5,
    effect: { missedNeededDelta: 1 } },
  { id: "lucky-hand", emoji: "🍀", track: "turn", scope: "turn", weight: 5,
    effect: { luckyDraw: true } },
  { id: "private-supply", emoji: "🧰", track: "turn", scope: "instant", weight: 6,
    onFire: (c) => c.draw(c.current, 2) },
  { id: "sleight-of-hand", emoji: "🎩", track: "turn", scope: "instant", weight: 5,
    onFire: (c) => {
      const [victim] = c.randomOthers(1);
      if (victim) c.stealRandom(victim, c.current, 1);
    } },
  { id: "second-wind", emoji: "🌬️", track: "turn", scope: "instant", weight: 5,
    onFire: (c) => c.heal(c.current, 1) },

  // ── Luồng LƯỢT · lời nguyền nhắm một người ────────────────────────────────
  { id: "shackled", emoji: "🔗", track: "turn", scope: "curse", weight: 6,
    turns: 1, target: "other", effect: { noBang: true } },
  { id: "marked-man", emoji: "🩸", track: "turn", scope: "curse", weight: 5,
    turns: 2, target: "other", effect: { incomingDamageDelta: 1 } },
  { id: "guardian-angel", emoji: "✨", track: "turn", scope: "curse", weight: 4,
    turns: 1, target: "lowestHp", effect: { immune: true } },
  { id: "wanted", emoji: "💵", track: "turn", scope: "curse", weight: 4,
    turns: 3, target: "other", effect: { bounty: true } },

  // ── Luồng BÀN · trừng phạt ────────────────────────────────────────────────
  { id: "cave-in", emoji: "⛏️", track: "table", scope: "instant", weight: 7,
    onFire: (c) => c.damage(c.current, 1) },
  { id: "plague", emoji: "🦠", track: "table", scope: "instant", weight: 6,
    minAlive: 4, onFire: (c) => c.damageAll(1, { onlyAbove: 1 }) },
  { id: "stampede", emoji: "🐂", track: "table", scope: "instant", weight: 7,
    onFire: (c) => { const [p] = c.randomAlive(1); if (p) c.damage(p, 1); } },
  { id: "toll", emoji: "💰", track: "table", scope: "instant", weight: 7,
    onFire: (c) => c.discardAllRandom(1) },
  { id: "inspection", emoji: "🕵️", track: "table", scope: "instant", weight: 6,
    onFire: (c) => { const p = c.mostCards(); if (p) c.trimToLimit(p); } },
  { id: "night-thief", emoji: "🥷", track: "table", scope: "instant", weight: 7,
    onFire: (c) => { const [p] = c.randomAlive(1); if (p) c.discardRandom(p, 1); } },
  { id: "strong-wind", emoji: "🌬️", track: "table", scope: "instant", weight: 5,
    onFire: (c) => c.passDynamiteAround() },
  { id: "wet-fuse", emoji: "💧", track: "table", scope: "instant", weight: 4,
    onFire: (c) => c.clearEquip("dynamite") },
  { id: "jailbreak", emoji: "🗝️", track: "table", scope: "instant", weight: 5,
    onFire: (c) => c.clearEquip("jail") },

  // ── Luồng BÀN · phúc lợi ──────────────────────────────────────────────────
  { id: "healing-spring", emoji: "⛲", track: "table", scope: "instant", weight: 7,
    onFire: (c) => c.healAll(1) },
  { id: "supply-drop", emoji: "📦", track: "table", scope: "instant", weight: 8,
    onFire: (c) => c.drawAll(1) },
  { id: "divine-favor", emoji: "🙏", track: "table", scope: "instant", weight: 6,
    onFire: (c) => { const p = c.lowestHp(); if (p) c.heal(p, 2); } },
  { id: "flea-market", emoji: "🛒", track: "table", scope: "instant", weight: 6,
    onFire: (c) => c.generalStore() },
  { id: "reshuffle", emoji: "♻️", track: "table", scope: "instant", weight: 4,
    onFire: (c) => c.reshuffleDiscard() },

  // ── Luồng BÀN · hỗn loạn ──────────────────────────────────────────────────
  { id: "musical-chairs", emoji: "🪑", track: "table", scope: "instant", weight: 6,
    minAlive: 5, onFire: (c) => { const [a, b] = c.randomAlive(2); if (a && b) c.swapSeats(a, b); } },
  { id: "hand-swap", emoji: "🔄", track: "table", scope: "instant", weight: 5,
    minAlive: 4, onFire: (c) => { const [a, b] = c.randomAlive(2); if (a && b) c.swapHands(a, b); } },
  { id: "pass-the-hand", emoji: "👐", track: "table", scope: "instant", weight: 5,
    minAlive: 4, onFire: (c) => c.passHandsAround() },
  { id: "gun-shuffle", emoji: "🔫", track: "table", scope: "instant", weight: 5,
    minAlive: 4, onFire: (c) => c.passGunsAround() },
  { id: "reverse", emoji: "↩️", track: "table", scope: "instant", weight: 5,
    minAlive: 4, onFire: (c) => c.reverseOrder() },
  { id: "role-leak", emoji: "🎭", track: "table", scope: "instant", weight: 5,
    minAlive: 4, onFire: (c) => { const [p] = c.randomOthers(1); if (p) c.revealRole(p); } },

  // ── Luồng BÀN · toàn cục kéo dài ──────────────────────────────────────────
  { id: "sandstorm", emoji: "🌪️", track: "table", scope: "lasting", weight: 6,
    turns: 3, effect: { missedNeededDelta: 1 } },
  { id: "fog", emoji: "🌫️", track: "table", scope: "lasting", weight: 5,
    turns: 3, maxAlive: 5, effect: { distanceDelta: 1 } },
  { id: "open-plains", emoji: "🔭", track: "table", scope: "lasting", weight: 6,
    turns: 3, minAlive: 4, effect: { distanceDelta: -1 } },
  { id: "happy-hour", emoji: "🍺", track: "table", scope: "lasting", weight: 6,
    turns: 4, effect: { beerHeal: 2 } },
  { id: "wartime", emoji: "⚔️", track: "table", scope: "lasting", weight: 5,
    turns: 3, maxAlive: 5, effect: { damageDelta: 1 } },
  { id: "survival", emoji: "🏥", track: "table", scope: "lasting", weight: 5,
    turns: 3, effect: { noHeal: true } },
  { id: "bad-weather", emoji: "🌧️", track: "table", scope: "lasting", weight: 5,
    turns: 3, effect: { badDraw: true } },
  { id: "lucky-table", emoji: "🎲", track: "table", scope: "lasting", weight: 5,
    turns: 3, effect: { luckyDraw: true } },
  { id: "truce", emoji: "🤝", track: "table", scope: "lasting", weight: 5,
    turns: 3, minAlive: 5, effect: { protectSheriff: true } },
  { id: "gold-rush", emoji: "💎", track: "table", scope: "lasting", weight: 5,
    turns: 3, effect: { extraDraw: 1 } },
];

export const EVENT_BY_ID: Record<string, GameEventDef> = Object.fromEntries(
  EVENTS.map((e) => [e.id, e])
);

// ─── Frequency ───────────────────────────────────────────────────────────────

export type EventLevel = "off" | "low" | "normal" | "high" | "mayhem";
export const EVENT_LEVELS: EventLevel[] = ["off", "low", "normal", "high", "mayhem"];

// Bag randomizer: BAG_SIZE turn slots, of which N carry an event. Shuffled per
// bag, so events neither clump into a streak nor vanish for a dozen turns the
// way independent per-turn coin flips do.
//
// "mayhem" fills every slot: EVERY player opens their turn with an event of their
// own. At that density the bag stops mattering (there is nothing left to
// distribute) and the only thing keeping variety is the recently-fired exclusion
// window — see `eligible`.
export const BAG_SIZE = 5;
export const BAG_TOKENS: Record<EventLevel, number> = {
  off: 0, low: 1, normal: 2, high: 4, mayhem: BAG_SIZE,
};

// Minimum turns between two TABLE events. Larger than a short round on purpose:
// at 3 players alive a table event lands every other round instead of every one.
// A table event still only fires on a round boundary, so at a full 7-player table
// every level above "low" comes out to one per round regardless.
export const TABLE_GAP: Record<EventLevel, number> = {
  off: Number.POSITIVE_INFINITY,
  low: 6,
  normal: 4,
  high: 3,
  mayhem: 2,
};

// ─── Effect merging ──────────────────────────────────────────────────────────

// Numeric fields that ADD when several active events set them.
const SUM_FIELDS = [
  "rangeDelta", "distanceDelta", "extraDraw", "handLimitDelta",
  "damageDelta", "incomingDamageDelta", "missedNeededDelta",
] as const;
// Numeric fields where the SMALLEST value wins (the most restrictive).
const MIN_FIELDS = ["maxPlays", "drawCount", "bangLimit"] as const;
// Numeric fields where the LARGEST value wins (the most generous).
const MAX_FIELDS = ["rangeOverride", "beerHeal"] as const;
const FLAG_FIELDS = [
  "noBang", "noHeal", "noDamage", "skipTurn", "immune", "protectSheriff",
  "bounty", "ignoreOncePerTurn", "luckyDraw", "badDraw", "drunkAim",
] as const;

// Fold `add` into `into`. Order-independent for every field type above.
export function mergeEffect(into: EventEffect, add: EventEffect | undefined): EventEffect {
  if (!add) return into;
  for (const f of FLAG_FIELDS) if (add[f]) into[f] = true;
  for (const f of SUM_FIELDS) if (add[f] != null) into[f] = (into[f] ?? 0) + add[f]!;
  for (const f of MIN_FIELDS) if (add[f] != null) into[f] = into[f] == null ? add[f] : Math.min(into[f]!, add[f]!);
  for (const f of MAX_FIELDS) if (add[f] != null) into[f] = into[f] == null ? add[f] : Math.max(into[f]!, add[f]!);
  if (add.bannedDefIds) into.bannedDefIds = [...(into.bannedDefIds ?? []), ...add.bannedDefIds];
  if (add.bannedKinds) into.bannedKinds = [...(into.bannedKinds ?? []), ...add.bannedKinds];
  return into;
}

// ─── Pool selection ──────────────────────────────────────────────────────────

// Eligible events for one roll: right track, headcount range, and not one of the
// recently-fired ids (so the same event doesn't come up twice in a row).
export function eligible(track: EventTrack, aliveCount: number, recent: string[]): GameEventDef[] {
  return EVENTS.filter(
    (e) =>
      e.track === track &&
      !recent.includes(e.id) &&
      (e.minAlive == null || aliveCount >= e.minAlive) &&
      (e.maxAlive == null || aliveCount <= e.maxAlive)
  );
}

// Weighted pick. `rand` is injected so the engine keeps a single source of
// randomness (and tests can make a roll deterministic).
export function pickWeighted(pool: GameEventDef[], rand: () => number): GameEventDef | null {
  const total = pool.reduce((s, e) => s + e.weight, 0);
  if (total <= 0) return null;
  let r = rand() * total;
  for (const e of pool) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return pool[pool.length - 1] ?? null;
}
