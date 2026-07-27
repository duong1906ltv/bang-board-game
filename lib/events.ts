// Random events ("sự kiện ngẫu nhiên") — the house layer on top of Bang!'s rules.
//
// ONE event fires at the start of each round, i.e. when play comes back round to
// the Sheriff. It is the weather for that round and it applies to EVERYONE; there
// are no per-player-turn events. A round-long effect therefore never outlives the
// round that rolled it, so events can't stack or overlap.
//
// Design: every event is DATA. The engine never branches on an event id; it reads
// a merged `EventEffect` at a handful of fixed checkpoints (see `effectFor` users
// in game.ts). Adding an event means adding one entry to `EVENTS` — no engine
// change. Effects that cannot be expressed declaratively (swapping hands, passing
// guns around the table) get an `onFire` hook which may only touch the narrow
// `EventCtx` primitives the engine hands it, so that damage always flows through
// applyDamage (character abilities + win check stay correct).
//
// Event damage is deliberately UNSAVEABLE (like Dynamite): Beer cannot cancel it.
// That keeps every event fully synchronous — an event can never leave the table
// waiting on a reaction that nothing would resume.

import type { CardKind } from "./cards";
import type { Player } from "./game";

// How long the event's effect sticks around:
//  - instant : fires once via onFire, keeps no modifier
//  - lasting : table-wide modifier for the rest of the round
//  - curse   : attached to ONE player for `rounds` rounds
export type EventScope = "instant" | "lasting" | "curse";

// Everything the engine can be told to do declaratively. All fields optional.
// Unless noted, a field applies to EVERY player for the duration of the round.
export interface EventEffect {
  // --- hard blocks ---
  noBang?: boolean; // nobody may play Bang!
  bangLimit?: number; // override the Bang!/turn budget (0 = none, 99 = unlimited)
  bannedDefIds?: string[]; // these card types cannot be played
  bannedKinds?: CardKind[]; // whole categories cannot be played
  maxPlays?: number; // cards playable per turn
  noHeal?: boolean; // Beer / Saloon / Sid cannot restore life
  noDamage?: boolean; // ceasefire: damage is nullified
  skipTurn?: boolean; // CURSE ONLY — a table-wide skip would stall the game
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
  damageDelta?: number; // ± every hit dealt
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
//
// NOTE: `opener` is whoever starts the round — in practice always the Sheriff,
// since the game ends the moment the Sheriff dies. So no event may single out the
// opener for harm, or it would only ever punish the Sheriff.
export interface EventCtx {
  opener: Player;
  alive(): Player[]; // living players, seat order
  others(): Player[]; // living players except the opener
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
  scope: EventScope;
  weight: number; // relative draw probability within the eligible pool
  rounds?: number; // curse duration in ROUNDS (default 1); lasting is always 1
  minAlive?: number; // only eligible with at least this many players alive
  maxAlive?: number; // only eligible with at most this many alive
  // Curse target selection. "any" includes the round opener on purpose — leaving
  // the Sheriff out would make them permanently un-cursable.
  target?: "any" | "lowestHp" | "mostCards";
  effect?: EventEffect;
  onFire?: (ctx: EventCtx) => void;
}

// ─── Registry ────────────────────────────────────────────────────────────────
// Names and descriptions live in lib/i18n.ts (keyed by id), following the same
// pattern as characters and cards. Only mechanics live here.

export const EVENTS: GameEventDef[] = [
  // ── Cấm đoán · cả bàn, hết vòng ───────────────────────────────────────────
  { id: "jammed-gun", emoji: "🔧", scope: "lasting", weight: 7,
    effect: { noBang: true } },
  { id: "short-barrel", emoji: "📏", scope: "lasting", weight: 7,
    effect: { rangeOverride: 1 } },
  { id: "prohibition", emoji: "🚫", scope: "lasting", weight: 6,
    effect: { bannedDefIds: ["beer", "saloon"], noHeal: true } },
  { id: "fasting", emoji: "🍽️", scope: "lasting", weight: 6,
    effect: { bannedDefIds: ["stagecoach", "wells-fargo", "general-store"] } },
  { id: "tied-hands", emoji: "⛓️", scope: "lasting", weight: 6,
    effect: { bannedKinds: ["blue", "gun"] } },
  { id: "silence", emoji: "🤫", scope: "lasting", weight: 5,
    effect: { bannedDefIds: ["gatling", "indians", "duel"] } },
  { id: "no-looting", emoji: "🧤", scope: "lasting", weight: 6,
    effect: { bannedDefIds: ["panic", "cat-balou"] } },
  { id: "drought", emoji: "🌵", scope: "lasting", weight: 6,
    effect: { handLimitDelta: -1 } },
  { id: "clumsy-hands", emoji: "🤕", scope: "lasting", weight: 5,
    effect: { maxPlays: 1 } },
  { id: "ceasefire", emoji: "🕊️", scope: "lasting", weight: 4,
    effect: { noDamage: true } },
  { id: "empty-pockets", emoji: "💸", scope: "lasting", weight: 5,
    effect: { drawCount: 1 } },
  { id: "survival", emoji: "🏥", scope: "lasting", weight: 5,
    effect: { noHeal: true } },
  { id: "truce", emoji: "🤝", scope: "lasting", weight: 5, minAlive: 5,
    effect: { protectSheriff: true } },

  // ── Tăng cường · cả bàn, hết vòng ─────────────────────────────────────────
  { id: "hot-streak", emoji: "🔥", scope: "lasting", weight: 6,
    effect: { bangLimit: 99 } },
  { id: "gun-oil", emoji: "🛢️", scope: "lasting", weight: 6,
    effect: { bangLimit: 2 } },
  { id: "eagle-eye", emoji: "🦅", scope: "lasting", weight: 7,
    effect: { rangeDelta: 1 } },
  { id: "sniper-nest", emoji: "🏔️", scope: "lasting", weight: 3, minAlive: 5,
    effect: { rangeOverride: 99 } },
  { id: "gold-rush", emoji: "💎", scope: "lasting", weight: 6,
    effect: { extraDraw: 1 } },
  { id: "card-rain", emoji: "🃏", scope: "lasting", weight: 6,
    effect: { drawCount: 3 } },
  { id: "frenzy", emoji: "🌀", scope: "lasting", weight: 5,
    effect: { ignoreOncePerTurn: true } },
  { id: "happy-hour", emoji: "🍺", scope: "lasting", weight: 6,
    effect: { beerHeal: 2 } },

  // ── Thời tiết · cả bàn, hết vòng ──────────────────────────────────────────
  { id: "sandstorm", emoji: "🌪️", scope: "lasting", weight: 6,
    effect: { missedNeededDelta: 1 } },
  { id: "fog", emoji: "🌫️", scope: "lasting", weight: 5, maxAlive: 5,
    effect: { distanceDelta: 1 } },
  { id: "open-plains", emoji: "🔭", scope: "lasting", weight: 6,
    effect: { distanceDelta: -1 } },
  { id: "wartime", emoji: "⚔️", scope: "lasting", weight: 5, maxAlive: 5,
    effect: { damageDelta: 1 } },
  { id: "bad-weather", emoji: "🌧️", scope: "lasting", weight: 5,
    effect: { badDraw: true } },
  { id: "lucky-table", emoji: "🎲", scope: "lasting", weight: 5,
    effect: { luckyDraw: true } },
  { id: "drunk-table", emoji: "🥴", scope: "lasting", weight: 5,
    effect: { drunkAim: true } },

  // ── Trừng phạt · nổ một lần ───────────────────────────────────────────────
  { id: "plague", emoji: "🦠", scope: "instant", weight: 6, minAlive: 4,
    onFire: (c) => c.damageAll(1, { onlyAbove: 1 }) },
  { id: "stampede", emoji: "🐂", scope: "instant", weight: 7,
    onFire: (c) => { const [p] = c.randomAlive(1); if (p) c.damage(p, 1); } },
  { id: "toll", emoji: "💰", scope: "instant", weight: 7,
    onFire: (c) => c.discardAllRandom(1) },
  { id: "inspection", emoji: "🕵️", scope: "instant", weight: 6,
    onFire: (c) => { const p = c.mostCards(); if (p) c.trimToLimit(p); } },
  { id: "night-thief", emoji: "🥷", scope: "instant", weight: 7,
    onFire: (c) => { const [p] = c.randomAlive(1); if (p) c.discardRandom(p, 1); } },
  { id: "strong-wind", emoji: "🌬️", scope: "instant", weight: 5,
    onFire: (c) => c.passDynamiteAround() },
  { id: "wet-fuse", emoji: "💧", scope: "instant", weight: 4,
    onFire: (c) => c.clearEquip("dynamite") },
  { id: "jailbreak", emoji: "🗝️", scope: "instant", weight: 5,
    onFire: (c) => c.clearEquip("jail") },

  // ── Phúc lợi · nổ một lần ─────────────────────────────────────────────────
  { id: "healing-spring", emoji: "⛲", scope: "instant", weight: 7,
    onFire: (c) => c.healAll(1) },
  { id: "supply-drop", emoji: "📦", scope: "instant", weight: 8,
    onFire: (c) => c.drawAll(1) },
  { id: "divine-favor", emoji: "🙏", scope: "instant", weight: 6,
    onFire: (c) => { const p = c.lowestHp(); if (p) c.heal(p, 2); } },
  { id: "flea-market", emoji: "🛒", scope: "instant", weight: 6,
    onFire: (c) => c.generalStore() },
  { id: "reshuffle", emoji: "♻️", scope: "instant", weight: 4,
    onFire: (c) => c.reshuffleDiscard() },

  // ── Hỗn loạn · nổ một lần ─────────────────────────────────────────────────
  { id: "musical-chairs", emoji: "🪑", scope: "instant", weight: 6, minAlive: 5,
    onFire: (c) => { const [a, b] = c.randomAlive(2); if (a && b) c.swapSeats(a, b); } },
  { id: "hand-swap", emoji: "🔄", scope: "instant", weight: 5, minAlive: 4,
    onFire: (c) => { const [a, b] = c.randomAlive(2); if (a && b) c.swapHands(a, b); } },
  { id: "pass-the-hand", emoji: "👐", scope: "instant", weight: 5, minAlive: 4,
    onFire: (c) => c.passHandsAround() },
  { id: "gun-shuffle", emoji: "🔫", scope: "instant", weight: 5, minAlive: 4,
    onFire: (c) => c.passGunsAround() },
  { id: "reverse", emoji: "↩️", scope: "instant", weight: 5, minAlive: 4,
    onFire: (c) => c.reverseOrder() },
  { id: "role-leak", emoji: "🎭", scope: "instant", weight: 5, minAlive: 4,
    onFire: (c) => { const [p] = c.randomOthers(1); if (p) c.revealRole(p); } },

  // ── Lời nguyền · nhắm một người ───────────────────────────────────────────
  { id: "shackled", emoji: "🔗", scope: "curse", weight: 6, rounds: 1, target: "any",
    effect: { noBang: true } },
  { id: "oversleep", emoji: "😴", scope: "curse", weight: 4, rounds: 1, target: "any",
    effect: { skipTurn: true } },
  { id: "marked-man", emoji: "🩸", scope: "curse", weight: 5, rounds: 2, target: "any",
    effect: { incomingDamageDelta: 1 } },
  { id: "wanted", emoji: "💵", scope: "curse", weight: 5, rounds: 2, target: "any",
    effect: { bounty: true } },
  { id: "guardian-angel", emoji: "✨", scope: "curse", weight: 4, rounds: 1, target: "lowestHp",
    effect: { immune: true } },
];

export const EVENT_BY_ID: Record<string, GameEventDef> = Object.fromEntries(
  EVENTS.map((e) => [e.id, e])
);

// ─── Frequency ───────────────────────────────────────────────────────────────

// Exactly one event per round is the whole model, so frequency is not a dial:
// fewer than one leaves rounds inexplicably blank, and more than one stacks two
// rule changes on the same round, which is both unreadable at the table and no
// longer "this round's weather". Hence a plain on/off switch.
export type EventLevel = "off" | "on";
export const EVENT_LEVELS: EventLevel[] = ["off", "on"];

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

// Eligible events for one roll: headcount range, and not one of the recently
// fired ids (so the same event doesn't come up twice in a row).
export function eligible(aliveCount: number, recent: string[]): GameEventDef[] {
  return EVENTS.filter(
    (e) =>
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
