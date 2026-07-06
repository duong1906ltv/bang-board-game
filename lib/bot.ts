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

// A card usable AS `defId` (Calamity Janet may swap Bang!/Missed!).
function findUsableAs(p: Player, defId: "bang" | "missed"): Card | undefined {
  const direct = findCard(p, defId);
  if (direct) return direct;
  if (p.character?.id === "calamity-janet") {
    return findCard(p, defId === "bang" ? "missed" : "bang");
  }
  return undefined;
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
function nearestEnemyInRange(room: Room, me: Player): Player | null {
  const range = game.rangeOf(me);
  let best: Player | null = null;
  let bestDist = Infinity;
  for (const p of room.players) {
    if (!p.alive || p.id === me.id || !isEnemy(me, p)) continue;
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

  if (p.kind === "bang") {
    const me = player(room, p.targetId);
    if (!me?.isBot) return null;
    const missed = findUsableAs(me, "missed");
    if (missed) return () => ok(game.respond(code, me.id, "missed", missed.id));
    return () => ok(game.respond(code, me.id, "pass"));
  }
  if (p.kind === "dying") {
    const me = player(room, p.targetId);
    if (!me?.isBot) return null;
    const beer = findCard(me, "beer");
    if (beer) return () => ok(game.respond(code, me.id, "beer", beer.id));
    return () => ok(game.respond(code, me.id, "pass"));
  }
  if (p.kind === "multi") {
    const r = p.responders.find((x) => !x.done);
    if (!r) return null;
    const me = player(room, r.id);
    if (!me?.isBot) return null;
    const need = p.effect === "indians" ? "bang" : "missed";
    const card = findUsableAs(me, need);
    if (card) return () => ok(game.respond(code, me.id, need, card.id));
    return () => ok(game.respond(code, me.id, "pass"));
  }
  if (p.kind === "duel") {
    const me = player(room, p.turnId);
    if (!me?.isBot) return null;
    const bang = findUsableAs(me, "bang");
    if (bang) return () => ok(game.respond(code, me.id, "bang", bang.id));
    return () => ok(game.respond(code, me.id, "pass"));
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

  // Draw step first.
  if (room.turnPhase === "draw") {
    return () => game.drawCards(code, me.id, "deck");
  }

  // Play step — pick the single most useful action, one per tick.
  const play = (c: Card, targetId?: string) => () => game.playCard(code, me.id, c.id, targetId).ok;

  // 1. Equip a better gun.
  const gun = me.hand
    .filter((c) => CARD_DEF_BY_ID[c.defId]?.kind === "gun")
    .sort((a, b) => gunRange(b) - gunRange(a))[0];
  if (gun && gunRange(gun) > game.rangeOf(me)) return play(gun);

  // 2. Defensive blue cards (once each).
  for (const defId of ["barrel", "scope", "mustang"]) {
    const c = findCard(me, defId);
    if (c && !me.equipment.some((e) => e.defId === defId)) return play(c);
  }

  // 3. Heal if hurt.
  if (me.hp < me.maxHp) {
    const beer = findCard(me, "beer");
    if (beer) return play(beer);
  }

  // 4. Shoot the nearest enemy in range.
  const unlimited = me.equipment.some((c) => c.defId === "volcanic") || me.character?.id === "willy-the-kid";
  if (unlimited || room.bangsThisTurn < 1) {
    const bang = findUsableAs(me, "bang");
    const target = nearestEnemyInRange(room, me);
    if (bang && target) return play(bang, target.id);
  }

  // 5. Area attacks if we have a healthy lead in living enemies.
  const gatling = findCard(me, "gatling");
  if (gatling) return play(gatling);
  const indians = findCard(me, "indians");
  if (indians) return play(indians);

  // 6. Card advantage (safe draws).
  const stage = findCard(me, "stagecoach");
  if (stage) return play(stage);
  const wells = findCard(me, "wells-fargo");
  if (wells) return play(wells);

  // 7. Saloon only if it actually heals us.
  if (me.hp < me.maxHp) {
    const saloon = findCard(me, "saloon");
    if (saloon) return play(saloon);
  }

  // 8. Discard down to the hand limit, then end the turn.
  if (me.hand.length > me.hp) {
    // Drop the least useful card first.
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
