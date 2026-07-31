// Random events ("sự kiện ngẫu nhiên") — the house layer on top of Bang!'s rules.
//
// A batch of 2..4 events fires at the start of each round, i.e. when play comes back
// round to the Sheriff. They are the weather for that round and they apply to
// EVERYONE, without exception: there are no per-player events, no curses, and nothing
// that picks a victim. The batch is replaced wholesale next round, so effects never
// outlive the round that rolled them.
//
// Because several are in force at once, any two that would silently cancel (or whose
// result would depend on which fired first) share a `group` and can't be drawn
// together — see `pickBatch`.
//
// Design: every event is DATA. The engine never branches on an event id; it reads
// a merged `EventEffect` at a handful of fixed checkpoints (see `activeEffect` users
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
export type EventScope = "instant" | "lasting";

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
  protectSheriff?: boolean; // the Sheriff cannot be targeted by Bang!/Duel

  // --- numeric tweaks ---
  rangeDelta?: number;
  rangeOverride?: number;
  distanceDelta?: number; // everyone sees everyone ±N
  drawCount?: number; // override the draw-phase card count
  extraDraw?: number; // add to the draw-phase card count
  handLimitDelta?: number; // ± end-of-turn hand limit
  damageDelta?: number; // ± every hit dealt
  missedNeededDelta?: number; // ± Missed! required to dodge a Bang!
  beerHeal?: number; // how much life a Beer restores

  // --- rule swaps ---
  ignoreOncePerTurn?: boolean; // suspend the "each card type once per turn" house rule
  luckyDraw?: boolean; // every Draw! flips 2 and keeps the better one
  badDraw?: boolean; // every Draw! flips 2 and keeps the worse one
  drunkAim?: boolean; // Bang! hits a random valid target instead of the chosen one
}

// The primitives an `onFire` event may use. Deliberately narrow: no direct access
// to the Room, so an event can't bypass applyDamage / checkWin / the log — and no
// primitive takes a single Player, which is what structurally prevents an event
// from singling anybody out.
export interface EventCtx {
  opener: Player; // whoever opens the round — only used to order a General Store
  damageAll(n: number, opts?: { onlyAbove?: number }): void; // unsaveable, via applyDamage
  healAll(n: number): void;
  drawAll(n: number): void;
  discardAllRandom(n: number): void;
  passHandsAround(): void;
  passGunsAround(): void;
  passDynamiteAround(): void;
  clearEquip(defId: string): number; // remove every copy in play, return how many
  reshuffleDiscard(): void;
  reverseOrder(): void; // flip play direction for THIS turn only, then it reverts
  generalStore(): void; // open a free General Store pick round
}

export interface GameEventDef {
  id: string;
  emoji: string;
  scope: EventScope;
  weight: number; // relative draw probability within the eligible pool
  // Mutual-exclusion group. Several events fire together each round, so any two
  // that would silently cancel each other — or whose outcome would depend on which
  // fired first — must share a group; at most one per group is drawn per round.
  group?: string;
  minAlive?: number; // only eligible with at least this many players alive
  maxAlive?: number; // only eligible with at most this many alive
  effect?: EventEffect;
  onFire?: (ctx: EventCtx) => void;
}

// ─── Registry ────────────────────────────────────────────────────────────────
// Names and descriptions live in lib/i18n.ts (keyed by id), following the same
// pattern as characters and cards. Only mechanics live here.

export const EVENTS: GameEventDef[] = [
  // ── Restrictions · whole table, rest of the round ───────────────────────────────────────────
  { id: "jammed-gun", emoji: "🔧", scope: "lasting", weight: 7, group: "bang-budget",
    effect: { noBang: true } },
  { id: "short-barrel", emoji: "📏", scope: "lasting", weight: 7, group: "range",
    effect: { rangeOverride: 1 } },
  { id: "prohibition", emoji: "🚫", scope: "lasting", weight: 6, group: "heal",
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
  { id: "ceasefire", emoji: "🕊️", scope: "lasting", weight: 4, group: "damage",
    effect: { noDamage: true } },
  { id: "empty-pockets", emoji: "💸", scope: "lasting", weight: 5, group: "draw-count",
    effect: { drawCount: 1 } },
  { id: "survival", emoji: "🏥", scope: "lasting", weight: 5, group: "heal",
    effect: { noHeal: true } },
  { id: "truce", emoji: "🤝", scope: "lasting", weight: 5, minAlive: 5,
    effect: { protectSheriff: true } },

  // ── Buffs · whole table, rest of the round ─────────────────────────────────────────
  { id: "hot-streak", emoji: "🔥", scope: "lasting", weight: 6, group: "bang-budget",
    effect: { bangLimit: 99 } },
  { id: "gun-oil", emoji: "🛢️", scope: "lasting", weight: 6, group: "bang-budget",
    effect: { bangLimit: 2 } },
  { id: "eagle-eye", emoji: "🦅", scope: "lasting", weight: 7, group: "range",
    effect: { rangeDelta: 1 } },
  { id: "sniper-nest", emoji: "🏔️", scope: "lasting", weight: 3, group: "range", minAlive: 5,
    effect: { rangeOverride: 99 } },
  { id: "gold-rush", emoji: "💎", scope: "lasting", weight: 6, group: "draw-count",
    effect: { extraDraw: 1 } },
  { id: "card-rain", emoji: "🃏", scope: "lasting", weight: 6, group: "draw-count",
    effect: { drawCount: 3 } },
  { id: "frenzy", emoji: "🌀", scope: "lasting", weight: 5,
    effect: { ignoreOncePerTurn: true } },
  { id: "happy-hour", emoji: "🍺", scope: "lasting", weight: 6, group: "heal",
    effect: { beerHeal: 2 } },

  // ── Weather · whole table, rest of the round ──────────────────────────────────────────
  { id: "sandstorm", emoji: "🌪️", scope: "lasting", weight: 6,
    effect: { missedNeededDelta: 1 } },
  { id: "fog", emoji: "🌫️", scope: "lasting", weight: 5, group: "distance", maxAlive: 5,
    effect: { distanceDelta: 1 } },
  { id: "open-plains", emoji: "🔭", scope: "lasting", weight: 6, group: "distance",
    effect: { distanceDelta: -1 } },
  { id: "wartime", emoji: "⚔️", scope: "lasting", weight: 5, group: "damage", maxAlive: 5,
    effect: { damageDelta: 1 } },
  { id: "bad-weather", emoji: "🌧️", scope: "lasting", weight: 5, group: "draw-luck",
    effect: { badDraw: true } },
  { id: "lucky-table", emoji: "🎲", scope: "lasting", weight: 5, group: "draw-luck",
    effect: { luckyDraw: true } },
  { id: "drunk-table", emoji: "🥴", scope: "lasting", weight: 5,
    effect: { drunkAim: true } },

  // ── Punishments · fire once ───────────────────────────────────────────────
  { id: "plague", emoji: "🦠", scope: "instant", weight: 6, group: "damage", minAlive: 4,
    onFire: (c) => c.damageAll(1, { onlyAbove: 1 }) },
  { id: "toll", emoji: "💰", scope: "instant", weight: 7,
    onFire: (c) => c.discardAllRandom(1) },
  { id: "strong-wind", emoji: "🌬️", scope: "instant", weight: 5,
    onFire: (c) => c.passDynamiteAround() },
  { id: "wet-fuse", emoji: "💧", scope: "instant", weight: 4,
    onFire: (c) => c.clearEquip("dynamite") },
  { id: "jailbreak", emoji: "🗝️", scope: "instant", weight: 5,
    onFire: (c) => c.clearEquip("jail") },

  // ── Boons · fire once ─────────────────────────────────────────────────
  { id: "healing-spring", emoji: "⛲", scope: "instant", weight: 7, group: "heal",
    onFire: (c) => c.healAll(1) },
  { id: "supply-drop", emoji: "📦", scope: "instant", weight: 8,
    onFire: (c) => c.drawAll(1) },
  { id: "flea-market", emoji: "🛒", scope: "instant", weight: 6,
    onFire: (c) => c.generalStore() },
  { id: "reshuffle", emoji: "♻️", scope: "instant", weight: 4,
    onFire: (c) => c.reshuffleDiscard() },

  // ── Chaos · fires once ─────────────────────────────────────────────────
  { id: "pass-the-hand", emoji: "👐", scope: "instant", weight: 5, minAlive: 4,
    onFire: (c) => c.passHandsAround() },
  { id: "gun-shuffle", emoji: "🔫", scope: "instant", weight: 5, minAlive: 4,
    onFire: (c) => c.passGunsAround() },
  { id: "reverse", emoji: "↩️", scope: "instant", weight: 5, minAlive: 4,
    onFire: (c) => c.reverseOrder() },

];

export const EVENT_BY_ID: Record<string, GameEventDef> = Object.fromEntries(
  EVENTS.map((e) => [e.id, e])
);

// ─── Frequency ───────────────────────────────────────────────────────────────

// Each round draws a random 2..4 events, all in force together for that round.
// Frequency itself is not a dial — just on/off.
export const EVENTS_MIN = 2;
export const EVENTS_MAX = 4;
export type EventLevel = "off" | "on";

// ─── Effect merging ──────────────────────────────────────────────────────────

// Numeric fields that ADD when several active events set them.
const SUM_FIELDS = [
  "rangeDelta", "distanceDelta", "extraDraw", "handLimitDelta",
  "damageDelta", "missedNeededDelta",
] as const;
// Numeric fields where the SMALLEST value wins (the most restrictive).
const MIN_FIELDS = ["maxPlays", "drawCount", "bangLimit"] as const;
// Numeric fields where the LARGEST value wins (the most generous).
const MAX_FIELDS = ["rangeOverride", "beerHeal"] as const;
const FLAG_FIELDS = [
  "noBang", "noHeal", "noDamage", "protectSheriff",
  "ignoreOncePerTurn", "luckyDraw", "badDraw", "drunkAim",
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

// Is this event usable at all at this headcount? Separate from the rest of the
// filtering because "the deck is empty" has to be judged on the gates ALONE — see
// pickBatch.
function gated(e: GameEventDef, aliveCount: number): boolean {
  return (
    (e.minAlive == null || aliveCount >= e.minAlive) &&
    (e.maxAlive == null || aliveCount <= e.maxAlive)
  );
}

// Eligible events for one draw: usable at this headcount, not already seen this game,
// not already in this round's batch, and no group already taken by the batch.
function eligible(
  aliveCount: number,
  used: string[],
  taken: GameEventDef[]
): GameEventDef[] {
  const takenGroups = new Set(taken.map((e) => e.group).filter(Boolean));
  const takenIds = new Set(taken.map((e) => e.id));
  return EVENTS.filter(
    (e) =>
      gated(e, aliveCount) &&
      !takenIds.has(e.id) &&
      !used.includes(e.id) &&
      !(e.group && takenGroups.has(e.group))
  );
}

// This round's batch: a random 2..4 compatible events, none of them seen before in
// this game.
//
// `used` IS the deck's discard pile and this function owns it end to end: it reads
// it, appends what it draws, and reshuffles (empties) it when exhausted. Deliberately
// one owner — splitting "read here, append there" is exactly the kind of contract
// that silently degrades into drawing with replacement. A 7-player game gets through
// roughly 21 of the 40 events, so a reshuffle is the exception, not the norm.
//
// A batch can still come up short of `want`: group exclusion plus the minAlive gates
// can leave nothing compatible. A smaller batch is the correct outcome there — never
// a duplicate, never a contradiction.
export function pickBatch(aliveCount: number, used: string[], rand: () => number): GameEventDef[] {
  const want = EVENTS_MIN + Math.floor(rand() * (EVENTS_MAX - EVENTS_MIN + 1));
  const batch: GameEventDef[] = [];
  for (let i = 0; i < want; i++) {
    let pool = eligible(aliveCount, used, batch);
    if (pool.length === 0) {
      // An empty pool has two very different causes and they must not be conflated.
      // Usually it just means this batch's groups have blocked everything that is
      // left — a dead end, so the batch simply comes up short. Only when NO unused
      // event is drawable at this headcount at all is the deck truly exhausted, and
      // only then may it be reshuffled. Treating a group dead-end as exhaustion
      // silently throws away the whole game's history and lets events repeat.
      const deckEmpty = !EVENTS.some((e) => gated(e, aliveCount) && !used.includes(e.id));
      if (!deckEmpty) break;
      used.length = 0;
      // Events already in THIS batch stay excluded, so a reshuffle can never hand
      // back something announced moments ago in the same breath.
      pool = eligible(aliveCount, used, batch);
      if (pool.length === 0) break;
    }
    const pick = pickWeighted(pool, rand);
    if (!pick) break;
    batch.push(pick);
    used.push(pick.id);
  }
  return batch;
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
