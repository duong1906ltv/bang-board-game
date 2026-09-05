// Server-side AI for filling seats. Bots have no socket and drive the exact same game.*
// functions a human would, one action per tick, so every rule is exercised identically.

import * as game from "./game";
import { rankPriority, type AbilityKind } from "./types";
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

// Kẻ địch gần nhất mà phát bắn NÀY thật sự với tới. Danh sách hợp lệ lấy thẳng từ engine
// chứ không dựng lại: tầm súng chỉ là một luật trong nhiều luật — còn Truce che Sheriff,
// và Apache Kid miễn nhiễm bài Rô, cái sau phụ thuộc vào chính LÁ đang cầm chứ không chỉ
// vào hai người. Bản cũ tự lọc theo tầm rồi tự nhớ Truce, và đó đúng là kiểu cuốn-luật-
// thứ-hai đã làm bàn treo 19/200 ván khi Apache Kid vào bộ: bot ngắm được, engine từ
// chối, step() trả false, lịch bot dừng hẳn và bàn đứng vĩnh viễn.
function nearestShootable(room: Room, me: Player, card?: Card): Player | null {
  const legal = new Set(game.legalTargetIds(room, me, "bang", card));
  let best: Player | null = null;
  let bestDist = Infinity;
  for (const p of room.players) {
    if (!legal.has(p.id) || !isEnemy(me, p)) continue;
    const d = game.distanceBetween(room, me, p);
    if (d < bestDist) { best = p; bestDist = d; }
  }
  return best;
}

function pickPriority(c: Card): number {
  const v: Record<string, number> = {
    bang: 8, missed: 7, beer: 6, "rev-carabine": 5, remington: 5, winchester: 5,
    schofield: 4, volcanic: 4, barrel: 4, scope: 3, mustang: 3,
    gatling: 6, indians: 5, duel: 4, panic: 3, "cat-balou": 3,
    stagecoach: 4, "wells-fargo": 5, saloon: 3, "general-store": 2, jail: 2, dynamite: 1,
  };
  return v[c.defId] ?? 2;
}

function bestPick(cards: Card[]): Card {
  return [...cards].sort((a, b) => pickPriority(b) - pickPriority(a))[0];
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

  // Otherwise it's someone's turn — including a dead bot that flipped its way up for a
  // ghost turn. Leaving ghosts out here would be a hang, not a skipped turn: the seat
  // holds the turn and no human can take it off them.
  const cur = room.players[room.turnIndex];
  if (!cur || !cur.isBot || (!cur.alive && !cur.ghost)) return null;
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
  // Nothing to decide — a bot losing a card just waves it through. Load-bearing: with
  // no bot branch here the table would sit on the dialog until the server's timer fired,
  // eight seconds per Panic! against a bot.
  if (p.kind === "taken") {
    const me = player(room, p.victimId);
    if (!me?.isBot) return null;
    return () => ok(game.respond(code, me.id, "pass"));
  }
  if (p.kind === "check") {
    // Nothing to decide — but it still has to be dismissed, or the table waits on a
    // bot forever (there is no timeout anywhere in this game).
    const me = player(room, p.playerId);
    if (!me?.isBot) return null;
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

  if (room.turnPhase === "draw") {
    return () => game.drawCards(code, me.id, "deck");
  }

  // ── Play step ── the scheduler only calls back after a success, so this must
  // return exactly one action per tick or the table stalls.
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

  // Năng lực bấm nút đi qua đúng vị từ mà engine dùng, y như `ok()` ở trên. Bot đoán sai
  // thì step() trả false và LỊCH BOT DỪNG HẲN — bàn treo vĩnh viễn, vì không chỗ nào
  // trong game có timeout.
  const canUse = (kind: AbilityKind) => game.abilityProblem(room, me, kind) === null;
  const worstCards = (n: number) =>
    [...me.hand].sort((a, b) => pickPriority(a) - pickPriority(b)).slice(0, n).map((c) => c.id);

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

  // 3. Heal if hurt. A ghost is at 0 hp and can never be topped up, so it reads as the
  // most wounded player at the table — without the guard it would open every ghost turn
  // reaching for a Beer the engine then refuses.
  if (me.alive && me.hp < me.maxHp) {
    const beer = usable("beer");
    if (beer) return play(beer);
  }

  // 3b. Sid Ketchum: đốt 2 lá lấy 1 máu. Sau lá Bia vì Bia rẻ hơn — một lá đổi một máu,
  // còn đây là hai. Chừa lại 2 lá để còn có gì mà chơi.
  if (me.hp < me.maxHp && me.hand.length >= 4 && canUse("burn-two-to-heal")) {
    const ids = worstCards(2);
    return () => game.useAbility(code, me.id, "burn-two-to-heal", { cardIds: ids }).ok;
  }

  // 4. Shoot the nearest enemy in range (Bang! is governed by its own budget). Duyệt từng
  // lá chứ không lấy lá đầu tiên: hai lá Bang! khác chất có thể với tới hai tập mục tiêu
  // khác nhau, nên "lá đầu tiên không bắn được ai" không có nghĩa là không bắn được.
  if (game.bangBudget(room, me) > 0) {
    for (const c of me.hand.filter((x) => game.canUseAs(me, x, "bang"))) {
      const t = nearestShootable(room, me, c);
      if (t && ok(c, t.id)) return play(c, t.id);
    }
  }

  // 4b. Doc Holyday: hết lá Bang! hoặc hết hạn mức thì vẫn bắn được, giá 2 lá. Đắt, nên
  // chỉ làm khi trên tay còn dư — bắn xong mà tay trắng thì lượt sau không đỡ được gì.
  const docTarget = me.hand.length >= 4 ? nearestShootable(room, me) : null;
  if (docTarget && canUse("burn-two-to-shoot")) {
    const ids = worstCards(2);
    const tid = docTarget.id;
    return () => game.useAbility(code, me.id, "burn-two-to-shoot", { cardIds: ids, targetId: tid }).ok;
  }

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

  // 6b. Chuck Wengam: đổi máu lấy bài, chỉ khi máu còn dày. Ngưỡng 3 chứ không phải 2:
  // ở 2 máu một phát Bang! đưa anh ta vào cửa hấp hối, và anh ta vừa tiêu mất lá đỡ.
  if (me.alive && me.hp >= 3 && me.hand.length <= 3 && canUse("lose-life-to-draw")) {
    return () => game.useAbility(code, me.id, "lose-life-to-draw").ok;
  }

  // 6c. José Delgado: đốt lá xanh lấy 2 lá. Ưu tiên lá thừa thật — súng không hơn khẩu
  // đang đeo, hoặc lá xanh trùng thứ đã bày ra bàn. Không có lá thừa thì chỉ đốt khi tay
  // đằng nào cũng quá giới hạn và lá đó sắp bị bỏ.
  if (canUse("burn-blue-to-draw")) {
    const blues = me.hand.filter((c) => game.isBlueBordered(c));
    const spare =
      blues.find((c) => gunRange(c) > 0 && gunRange(c) <= game.rangeOf(me, room)) ??
      blues.find((c) => me.equipment.some((e) => e.defId === c.defId)) ??
      (me.hand.length > game.handLimitOf(room, me) ? blues[0] : undefined);
    if (spare) {
      const id = spare.id;
      return () => game.useAbility(code, me.id, "burn-blue-to-draw", { cardIds: [id] }).ok;
    }
  }

  // 7. Saloon only if it actually heals us. A ghost is allowed to pour the round — it
  // just has no reason to, since every point of it goes to players who are still alive
  // and most of them are not on its side.
  if (me.alive && me.hp < me.maxHp) {
    const saloon = usable("saloon");
    if (saloon) return play(saloon);
  }

  // 8. Discard down to the hand limit (events can tighten it), then end the turn.
  if (me.hand.length > game.handLimitOf(room, me)) {
      const worst = [...me.hand].sort((a, b) => pickPriority(a) - pickPriority(b))[0];
    return () => game.discardCard(code, me.id, worst.id);
  }
  return () => game.endTurn(code, me.id).ok;
}

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
