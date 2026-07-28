// Server-side AI for filling seats during testing. Bots have no socket; they
// drive the exact same game.* functions a human would, one action per "tick",
// so the flow (and every rule) is exercised identically. The server paces the
// ticks (see server.ts) so humans can watch.
//
// The strategy is deliberately simple but role-aware enough that games actually
// progress and reach a win condition: dodge/heal when threatened, shoot the
// nearest enemy in range on your turn, then end.

import * as game from "./game";
import { rankPriority } from "./types";
import { Card, CARD_DEF_BY_ID } from "./cards";

type Player = game.Player;
type Room = game.Room;

function player(room: Room, id: string): Player | undefined {
  return room.players.find((p) => p.id === id);
}

function findCard(p: Player, defId: string): Card | undefined {
  return p.hand.find((c) => c.defId === defId);
}

// The other card this player may use in place of `defId`, per their character's
// `useAs` pair (Calamity Janet swaps Bang!/Missed!). The engine validates with
// game.canUseAs; a bot that offers a play the engine rejects stops the scheduler,
// so both sides must read the same field.
function swappedFor(p: Player, defId: string): string | null {
  const pair = p.character?.effect.useAs;
  if (!pair) return null;
  const [a, b] = pair;
  return defId === a ? b : defId === b ? a : null;
}

function findUsableAs(p: Player, defId: "bang" | "missed"): Card | undefined {
  const direct = findCard(p, defId);
  if (direct) return direct;
  const alt = swappedFor(p, defId);
  return alt ? findCard(p, alt) : undefined;
}

function countUsableAs(p: Player, defId: "bang" | "missed"): number {
  const alt = swappedFor(p, defId);
  return p.hand.filter((c) => c.defId === defId || (alt !== null && c.defId === alt)).length;
}

// Rough alliance model (bots are omniscient server-side, which is fine for a
// test harness — it just makes games converge).
function isEnemy(me: Player, other: Player): boolean {
  const a = me.role, b = other.role;
  if (!a || !b) return true;
  if (a === "sheriff" || a === "deputy") return b === "outlaw" || b === "renegade";
  if (a === "outlaw") return b === "sheriff" || b === "deputy";
  return true; // renegade fights everyone
}

// Nearest living enemy within weapon range (for Bang!). Returns null if none.
// Skips the Sheriff while a Truce event protects them, so the bot doesn't burn
// its turn on a shot the engine will refuse.
function nearestEnemyInRange(room: Room, me: Player): Player | null {
  const range = game.rangeOf(me, room);
  const truce = !!game.activeEffect(room).protectSheriff;
  let best: Player | null = null;
  let bestDist = Infinity;
  for (const p of room.players) {
    if (!p.alive || p.id === me.id || !isEnemy(me, p)) continue;
    if (truce && p.role === "sheriff") continue;
    const d = game.distanceBetween(room, me, p);
    if (d <= range && d < bestDist) { best = p; bestDist = d; }
  }
  return best;
}

// Value used to decide which store/kit card a bot grabs, and which to keep.
function cardValue(c: Card): number {
  const v: Record<string, number> = {
    bang: 8, missed: 7, beer: 6, "rev-carabine": 5, remington: 5, winchester: 5,
    schofield: 4, volcanic: 4, barrel: 4, scope: 3, mustang: 3,
    gatling: 6, indians: 5, duel: 4, panic: 3, "cat-balou": 3,
    stagecoach: 4, "wells-fargo": 5, saloon: 3, "general-store": 2, jail: 2, dynamite: 1,
  };
  return v[c.defId] ?? 2;
}

function bestPick(cards: Card[]): Card {
  return [...cards].sort((a, b) => cardValue(b) - cardValue(a))[0];
}

function gunRange(c: Card): number {
  return CARD_DEF_BY_ID[c.defId]?.range ?? 0;
}

// ── the actor resolver ──────────────────────────────────────────────────────
// Returns the single bot action that should happen now, or null if we're
// waiting on a human (or nothing to do). Both hasBotToAct() and step() use it,
// so the "who acts now" logic lives in exactly one place.
function nextAction(room: Room): (() => boolean) | null {
  const code = room.code;

  // Drafting: any bot that hasn't locked a character picks its best.
  if (room.phase === "drafting") {
    const b = room.players.find((p) => p.isBot && !p.hasPicked);
    if (!b) return null;
    const choice = [...b.draftChoices].sort((x, y) => rankPriority(y.rank) - rankPriority(x.rank))[0];
    return () => game.pickCharacter(code, b.id, choice.id);
  }

  if (room.phase !== "playing") return null;

  // A pending reaction takes priority — resolve it if the responder is a bot.
  if (room.pending) return pendingAction(room);

  // Otherwise it's someone's turn.
  const cur = room.players[room.turnIndex];
  if (!cur || !cur.isBot || !cur.alive) return null;
  return turnAction(room, cur);
}

function pendingAction(room: Room): (() => boolean) | null {
  const code = room.code;
  const p = room.pending!;
  const ok = (r: { ok: boolean } | boolean) => (typeof r === "boolean" ? r : r.ok);

  // Play `card` as `type`, or pass when we don't hold a usable one.
  const respondOrPass = (me: Player, type: "missed" | "beer" | "bang", card?: Card) =>
    card
      ? () => ok(game.respond(code, me.id, type, card.id))
      : () => ok(game.respond(code, me.id, "pass"));

  if (p.kind === "bang") {
    const me = player(room, p.targetId);
    if (!me?.isBot) return null;
    // Only dodge if it can complete the full count (2 vs Slab the Killer);
    // otherwise pass rather than waste a Missed! it can't finish with.
    const remaining = p.missedNeeded - p.missedPlayed;
    const usable = countUsableAs(me, "missed");
    const missed = findUsableAs(me, "missed");
    if (missed && usable >= remaining) return () => ok(game.respond(code, me.id, "missed", missed.id));
    return () => ok(game.respond(code, me.id, "pass"));
  }
  if (p.kind === "dying") {
    const me = player(room, p.targetId);
    if (!me?.isBot) return null;
    const beer = findCard(me, "beer");
    return respondOrPass(me, "beer", beer);
  }
  if (p.kind === "multi") {
    // Simultaneous reaction: any not-yet-done bot may act now, regardless of
    // which humans are still deciding (there is no timeout to break a stall).
    const r = p.responders.find((x) => !x.done && !!player(room, x.id)?.isBot);
    if (!r) return null;
    const me = player(room, r.id);
    if (!me?.isBot) return null;
    const need = p.effect === "indians" ? "bang" : "missed";
    return respondOrPass(me, need, findUsableAs(me, need));
  }
  if (p.kind === "duel") {
    const me = player(room, p.turnId);
    if (!me?.isBot) return null;
    return respondOrPass(me, "bang", findUsableAs(me, "bang"));
  }
  if (p.kind === "store") {
    const me = player(room, p.order[0]);
    if (!me?.isBot) return null;
    const pick = bestPick(p.cards);
    return () => ok(game.choose(code, me.id, pick.id));
  }
  if (p.kind === "kit") {
    const me = player(room, p.playerId);
    if (!me?.isBot) return null;
    const pick = bestPick(p.cards);
    return () => ok(game.choose(code, me.id, pick.id));
  }
  return null;
}

function turnAction(room: Room, me: Player): (() => boolean) | null {
  const code = room.code;

  if (room.turnPhase === "draw") {
    return () => game.drawCards(code, me.id, "deck");
  }

  // Play step — pick the single most useful action, one per tick.
  const play = (c: Card, targetId?: string) => () => game.playCard(code, me.id, c.id, targetId).ok;

  // Every candidate goes through the engine's OWN predicate, which covers the
  // once-per-turn house rule and every random-event restriction. This must be the
  // same check the engine validates with: a bot action the engine rejects returns
  // false from step(), which stops the bot scheduler — and with no reaction
  // timeouts anywhere, the table would then freeze for good.
  const ok = (c: Card | undefined, targetId?: string): c is Card =>
    !!c && game.playBlock(room, me, c, targetId) === null;
    const usable = (defId: string) => {
    const c = findCard(me, defId);
    return ok(c) ? c : undefined;
  };

  // 1. Equip a better gun.
  const gun = me.hand
    .filter((c) => CARD_DEF_BY_ID[c.defId]?.kind === "gun")
    .sort((a, b) => gunRange(b) - gunRange(a))[0];
  if (ok(gun) && gunRange(gun) > game.rangeOf(me, room)) return play(gun);

  // 2. Defensive blue cards (one of each in play, once per turn).
  for (const defId of ["barrel", "scope", "mustang"]) {
    const c = usable(defId);
    if (c && !me.equipment.some((e) => e.defId === defId)) return play(c);
  }

  // 3. Heal if hurt.
  if (me.hp < me.maxHp) {
    const beer = usable("beer");
    if (beer) return play(beer);
  }

  // 4. Shoot the nearest enemy in range (Bang! is governed by its own budget).
  const target = nearestEnemyInRange(room, me);
  const bang = findUsableAs(me, "bang");
  if (target && ok(bang, target.id) && game.bangBudget(room, me) > 0) return play(bang, target.id);

  // 5. Area attacks.
  const gatling = usable("gatling");
  if (gatling) return play(gatling);
  const indians = usable("indians");
  if (indians) return play(indians);

  // 6. Card advantage (safe draws).
  const stage = usable("stagecoach");
  if (stage) return play(stage);
  const wells = usable("wells-fargo");
  if (wells) return play(wells);

  // 7. Saloon only if it actually heals us.
  if (me.hp < me.maxHp) {
    const saloon = usable("saloon");
    if (saloon) return play(saloon);
  }

  // 8. Discard down to the hand limit (events can tighten it), then end the turn.
  if (me.hand.length > game.handLimitOf(room, me)) {
      const worst = [...me.hand].sort((a, b) => cardValue(a) - cardValue(b))[0];
    return () => game.discardCard(code, me.id, worst.id);
  }
  return () => game.endTurn(code, me.id).ok;
}

// Is there a bot waiting to act right now? (Cheap check for scheduling.)
export function hasBotToAct(code: string): boolean {
  const room = game.getRoom(code);
  return !!room && nextAction(room) !== null;
}

// Perform exactly one bot action. Returns true if the game state changed
// (so the caller should re-broadcast and check for the next bot action).
export function step(code: string): boolean {
  const room = game.getRoom(code);
  if (!room) return false;
  const action = nextAction(room);
  if (!action) return false;
  return action();
}
