// In-memory game engine for Bang! — full game: room lifecycle, role dealing,
// character draft (deal 2 per player, no time limit; auto-pick by tier rank only
// as a safety net if a player leaves), the card deck, and combat resolution.
// Rooms live in a Map for the lifetime of the server process (no DB).

import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  Character,
  CHARACTERS,
  rankPriority,
  Role,
  Winner,
} from "../types";
import { buildDeck, Card, CARD_DEF_BY_ID } from "../cards";
import { buildEscapeRewardUrl } from "../escapeReward";
import { err, GameError, Result } from "../errors";
import {
  ActiveEvent,
  DRAFT_PER_PLAYER,
  Pending,
  Player,
  ROLE_SETUP,
  Room,
  aliveBySeat,
  logCheck,
  pushLog,
  rooms,
  shuffle,
} from "./state";
import { beersInHand, charEffect, drawInto, drawOne } from "./deck";
import { judgePredictions, predict, voidPredictionsFor } from "./predictions";
import { dealMissions, signalMissions } from "./missions";
import type { MissionSignal } from "../missions";
import { activeEffect, eventsUnlocked, resetEventState, tickEvents } from "./events-read";
import { barrelAttempts, distanceBetween, hasEquip, rangeOf } from "./geometry";
import { bangBudget, canUseAs, handLimitOf, isExemptPlay, legalTargetIds, nextSeatId, playBlock, targetProblem } from "./rules";
import {
  addBot,
  addPlayer,
  clearBotTimer,
  createRoom,
  getRoom,
  listLobbies,
  mayStart,
  mySeats,
  notify,
  rejoin,
  removeBot,
  roleSetupFor,
} from "./rooms";
import { buildView } from "./view";

// Re-exported because they were part of this module's public surface before the split:
// server.ts, lib/bot.ts and every test still reach for them through `game.*`. Moving an
// exported function into a submodule shrinks that surface silently — tsc only catches it
// at the caller, which may be a file this phase never opened.
export type { Player, Room };
export { DRAFT_PER_PLAYER };
export { activeEffect };
export { distanceBetween, rangeOf };
export { bangBudget, canUseAs, handLimitOf, nextSeatId, playBlock, targetProblem };
export {
  addBot,
  addPlayer,
  createRoom,
  getRoom,
  listLobbies,
  mayStart,
  mySeats,
  rejoin,
  removeBot,
  roleSetupFor,
};
export { buildView };
export { predict };


export type { GameError, Result };
import {
  EventCtx,
  EventLevel,
  pickBatch,
  GameEventDef,
} from "../events";

// Wins needed (cumulative within one room) to unlock the cross-game reward.
const REWARD_WIN_THRESHOLD = 3;

// --- helpers ---






// --- room lifecycle ---







// ── the room browser ────────────────────────────────────────────────────────





export function disconnect(socketId: string): Room | null {
  for (const room of rooms.values()) {
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) continue;
    player.connected = false;
    player.socketId = null;
    if (room.phase === "lobby") {
      room.players = room.players.filter((p) => p.id !== player.id);
          if (room.players.length === 0) {
        clearBotTimer(room);
        rooms.delete(room.code);
        return null;
      }
      if (player.isHost) {
        const nextHost = room.players.find((p) => !p.isBot);
        if (!nextHost) {
          // Only bots remain — tear the lobby down.
          clearBotTimer(room);
          rooms.delete(room.code);
          return null;
        }
        room.players.forEach((p) => (p.isHost = p.id === nextHost.id));
        room.hostId = nextHost.id;
      }
    }
    // Walking out in the middle of a ghost turn would leave the table holding a turn
    // nobody can end: a ghost cannot surrender (it is not alive), and there are no turn
    // timers anywhere. So it lies back down on the way out. A LIVING player who drops
    // mid-turn is left exactly as before — they can rejoin the same seat and carry on,
    // which a ghost cannot do, because its turn is over the moment it lies down.
    if (
      room.phase === "playing" &&
      player.ghost &&
      room.players[room.turnIndex]?.id === player.id &&
      !room.pending
    ) {
      layGhostDown(room, player);
      advanceToNextSeat(room);
      beginTurn(room);
    }
    return room;
  }
  return null;
}


// --- game start / character draft ---

// Xáo lại chỗ ngồi cho ván mới. Thứ tự room.players CHÍNH LÀ vòng bàn — geometry.ts đo
// cự ly bằng chỉ số ghế, view dựng lại `seat` từ chỉ số đó mỗi lần build, và client xoay
// bàn quanh ghế người xem — nên đảo mảng ở đây là đảo ghế thật, không chỗ nào giữ ghế cũ.
// Chỉ được gọi ở lobby: đảo giữa ván là đổi mọi cự ly ngay giữa lượt.
//
// Thử lại vài lần nếu shuffle trả về đúng thứ tự cũ — ván mới mà ai cũng ngồi y chỗ cũ
// thì người chơi đọc thành "chưa đảo". Bàn tối thiểu 4 ghế nên luôn có hoán vị khác.
function reseat(players: Player[]): Player[] {
  let next = shuffle(players);
  for (let i = 0; i < 4 && next.every((p, k) => p.id === players[k].id); i++) {
    next = shuffle(players);
  }
  return next;
}

export function startGame(code: string): Result {
  const room = rooms.get(code);
  if (!room) return err("no-such-room");
  if (room.phase !== "lobby") return err("already-started");
  const n = room.players.length;
  if (n < MIN_PLAYERS) return err("need-players", { n: MIN_PLAYERS });
  if (n > MAX_PLAYERS) return err("too-many-players", { n: MAX_PLAYERS });
  const setup = ROLE_SETUP[n];
  if (!setup) return err("bad-player-count");

  room.players = reseat(room.players);
  const roles = shuffle(setup);
  // Draw n*2 characters from the pool and hand each player 2 to choose from.
  const pool = shuffle(CHARACTERS).slice(0, n * DRAFT_PER_PLAYER);
  room.players.forEach((p, i) => {
    p.role = roles[i];
    p.character = null;
    p.draftChoices = pool.slice(i * DRAFT_PER_PLAYER, (i + 1) * DRAFT_PER_PLAYER);
    p.hasPicked = false;
    p.hp = 0;
    p.maxHp = 0;
    p.alive = true;
    p.ghost = false;
    p.ghostMisses = 0;
    p.hand = [];
  });

  room.phase = "drafting";
  return { ok: true };
}

// A player locks in one of their two offered characters.
export function pickCharacter(code: string, playerId: string, characterId: string): boolean {
  const room = rooms.get(code);
  if (!room || room.phase !== "drafting") return false;
  const player = room.players.find((p) => p.id === playerId);
  if (!player || player.hasPicked) return false;
  const choice = player.draftChoices.find((c) => c.id === characterId);
  if (!choice) return false;
  player.character = choice;
  player.hasPicked = true;
  // End the draft early once everyone has locked in.
  if (room.players.every((p) => p.hasPicked)) finalizeDraft(room);
  return true;
}

// Auto-resolve a single player's pick by tier rank (A > B > C > D > unranked);
// ties are broken randomly.
function autoPick(choices: Character[]): Character {
  const max = Math.max(...choices.map((c) => rankPriority(c.rank)));
  const top = choices.filter((c) => rankPriority(c.rank) === max);
  return top[Math.floor(Math.random() * top.length)];
}

// Transition drafting -> playing: set HP from characters (Sheriff +1) and give
// the first turn to the Sheriff.
function finalizeDraft(room: Room) {
  room.players.forEach((p) => {
    if (!p.character) p.character = autoPick(p.draftChoices); // safety net
    const bonus = p.role === "sheriff" ? 1 : 0;
    p.maxHp = p.character.maxHp + bonus;
    p.hp = p.maxHp;
    p.alive = true;
    p.ghost = false;
    p.ghostMisses = 0;
    p.hand = [];
    p.equipment = [];
    p.inbox = [];
  });
  // Build and shuffle the draw pile, then deal each player a starting hand equal
  // to their life points (Bang! starting-hand rule).
  room.deck = shuffle(buildDeck());
  room.discard = [];
  room.players.forEach((p) => {
    p.hand = room.deck.splice(-p.hp, p.hp);
  });

  const sheriffIdx = room.players.findIndex((p) => p.role === "sheriff");
  room.turnIndex = sheriffIdx >= 0 ? sheriffIdx : 0;
  room.winner = null;
  room.pending = null;
  room.phase = "playing";
  // Random events start from a clean slate each game; the Sheriff opens round 1 and
  // therefore marks every later round boundary. Round 1 is queued explicitly: the
  // first turn is entered straight from here, not through advanceToNextSeat, so
  // nothing else would ever set the boundary flag for it.
  resetEventState(room);
  dealMissions(room);
  room.roundStarterId = room.players[room.turnIndex].id;
  room.roundEventDue = true;
  beginTurn(room); // Sheriff begins (runs upkeep if they somehow have blue cards)
}

// --- random events ---------------------------------------------------------
// ONE scheduler: `rollRoundEvents` fires at the start of each ROUND — i.e. when play
// comes back round to the Sheriff — and the 2..4 events it draws stand for that whole
// round, applying to everyone. Every enforcement point in this file reads the merged result
// of `activeEffect`, so adding an event never means touching the engine (lib/events.ts).

// Host setting: how often events fire (persists across restart()).
// Bật/tắt nhiệm vụ phụ. Luật phòng, sống qua restart() — như eventLevel.
//
// KHÁC eventLevel ở một chỗ, và đừng copy mù chỗ đó: đổi chỉ được phép ở LOBBY. Event roll lại
// mỗi round nên bật giữa ván vô hại; nhiệm vụ thì chia đúng một lần ở finalizeDraft, nên bật
// giữa ván để lại một bàn mà ai đã chia rồi thì không có và ai chưa thì có — hai luật cùng lúc.
export function setMissionsOn(code: string, on: boolean): boolean {
  const room = rooms.get(code);
  if (!room || room.phase !== "lobby") return false;
  room.missionsOn = !!on;
  return true;
}

export function setEventLevel(code: string, level: EventLevel): boolean {
  const room = rooms.get(code);
  if (!room) return false;
  room.eventLevel = level;
  return true;
}






// Fire one event: log it, run its one-shot effect, and register any modifier.
function fireEvent(room: Room, def: GameEventDef, opener: Player) {
  // A modifier stands for one round, and one round is one turn per living player.
  const ev: ActiveEvent = {
    seq: ++room.eventSeq,
    defId: def.id,
    turnsLeft: Math.max(1, aliveBySeat(room).length),
  };
  room.eventFeed.push(ev);
  if (room.eventFeed.length > 8) room.eventFeed.shift();
  room.roundEvents.push(ev); // shown to everyone for the round (instant events included)
  pushLog(room, { kind: "event", event: def.id, a: opener.name });
  // Instant events keep no modifier — they just happen.
  if (def.scope === "lasting") room.events.push(ev);
  if (def.onFire) def.onFire(makeCtx(room, opener));
}

// The one scheduler: this round's batch of 2..4 compatible events, as the round opens.
function rollRoundEvents(room: Room, opener: Player) {
  if (!eventsUnlocked(room)) return;
  // Retire last round's batch before drawing this one. Timers are set from the
  // headcount at the moment they fired, so deaths mid-round can leave one running a
  // turn or two long; clearing here is what guarantees the board shows exactly the
  // events that were announced for THIS round.
  room.events = [];
  room.roundEvents = [];
  for (const def of pickBatch(aliveBySeat(room).length, room.usedEventIds, Math.random)) {
    if (room.phase !== "playing") return; // an instant ended the game mid-batch
    fireEvent(room, def, opener);
  }
}

// Một chỗ duy nhất máu đi lên, và chỗ duy nhất trả lời "hồi được BAO NHIÊU".
//
// Trả về lượng hồi THỰC TẾ — 0 khi đã đầy máu, khi đã chết, hoặc khi một event đang cấm hồi
// máu. Con số đó là thứ đáng giá: nó phân biệt "đã hồi" với "định hồi mà không được", và một
// nhiệm vụ như dry-spell (sống qua 3 lượt thiếu máu mà không hồi điểm nào) chỉ ngắt chuỗi khi
// máu THẬT SỰ lên.
//
// `noHeal` đặt được vào đây mà không đổi hành vi ở chỗ event tự hồi: healing-spring là event
// duy nhất gọi healAll, và nó cùng `group: "heal"` với cả hai event noHeal (prohibition,
// survival). eligible() chỉ cho một event mỗi group vào một batch, nên chúng không bao giờ
// cùng hiệu lực.
//
// KHÔNG dùng cho cú Beer cứu người đang ở 0 HP — xem ghi chú tại chỗ đó trong respond().
// Nhiệm vụ phụ: 5 chỗ gọi, và toàn bộ logic nằm ở ./missions. healPlayer truyền vào như một
// callback vì ./missions không được import lên lõi — xem ghi chú đầu file đó.
function mission(room: Room, s: MissionSignal) {
  signalMissions(room, s, healPlayer);
}

function healPlayer(room: Room, p: Player, n: number): number {
  if (n <= 0 || !p.alive) return 0;
  if (activeEffect(room).noHeal) return 0;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + n);
  const got = p.hp - before;
  if (got > 0) signalMissions(room, { t: "heal", actor: p, n: got }, healPlayer);
  return got;
}

// The narrow surface an event's `onFire` may touch. Everything that can hurt a
// player routes through applyDamage (so Bart Cassidy, El Gringo, the death queue
// and the win check all still fire) and event damage is UNSAVEABLE, which is what
// keeps events fully synchronous: no event can open a reaction window.
function makeCtx(room: Room, opener: Player): EventCtx {
  const alive = () => aliveBySeat(room);
  // Private per-player helpers. They are NOT on EventCtx: keeping every exposed
  // primitive plural is what stops an event from being written to single anyone out.
  const hurt = (p: Player, n: number) => {
    if (!p.alive || room.phase !== "playing") return;
    applyDamage(room, p, n, null, false); // unsaveable, like Dynamite
  };
  const heal = (p: Player, n: number) => {
    const got = healPlayer(room, p, n);
    if (got) pushLog(room, { kind: "heal", a: p.name, n: got });
  };
  const draw = (p: Player, n: number) => {
    const got = drawInto(room, p.hand, n);
    if (got) pushLog(room, { kind: "draw", a: p.name, n: got });
  };
  const discardRandom = (p: Player, n: number) => {
    let lost = 0;
    for (let i = 0; i < n && p.hand.length > 0; i++) {
      room.discard.push(p.hand.splice(Math.floor(Math.random() * p.hand.length), 1)[0]);
      lost++;
    }
    if (lost) pushLog(room, { kind: "discard", a: p.name, n: lost });
  };
  return {
    opener,
    damageAll: (n, opts) => {
      for (const p of alive()) {
        if (opts?.onlyAbove != null && p.hp <= opts.onlyAbove) continue;
        hurt(p, n);
      }
    },
    healAll: (n) => { for (const p of alive()) heal(p, n); },
    drawAll: (n) => { for (const p of alive()) draw(p, n); },
    discardAllRandom: (n) => { for (const p of alive()) discardRandom(p, n); },
    passHandsAround: () => {
      const ps = alive();
      if (ps.length < 2) return;
      const hands = ps.map((p) => p.hand);
      ps.forEach((p, i) => (p.hand = hands[(i + ps.length - room.turnDir) % ps.length]));
    },
    passGunsAround: () => {
      const ps = alive();
      if (ps.length < 2) return;
      const guns = ps.map((p) => {
        const g = p.equipment.find((c) => CARD_DEF_BY_ID[c.defId]?.kind === "gun") ?? null;
        if (g) p.equipment = p.equipment.filter((c) => c.id !== g.id);
        return g;
      });
      ps.forEach((p, i) => {
        const g = guns[(i + ps.length - room.turnDir) % ps.length];
        if (g) p.equipment.push(g);
      });
    },
    passDynamiteAround: () => {
      for (const p of alive()) {
        const dyn = p.equipment.find((c) => c.defId === "dynamite");
        if (!dyn) continue;
        const left = leftNeighbor(room, p);
        if (!left || left.equipment.some((c) => c.defId === "dynamite")) continue;
        p.equipment = p.equipment.filter((c) => c.id !== dyn.id);
        left.equipment.push(dyn);
      }
    },
    clearEquip: (defId) => {
      let n = 0;
      for (const p of room.players) {
        const hit = p.equipment.filter((c) => c.defId === defId);
        if (!hit.length) continue;
        p.equipment = p.equipment.filter((c) => c.defId !== defId);
        room.discard.push(...hit);
        n += hit.length;
      }
      return n;
    },
    reshuffleDiscard: () => {
      if (room.discard.length === 0) return;
      room.deck = shuffle([...room.deck, ...room.discard]);
      room.discard = [];
    },
    // The rest of the round runs backwards; markRoundBoundary puts the table back as
    // the round closes. Remember the direction we came from the first time, so this
    // stays one reversal even if it somehow fires twice.
    reverseOrder: () => {
      room.turnDirRestore ??= room.turnDir;
      room.turnDir = room.turnDir === 1 ? -1 : 1;
    },
    generalStore: () => {
      if (room.pending) return; // never overwrite a live reaction
      openGeneralStore(room, opener);
    },
  };
}


// --- event-aware rule queries ----------------------------------------------
// Single source of truth, used by BOTH the engine (to validate) and lib/bot.ts
// (to filter). If the bot used its own copy it would keep attempting plays the
// engine rejects, and since a failed bot step stops the scheduler, the table
// would freeze with no timeout to break it.







// --- deck helpers ---





// --- distance & range ---





// --- turn flow ---

// Draw phase. The count is event-driven (1 under Empty Pockets, 3-4 under Card Rain
// / Gold Rush), so it is read from the merged effect rather than fixed at 2.
export function drawCards(
  code: string,
  playerId: string,
  source: "deck" | "discard" | "player" = "deck",
  targetId?: string
): boolean {
  const room = rooms.get(code);
  if (!room || room.phase !== "playing" || room.turnPhase !== "draw") return false;
  if (room.pending) return false;
  const current = room.players[room.turnIndex];
  if (!current || current.id !== playerId) return false;
  room.checks = [];
  const beforeDraw = current.hand.length;
  // How many cards this draw phase yields: 2 by default, overridden by events
  // (Card Rain 3 / Empty Pockets 1) and topped up by additive ones (Gold Rush).
  const eff = activeEffect(room);
  const drawTotal = Math.max(0, (eff.drawCount ?? 2) + (eff.extraDraw ?? 0));

  // Kit Carlson: reveal one more than he keeps, then bottom the leftovers — so it
  // scales with the event-driven draw count instead of being a fixed 3-pick-2.
  if (charEffect(current).drawMode === "kit" && drawTotal > 0) {
    const cards: Card[] = [];
    drawInto(room, cards, drawTotal + 1);
    room.pending = { kind: "kit", playerId: current.id, cards, picksLeft: drawTotal };
    return true; // stays in draw phase until picks resolve
  }

  // Jesse Jones: draw the first card from a chosen player's hand.
  if (charEffect(current).drawMode === "jesse" && source === "player" && targetId && drawTotal > 0) {
    const t = room.players.find((p) => p.id === targetId);
    const robbed = t && t.id !== current.id && t.hand.length > 0 ? t : null;
    // The steal waits on the victim's acknowledgement, exactly like Panic! — from their
    // seat it is the same event. The turn STAYS in the draw phase meanwhile, and the
    // rest of the draw is carried on the pending as `thenDraw`: finishing it now would
    // log the draw before the card it is about has actually moved.
    if (robbed && openTaken(room, current, robbed, "take", undefined, undefined, drawTotal - 1)) return true;
    // Nothing to steal (they were empty, or it was themselves): a plain draw.
    drawInto(room, current.hand, drawTotal);
    room.turnPhase = "play";
    pushLog(room, { kind: "draw", a: current.name, n: current.hand.length - beforeDraw });
    return true;
  }

  // Pedro Ramirez: draw the first card from the discard pile.
  if (charEffect(current).drawMode === "pedro" && source === "discard" && room.discard.length > 0 && drawTotal > 0) {
    current.hand.push(room.discard.pop()!);
    drawInto(room, current.hand, drawTotal - 1);
    room.turnPhase = "play";
    pushLog(room, { kind: "draw", a: current.name, n: current.hand.length - beforeDraw });
    return true;
  }

  if (charEffect(current).drawMode === "blackjack" && drawTotal >= 2) {
    const c1 = drawOne(room);
    if (c1) current.hand.push(c1);
    const c2 = drawOne(room);
    if (c2) {
      current.hand.push(c2);
      const bonus = c2.suit === "hearts" || c2.suit === "diamonds";
      room.checks = [{ name: current.name, card: c2, kind: "blackjack", outcome: bonus ? "bonus" : "nobonus" }];
      logCheck(room, room.checks[0]);
      if (bonus) drawInto(room, current.hand, 1);
    }
    drawInto(room, current.hand, drawTotal - 2);
  } else {
    drawInto(room, current.hand, drawTotal);
  }
  room.turnPhase = "play";
  pushLog(room, { kind: "draw", a: current.name, n: current.hand.length - beforeDraw });
  return true;
}



export function playCard(
  code: string,
  playerId: string,
  cardId: string,
  targetId?: string,
  targetCardId?: string
): Result {
  // Capture card/target names before the play mutates state, then log on success.
  const room = rooms.get(code);
  const actor = room?.players[room.turnIndex];
  const playedCard = actor?.hand.find((c) => c.id === cardId);
  const cardName = playedCard?.name;
  const exempt = !!playedCard && !!actor && !!room && isExemptPlay(room, actor, playedCard, targetId);
  const target = targetId ? room?.players.find((p) => p.id === targetId) : undefined;
  const targetName = target?.name;
  const res = playCardImpl(code, playerId, cardId, targetId, targetCardId);
  if (res.ok && room) {
    room.playsThisTurn += 1; // events may cap how many cards a turn allows
    // Mark this card type as used this turn (exempt plays don't consume a slot).
    if (!exempt && playedCard) room.playedDefsThisTurn.push(playedCard.defId);
    // Deferred when the play opened a "somebody is taking your card" dialog: the log is
    // what the whole 3D scene reads, so a line written now would have the two of them
    // reaching across the table while the victim is still looking at the dialog and the
    // card has not moved. respond() writes it once the acknowledgement lands. It also
    // reads truer — until then, the play has not actually happened to anybody.
    if (actor && playedCard) mission(room, { t: "play", actor, defId: playedCard.defId, target });
    if (actor && cardName && room.pending?.kind !== "taken") {
      const entry = { kind: "play" as const, a: actor.name, card: cardName, b: targetName };
      pushLog(room, entry);
      if (target && target.id !== actor.id) notify(room, target, entry);
    }
  }
  return res;
}

function playCardImpl(
  code: string,
  playerId: string,
  cardId: string,
  _targetId?: string,
  targetCardId?: string
): Result {
  const room = rooms.get(code);
  if (!room || room.phase !== "playing") return { ok: false };
  if (room.pending) return err("waiting-for-reaction");
  const current = room.players[room.turnIndex];
  if (!current || current.id !== playerId) return { ok: false };
  if (room.turnPhase === "draw") return err("must-draw-first");
  // Serving a Jail sentence: the only thing allowed is discarding down to the limit.
  // Reactions still work — they go through respond(), not here — so a jailed player
  // can still play Missed! when shot at, which is correct.
  if (room.turnPhase === "discard") {
    return err("jailed-discard-only");
  }
  const idx = current.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return { ok: false };
  const card = current.hand[idx];
  const def = CARD_DEF_BY_ID[card.defId];
  if (!def) return { ok: false };

  // One gate for the house rule ("each card type once per turn"; gun swaps and
  // Bang! exempt) AND every random-event restriction. Shared with lib/bot.ts so
  // bots never retry a play the engine will reject. The defId is recorded in
  // `playCard` only once the play succeeds, so a rejection never burns the slot.
  const blocked = playBlock(room, current, card, _targetId);
  if (blocked) return { ok: false, error: blocked };

  if (def.kind === "gun") {
    // Equip the new gun, discarding any gun already in play (only one allowed).
    current.hand.splice(idx, 1);
    const guns = current.equipment.filter((c) => CARD_DEF_BY_ID[c.defId]?.kind === "gun");
    current.equipment = current.equipment.filter((c) => CARD_DEF_BY_ID[c.defId]?.kind !== "gun");
    room.discard.push(...guns);
    current.equipment.push(card);
    return { ok: true };
  }

  if (def.kind === "blue") {
    // Jail: place on another non-Sheriff player who isn't already jailed.
    if (card.defId === "jail") {
      const target = room.players.find((p) => p.id === _targetId);
      if (!target) return err("invalid-target");
      const problem = targetProblem(room, current, card.defId, target);
      if (problem) return { ok: false, error: problem };
      current.hand.splice(idx, 1);
      target.equipment.push(card);
      return { ok: true };
    }
    // Self-equip (Mustang / Scope / Barrel / Dynamite): at most one of each.
    if (hasEquip(current, card.defId)) return err("already-in-play", { s: def.name });
    current.hand.splice(idx, 1);
    // Remember who lit the fuse: the Dynamite will have moved on by the time it
    // goes off, but the bounty for the Outlaw it kills is still theirs.
    if (card.defId === "dynamite") card.playedBy = current.id;
    current.equipment.push(card);
    return { ok: true };
  }

  // Brown cards.
  if (card.defId === "bang") return playBang(room, current, idx, _targetId);
  if (card.defId === "beer") return playBeer(room, current, idx);
  if (card.defId === "stagecoach") return playDraw(room, current, idx, 2);
  if (card.defId === "wells-fargo") return playDraw(room, current, idx, 3);
  if (card.defId === "saloon") return playSaloon(room, current, idx);
  if (card.defId === "panic") return playPanic(room, current, idx, _targetId, targetCardId);
  if (card.defId === "cat-balou") return playCatBalou(room, current, idx, _targetId, targetCardId);
  if (card.defId === "indians") return playMulti(room, current, idx, "indians");
  if (card.defId === "gatling") return playMulti(room, current, idx, "gatling");
  if (card.defId === "duel") return playDuel(room, current, idx, _targetId);
  if (card.defId === "general-store") return playGeneralStore(room, current, idx);
  // Missed! is only playable as a reaction — except Calamity Janet may fire it as a Bang!.
  if (card.defId === "missed") {
    if (_targetId && canUseAs(current, card, "bang")) return playBang(room, current, idx, _targetId);
    return err("missed-is-reaction-only");
  }
  return err("card-not-implemented");
}

// Indians! / Gatling: open a simultaneous reaction for every other living player.
// Gatling also lets a defender's Barrel help (it is a Bang! effect).
function playMulti(room: Room, current: Player, handIdx: number, effect: "indians" | "gatling"): Result {
  const [played] = current.hand.splice(handIdx, 1);
  moveToDiscard(room, played);
  const targets = room.players.filter((p) => p.alive && p.id !== current.id);
  const responders = targets.map((p) => ({ id: p.id, done: false, safe: false }));
  // playCard's notify keys off a single targetId, which a multi doesn't have.
  for (const p of targets) {
    notify(room, p, { kind: "play", a: current.name, card: played.name, b: p.name });
  }
  room.checks = [];
  // Gatling: auto-Barrel each defender up front (Jourdonnais included).
  if (effect === "gatling") {
    targets.forEach((p, ti) => {
      const r = responders[ti];
      const attempts = barrelAttempts(p);
      for (let i = 0; i < attempts && !r.safe; i++) {
        const card = drawCheck(room, p, goodBarrel);
        const heart = !!card && card.suit === "hearts";
        const chk = { name: p.name, card, kind: "barrel", outcome: heart ? "hit" : "miss" };
        room.checks.push(chk);
        logCheck(room, chk);
        if (heart) { r.done = true; r.safe = true; }
      }
    });
  }
  room.pending = { kind: "multi", effect, sourceId: current.id, responders };
  if (responders.every((r) => r.done)) resolveMulti(room);
  return { ok: true };
}

// Duel: the target discards a Bang! first, then alternating; first to fail loses 1.
function playDuel(room: Room, current: Player, handIdx: number, targetId?: string): Result {
  const target = room.players.find((p) => p.id === targetId);
  if (!target || !target.alive || target.id === current.id) return err("invalid-target");
  if (activeEffect(room).protectSheriff && target.role === "sheriff") {
    return err("truce-protects-sheriff");
  }
  moveToDiscard(room, current.hand.splice(handIdx, 1)[0]);
  room.pending = { kind: "duel", aId: current.id, bId: target.id, turnId: target.id };
  return { ok: true };
}

// General Store: reveal one card per living player; each picks one in turn order.
// Split out from the card play so the Flea Market event can open a free round.
function openGeneralStore(room: Room, current: Player) {
  const alive = aliveBySeat(room);
  const start = alive.findIndex((p) => p.id === current.id);
  const from = start < 0 ? 0 : start;
  const order = alive.slice(from).concat(alive.slice(0, from)).map((p) => p.id); // current first, clockwise
  const cards: Card[] = [];
  for (let i = 0; i < order.length; i++) {
    const c = drawOne(room);
    if (c) cards.push(c);
  }
  if (cards.length === 0) return; // deck and discard both empty — nothing to offer
  // A drained deck can yield fewer cards than players; trim the pick order to
  // match, otherwise the last players would have nothing to choose and the
  // pending would never resolve.
  const pending: StorePending = { kind: "store", sourceId: current.id, cards, order: order.slice(0, cards.length) };
  room.pending = pending;
  settleStore(room, pending); // a one-card store off a drained deck needs no picking
}

type StorePending = Extract<Pending, { kind: "store" }>;

// Close out a General Store as far as it will go on its own.
//
// The last picker is never asked: one card and one player left is not a choice, so
// the card goes straight to them. Waiting on that tap held the whole table on a
// foregone conclusion — and it is the one pick where the "reveal" shows nothing,
// since everyone watched the other cards leave.
//
// Deliberately NOT a loop: picks are one card per picker, so settling one can only
// ever empty the store. Fewer cards than pickers (somebody left mid-store) still
// leaves a real choice and is left alone.
function settleStore(room: Room, pending: StorePending) {
  if (pending.order.length === 1 && pending.cards.length === 1) {
    const last = room.players.find((p) => p.id === pending.order[0]);
    if (last) {
      last.hand.push(pending.cards.shift()!);
      pending.order.shift();
    }
  }
  if (pending.order.length > 0) return;
  room.discard.push(...pending.cards);
  clearPending(room);
}

function playGeneralStore(room: Room, current: Player, handIdx: number): Result {
  moveToDiscard(room, current.hand.splice(handIdx, 1)[0]);
  openGeneralStore(room, current);
  return { ok: true };
}

// Callers splice the card out themselves; this only records where it went.
function moveToDiscard(room: Room, c: Card) {
  room.discard.push(c);
}

// Stagecoach / Wells Fargo: draw N cards.
function playDraw(room: Room, current: Player, handIdx: number, n: number): Result {
  moveToDiscard(room, current.hand.splice(handIdx, 1)[0]);
  for (let k = 0; k < n; k++) {
    const c = drawOne(room);
    if (c) current.hand.push(c);
  }
  return { ok: true };
}

// Saloon: every living player heals 1 (capped at their max).
function playSaloon(room: Room, current: Player, handIdx: number): Result {
  if (activeEffect(room).noHeal) return err("event-forbids-heal");
  moveToDiscard(room, current.hand.splice(handIdx, 1)[0]);
  for (const p of room.players) healPlayer(room, p, 1);
  return { ok: true };
}

// Pick which card to take/discard from a target: a chosen equipment card, else a
// random card from their hand (hidden), else a random equipment card.
function pickTargetCard(target: Player, targetCardId?: string): { from: "hand" | "equipment"; index: number } | null {
  if (targetCardId) {
    const ei = target.equipment.findIndex((c) => c.id === targetCardId);
    if (ei >= 0) return { from: "equipment", index: ei };
  }
  if (target.hand.length > 0) return { from: "hand", index: Math.floor(Math.random() * target.hand.length) };
  if (target.equipment.length > 0) return { from: "equipment", index: Math.floor(Math.random() * target.equipment.length) };
  return null;
}



// Open the "somebody is taking your card" acknowledgement. Shared by Panic!, Cat Balou
// and Jesse Jones, because from the victim's seat the three are the same event.
//
// The card is picked HERE rather than on acknowledgement: the dialog names it, and
// re-rolling afterwards would let the message and the outcome disagree.
function openTaken(
  room: Room,
  taker: Player,
  victim: Player,
  mode: "take" | "toss",
  // The card being played, for the log line respond() writes later. Absent for Jesse
  // Jones — his steal is a draw phase, not a play, and logs as one.
  playName: string | undefined,
  targetCardId?: string,
  thenDraw?: number
): boolean {
  const pick = pickTargetCard(victim, targetCardId);
  if (!pick) return false;
  const pile = pick.from === "hand" ? victim.hand : victim.equipment;
  const card = pile[pick.index];
  if (!card) return false;
  room.pending = {
    kind: "taken",
    takerId: taker.id,
    victimId: victim.id,
    mode,
    cardId: card.id,
    fromHand: pick.from === "hand",
    // A card face-up on the table is public, so naming it tells the victim nothing they
    // could not already see. One out of their hand stays unnamed — not to hide it from
    // them (it is their own card) but because "1 lá bất kỳ" is what actually happened.
    cardName: pick.from === "equipment" ? card.name : undefined,
    playName,
    thenDraw,
  };
  return true;
}

// Panic!: take a card from a player at distance 1 into your hand.
function playPanic(room: Room, current: Player, handIdx: number, targetId?: string, targetCardId?: string): Result {
  const target = room.players.find((p) => p.id === targetId);
  if (!target) return err("invalid-target");
  const problem = targetProblem(room, current, "panic", target);
  if (problem) return { ok: false, error: problem };
  // Spend the played card first either way: it has been played, publicly, whatever the
  // victim does next. Only the card coming BACK waits on them.
  if (!openTaken(room, current, target, "take", CARD_DEF_BY_ID.panic.name, targetCardId)) return err("target-has-no-cards");
  moveToDiscard(room, current.hand.splice(handIdx, 1)[0]);
  return { ok: true };
}

// Cat Balou: force any player to discard a card (any distance).
function playCatBalou(room: Room, current: Player, handIdx: number, targetId?: string, targetCardId?: string): Result {
  const target = room.players.find((p) => p.id === targetId);
  if (!target) return err("invalid-target");
  const problem = targetProblem(room, current, "cat-balou", target);
  if (problem) return { ok: false, error: problem };
  if (!openTaken(room, current, target, "toss", CARD_DEF_BY_ID["cat-balou"].name, targetCardId)) return err("target-has-no-cards");
  moveToDiscard(room, current.hand.splice(handIdx, 1)[0]);
  return { ok: true };
}

// Carry out what the acknowledgement was holding back. Returns the card that moved, so
// the caller can log it; null if it vanished from under the dialog (the victim
// surrendered, which discards their whole holding).
function resolveTaken(room: Room, p: Extract<Pending, { kind: "taken" }>): Card | null {
  const taker = room.players.find((x) => x.id === p.takerId);
  const victim = room.players.find((x) => x.id === p.victimId);
  if (!taker || !victim) return null;
  const pile = p.fromHand ? victim.hand : victim.equipment;
  const i = pile.findIndex((c) => c.id === p.cardId);
  if (i < 0) return null;
  const card = pile.splice(i, 1)[0];
  if (p.mode === "toss") moveToDiscard(room, card);
  else taker.hand.push(card);
  return card;
}

// Fire a Bang! at a target. The Bang!/turn budget was already checked upstream in
// playBlock — here the shot is spent and a reaction window opens for the target.
function playBang(room: Room, current: Player, handIdx: number, targetId?: string): Result {
  let target = room.players.find((p) => p.id === targetId);
  if (!target) return err("invalid-target");
  const problem = targetProblem(room, current, "bang", target);
  if (problem) return { ok: false, error: problem };
  const eff = activeEffect(room);
  // Drunk: the shot goes wide — it lands on a random valid target instead. "Valid"
  // is the same predicate the aimed shot went through, so a drunk shot can never
  // land somewhere a sober one could not.
  if (eff.drunkAim) {
    const candidates = legalTargetIds(room, current, "bang");
    if (candidates.length) {
      const id = candidates[Math.floor(Math.random() * candidates.length)];
      target = room.players.find((p) => p.id === id) ?? target;
    }
  }
  const [c] = current.hand.splice(handIdx, 1);
  room.discard.push(c);
  room.bangsThisTurn += 1;
  // Prediction: the shot is recorded where it was AIMED, after drunkAim has had its say.
  // Whether the target then dodges is not the shooter's choice, and reading the choice is
  // what a "who will they shoot" guess is about. Gatling/Indians never land here — they
  // aim at nobody, which is why a turn spent on one reads as shooting nobody.
  room.turnShotIds.push(target.id);
  const missedNeeded = Math.max(
    1,
    1 + (charEffect(current).missedNeededDelta ?? 0) + (eff.missedNeededDelta ?? 0)
  );
  const pending = {
    kind: "bang" as const,
    targetId: target.id,
    sourceId: current.id,
    missedNeeded,
    missedPlayed: 0,
  };
  room.pending = pending;
  room.checks = [];

  // Barrel: each Barrel (plus Jourdonnais' innate one) may Draw! exactly ONCE
  // (per the card: "cannot Draw! twice"). Each Heart counts as one Missed!, so
  // vs Slab the Killer (2 needed) a lone Barrel can supply at most 1 — the target
  // still needs a real Missed!. Stop as soon as the hit is fully dodged.
  const barrels = barrelAttempts(target);
  if (barrels > 0) {
    room.checks = [];
    for (let i = 0; i < barrels && pending.missedPlayed < pending.missedNeeded; i++) {
      const card = drawCheck(room, target, goodBarrel);
      const heart = !!card && card.suit === "hearts";
      const chk = { name: target.name, card, kind: "barrel", outcome: heart ? "hit" : "miss" };
      room.checks.push(chk);
      logCheck(room, chk);
      if (heart) pending.missedPlayed += 1;
    }
    if (pending.missedPlayed >= pending.missedNeeded) clearPending(room); // fully dodged
  }
  return { ok: true };
}

// Play Beer proactively (only on your own turn) to heal 1, capped at max HP.
function playBeer(room: Room, current: Player, handIdx: number): Result {
  if (current.hp >= current.maxHp) return err("hp-full");
  const [c] = current.hand.splice(handIdx, 1);
  room.discard.push(c);
  // Happy Hour makes a Beer worth 2 life points.
  healPlayer(room, current, activeEffect(room).beerHeal ?? 1);
  return { ok: true };
}

export function discardCard(code: string, playerId: string, cardId: string): boolean {
  const room = rooms.get(code);
  if (!room || room.phase !== "playing" || room.pending) return false;
  const current = room.players[room.turnIndex];
  if (!current || current.id !== playerId || room.turnPhase === "draw") return false;
  const idx = current.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return false;
  // Tính TRƯỚC khi splice: sau splice thì hand.length đã đổi và mọi lần bỏ bài đều trông như
  // tự nguyện. `forced` là thứ phân biệt hy sinh với việc bị luật giới hạn tay bắt bỏ.
  const forced = current.hand.length > handLimitOf(room, current);
  const [card] = current.hand.splice(idx, 1);
  room.discard.push(card);
  mission(room, { t: "discard", actor: current, defId: card.defId, forced });
  pushLog(room, { kind: "discard", a: current.name, n: 1 });
  return true;
}

// End the turn: only allowed after drawing and once the hand is within the
// life-point limit. Advances to the next living player, who starts by drawing.
export function endTurn(code: string, playerId: string): Result {
  const room = rooms.get(code);
  if (!room || room.phase !== "playing") return { ok: false };
  if (room.pending) return err("waiting-for-reaction");
  const current = room.players[room.turnIndex];
  if (!current || current.id !== playerId) return { ok: false };
  if (room.turnPhase === "draw") return err("must-draw-first");
  const limit = handLimitOf(room, current);
  if (current.hand.length > limit) {
    return err("hand-over-limit", { n: current.hand.length - limit });
  }
  // A ghost's turn ends with it back in the ground. handLimitOf already answered with
  // the whole hand for a ghost, so the check above never stood in the way of that.
  if (current.ghost) layGhostDown(room, current);
  // Before the hand-off: this turn is over, so anything staked on it can be judged.
  // playsThisTurn and turnShotIds are both still intact here — beginTurn clears them.
  // Trước hand-off: beginTurn xoá playedDefsThisTurn và playsThisTurn, mà 6 nhiệm vụ đọc
  // chính chúng. Sau advanceToNextSeat thì cả hai đã sạch và 6 nhiệm vụ đó chết âm thầm.
  mission(room, {
    t: "turnEnd",
    actor: current,
    plays: room.playsThisTurn,
    playedDefIds: [...room.playedDefsThisTurn],
  });
  judgePredictions(room, current);
  if (!advanceToNextSeat(room)) return { ok: false };
  beginTurn(room);
  return { ok: true };
}

// Detach a surrendering player from any active pending so the table doesn't stall.
// Key participants (shooter/target/duelist/store picker/kit) clear the pending;
// a multi defender is just marked done (undefended) so the multi can resolve.
function detachFromPending(room: Room, id: string) {
  const p = room.pending;
  if (!p) return;
  switch (p.kind) {
    case "bang": if (p.targetId === id || p.sourceId === id) clearPending(room); break;
    case "dying": if (p.targetId === id) clearPending(room); break;
    case "duel": if (p.aId === id || p.bId === id) clearPending(room); break;
    case "kit": if (p.playerId === id) { clearPending(room); room.turnPhase = "play"; } break;
    // Nobody else can dismiss someone's reveal, so a quitter would strand it. The
    // turn hand-off is surrender()'s job (it was their turn either way).
    case "check": if (p.playerId === id) clearPending(room); break;
    // A quitter must never strand the card. RESOLVE rather than drop: the taker played
    // for it, and Jesse's turn is parked in the draw phase behind this — dropping it
    // would leave him unable to draw or to play. resolveTaken copes with the card
    // already being gone, which is what a surrendering victim does to their own hand.
    case "taken":
      if (p.victimId === id || p.takerId === id) {
        resolveTaken(room, p);
        const { thenDraw, takerId } = p;
        clearPending(room);
        if (thenDraw !== undefined) {
          const jesse = room.players.find((x) => x.id === takerId);
          if (jesse && thenDraw > 0) drawInto(room, jesse.hand, thenDraw);
          room.turnPhase = "play";
        }
      }
      break;
    case "store":
      p.order = p.order.filter((o) => o !== id);
      settleStore(room, p);
      break;
    case "multi":
      if (p.sourceId === id) clearPending(room);
      else { const r = p.responders.find((x) => x.id === id); if (r) { r.done = true; r.safe = false; } }
      break;
  }
}

// A player concedes: remove them from the game (cards to discard, role revealed),
// resolve any pending they were part of, re-check the win, and pass the turn on if
// it was theirs.
export function surrender(code: string, playerId: string): Result {
  const room = rooms.get(code);
  if (!room || room.phase !== "playing") return { ok: false };
  const p = room.players.find((x) => x.id === playerId);
  if (!p || !p.alive) return { ok: false };

  const wasTurn = room.players[room.turnIndex]?.id === p.id;
  if (room.upkeepFor === p.id) room.upkeepFor = null; // don't resume a quitter's turn
  pushLog(room, { kind: "surrender", a: p.name, role: p.role ?? undefined });
  detachFromPending(room, p.id);
  killPlayer(room, p, null); // no killer → no death rewards/penalties
  checkWin(room);
  if (room.phase === "playing") {
    if (room.pending?.kind === "multi" && room.pending.responders.every((r) => r.done)) resolveMulti(room);
    processDeathQueue(room);
    if (wasTurn && room.phase === "playing" && !room.pending && advanceToNextSeat(room)) beginTurn(room);
  }
  return { ok: true };
}

// Move the turn to the next SEAT, following `turnDir` (the Reverse event flips it) and
// marking the round boundary that schedules events.
//
// The next seat, not the next living player: a dead one still gets its slot, because
// that is where it flips for a ghost turn (see beginTurn). Nothing else changes — a
// seat that fails its flip is handed straight on, so from the living players' side the
// order is exactly what it always was.
// --- turn prediction (lib/predictions.ts, engine half in ./predictions) ---
//
// Two hooks carry the whole feature, because advanceToNextSeat is the ONE funnel every
// hand-off runs through — a played turn, a Jail sentence, a ghost that failed its flip,
// an upkeep death. So: endTurn JUDGES (and clears) the stakes on the seat it is closing,
// and advanceToNextSeat VOIDS whatever is still outstanding for the seat it is leaving.
// A played turn therefore finds nothing left to void, and a skipped turn can only reach
// the void path — no "was this turn actually played" flag needed anywhere.

function advanceToNextSeat(room: Room): boolean {
  const n = room.players.length;
  const leaving = room.players[room.turnIndex];
  if (n === 0) return false;
  // Anything still staked on the seat we are leaving means its turn never resolved —
  // endTurn would have judged and cleared it. Skipped seat: throw the stakes away.
  if (leaving) voidPredictionsFor(room, leaving.id);
  const idx = (room.turnIndex + room.turnDir + n * n) % n;
  room.turnIndex = idx;
  // Cleared here rather than in endTurn: every hand-off funnels through this
  // function, including a turn lost to Jail.
  if (leaving) leaving.inbox = [];
  markRoundBoundary(room);
  return true;
}

// A round ends when play returns to whoever opened it. Death no longer loses that
// marker — every seat comes around every round now, ghost turns included — so the only
// thing that can strand it is the starter LEAVING the room, which splices them out of
// players[] altogether.
//
// That "returns to the opener" test only holds because a lap is a lap in EITHER
// direction: n hand-offs the other way come back to the same seat. What it cannot
// survive is the direction changing mid-lap, which is why Reverse now runs the whole
// round and is put back here, at the boundary itself — see openRound below.
function markRoundBoundary(room: Room) {
  const cur = room.players[room.turnIndex];
  if (!cur) return;
  const starter = room.players.find((p) => p.id === room.roundStarterId);
  if (!starter) {
    room.roundStarterId = cur.id;
    openRound(room);
    return;
  }
  if (cur.id === starter.id) openRound(room);
}

// The round closes here and the next one is queued. The hand-off that led here was
// the old round's last, so it rightly used the old direction; everything from now on
// belongs to the new round, which starts from the table's normal direction again. A
// Reverse in the batch about to roll then flips a direction that is genuinely normal
// rather than cancelling the one it set last round.
function openRound(room: Room) {
  room.roundEventDue = true;
  if (room.turnDirRestore == null) return;
  room.turnDir = room.turnDirRestore;
  room.turnDirRestore = null;
}

// The living player to the left (next in play order) of `p` — Dynamite follows the
// current play direction, so Reverse turns the fuse around too.
function leftNeighbor(room: Room, p: Player): Player | null {
  const alive = aliveBySeat(room);
  const i = alive.findIndex((x) => x.id === p.id);
  if (i < 0 || alive.length < 2) return null;
  return alive[(i + room.turnDir + alive.length) % alive.length];
}

// A Draw!: flip the top card to discard and return it. Lucky Duke flips two and
// keeps the more favorable (per the `isGood` predicate for this check).
function drawCheck(room: Room, drawer?: Player, isGood?: (c: Card) => boolean): Card | null {
  const first = drawOne(room);
  if (!first) return null;
  const eff = activeEffect(room);
  const isLuckyDuke = !!charEffect(drawer).luckyDraw;
  // Lucky Duke (or a Lucky Table event) flips two and keeps the better card; Bad
  // Weather flips two and keeps the worse one. Lucky Duke's own skill beats the
  // weather rather than cancelling out with it.
  const lucky = isLuckyDuke || !!eff.luckyDraw;
  const cursed = !!eff.badDraw && !isLuckyDuke && !eff.luckyDraw;
  if (lucky || cursed) {
    const second = drawOne(room);
    room.discard.push(first);
    if (second) room.discard.push(second);
    if (second && isGood) {
      if (lucky) {
        if (isGood(first)) return first;
        if (isGood(second)) return second;
      } else {
        if (!isGood(first)) return first;
        if (!isGood(second)) return second;
      }
    }
    return first;
  }
  room.discard.push(first);
  return first;
}

// Predicates: what makes a Draw! favorable for the drawer.
const goodJail = (c: Card) => c.suit === "hearts"; // released
const goodDynamite = (c: Card) => !(c.suit === "spades" && c.rank >= 2 && c.rank <= 9); // no blast
const goodBarrel = (c: Card) => c.suit === "hearts"; // counts as Missed!

// A dead seat flips for the right to rise for one turn. The first flip after dying
// needs a Heart; every one after that takes a Heart or a Diamond, and the door stops
// widening there — so a player is waiting about two and a half rounds for a ghost turn,
// not the four a flat 25% would cost them.
//
// Non-blocking on purpose: the reveal goes into room.checks and the log for everyone to
// see, but it opens no pending. A flip the whole table had to dismiss would charge six
// living players for a coin toss that concerns one dead one.
function ghostFlip(room: Room, p: Player): boolean {
  // Nobody home. A ghost turn is a turn somebody has to steer, and with no turn timers
  // anywhere a seat whose player has closed the tab would hold the table for good. Not
  // counted as a miss either — they are not declining to rise, they are simply away.
  if (!p.connected) return false;
  const wide = p.ghostMisses > 0;
  const rises = (c: Card) => c.suit === "hearts" || (wide && c.suit === "diamonds");
  const card = drawCheck(room, p, rises);
  const up = !!card && rises(card);
  const chk = { name: p.name, card, kind: "ghost", outcome: up ? "rise" : "stay" };
  room.checks.push(chk);
  logCheck(room, chk);
  if (!up) {
    p.ghostMisses += 1;
    return false;
  }
  p.ghost = true;
  p.ghostMisses = 0;
  return true;
}

// The end of a ghost turn: it lies back down and everything it drew or put in front of
// itself goes to the discard with it. Not a death — nobody killed it, so no bounty, no
// Sheriff penalty, and Vulture Sam inherits nothing (killPlayer already emptied these
// hands once, when they actually died).
function layGhostDown(room: Room, p: Player) {
  room.discard.push(...p.hand, ...p.equipment);
  p.hand = [];
  p.equipment = [];
  p.ghost = false;
  p.inbox = [];
  pushLog(room, { kind: "ghost", a: p.name });
}

// Start-of-turn upkeep: resolve Dynamite then Jail for the active player (and any
// players skipped by Jail), then leave them in the draw phase — unless Jail makes
// them skip, in which case play passes on. NOT synchronous: a fatal Dynamite IS
// saveable, so upkeep can stop mid-way waiting for a Beer — the rest is parked in
// room.upkeepFor and picked up by resumeUpkeep().
// `resuming` picks a turn's upkeep back up after it was interrupted mid-way by a
// Beer prompt (see upkeepFor). It must NOT re-run the once-per-turn bookkeeping:
// ticking the event timers a second time would burn two turns off a 3-turn
// sandstorm, and wiping `checks` would erase the Dynamite reveal the players are
// still being shown.
function beginTurn(room: Room, resuming = false) {
  if (!resuming) {
    room.checks = [];
    // Turn-scope events end here; lasting/curse timers tick exactly once per call,
    // so a turn skipped by Jail doesn't burn two turns off a 3-turn sandstorm.
    tickEvents(room);
  }
  // Jail passes the turn on from inside this loop. A Jail is discarded as it
  // resolves so it cannot repeat, but cap the hand-offs at one full lap anyway —
  // spinning here would hang the server outright and the guard costs nothing.
  let handOffs = 0;
  while (room.phase === "playing") {
    // Two laps' worth: a lap of seats that stayed in their graves, and a lap of Jail
    // sentences on top of it.
    if (handOffs++ > room.players.length * 2) {
      // Everyone is skipped: force the next LIVING player to play rather than hang. It
      // has to be a living one — parking a turn on a seat that is dead and not risen
      // would leave a player who cannot act holding a turn nobody can take off them.
      const idx = room.players.findIndex((p) => p.alive);
      if (idx < 0) return;
      room.turnIndex = idx;
      room.turnPhase = "draw";
      pushLog(room, { kind: "turn", a: room.players[idx].name });
      return;
    }
    const cur = room.players[room.turnIndex];
    if (!cur) return;
    room.bangsThisTurn = 0;
    room.playsThisTurn = 0;
    room.playedDefsThisTurn = [];
    room.turnShotIds = [];
    room.jailedTurn = false;

    // --- This round's event: rolled as the round opens (the Sheriff's turn), before
    // any upkeep, so it also colours that turn's Dynamite/Jail Draw! checks. ---
    //
    // Never rolled on a dead seat: the round's weather belongs to the living, and an
    // event handed a dead "opener" would be picking its General Store order and its
    // minAlive eligibility off somebody who isn't at the table. The flag stays up and
    // the next living seat rolls it, so a ghost turn plays under the weather that was
    // already out — which is also the honest reading, since the ghost is finishing the
    // round it died in.
    if (room.roundEventDue && cur.alive) {
      room.roundEventDue = false;
      rollRoundEvents(room, cur);
      if (room.phase !== "playing") return; // an event ended the game
      if (!cur.alive) {
        // The event killed whoever was about to play — pass the turn on.
        if (!advanceToNextSeat(room)) return;
        continue;
      }
    }

    // --- A dead seat: flip for the right to rise (house rule) ---
    if (!cur.alive) {
      if (!ghostFlip(room, cur)) {
        if (!advanceToNextSeat(room)) return;
        continue;
      }
      // Up. No upkeep to run — killPlayer emptied their equipment and everything a
      // ghost puts down goes with it at the end of the turn, so there is never a
      // Dynamite or a Jail waiting on a seat that just rose.
      room.turnCounter += 1;
      room.turnPhase = "draw";
      pushLog(room, { kind: "turn", a: cur.name });
      return;
    }

    // Did upkeep flip anything in front of this player? Only then is there something
    // to hold the turn for — a clean turn must not make anyone dismiss an empty box.
    let revealed = false;
    // Park the turn on the reveal. Returns true when the caller must return: the
    // player now owes an acknowledgement before anything else happens.
    const gate = (resume: "stay" | "skip") => {
      if (!revealed || room.pending || room.phase !== "playing") return false;
      room.pending = { kind: "check", playerId: cur.id, resume };
      return true;
    };

    // --- Dynamite ---
    const dyn = cur.equipment.find((c) => c.defId === "dynamite");
    if (dyn) {
      revealed = true;
      const card = drawCheck(room, cur, goodDynamite);
      const exploded = !!card && card.suit === "spades" && card.rank >= 2 && card.rank <= 9;
      const chk = { name: cur.name, card, kind: "dynamite", outcome: exploded ? "blast" : "safe" };
      room.checks.push(chk);
      logCheck(room, chk);
      cur.equipment = cur.equipment.filter((c) => c.id !== dyn.id);
      if (exploded) {
        room.discard.push(dyn);
        // Saveable: Beer DOES rescue you from a fatal Dynamite, both in the official
        // rules and per the note printed on our own Beer card. The engine used to
        // pass saveable=false, so anyone who blew up at <=3 hp died without even
        // being asked, while holding the Beer the card text promised would save them.
        applyDamage(room, cur, 3, null, true, dyn.playedBy ?? null);
        // They can survive on Beer — stop here and wait for the answer. The rest of
        // their upkeep (Jail, then the draw phase) has not run yet, so it must be
        // picked up again by resumeUpkeep() once the pending clears.
        if (room.pending) {
          room.upkeepFor = cur.id;
          return;
        }
        if (!cur.alive) {
          if (room.phase !== "playing") return; // game ended
          // Blown up. They still get to see the card that did it before the table
          // moves on without them; the turn passes when they dismiss it.
          if (gate("skip")) return;
          if (!advanceToNextSeat(room)) return;
          continue; // run the next player's upkeep
        }
      } else {
        // Pass to the left, unless they already hold a Dynamite (then it stays).
        const left = leftNeighbor(room, cur);
        if (left && !left.equipment.some((c) => c.defId === "dynamite")) left.equipment.push(dyn);
        else cur.equipment.push(dyn);
      }
    }

    // --- Jail ---
    const jail = cur.equipment.find((c) => c.defId === "jail");
    if (jail) {
      revealed = true;
      const card = drawCheck(room, cur, goodJail);
      const released = !!card && card.suit === "hearts";
      const chk = { name: cur.name, card, kind: "jail", outcome: released ? "free" : "skip" };
      room.checks.push(chk);
      logCheck(room, chk);
      cur.equipment = cur.equipment.filter((c) => c.id !== jail.id);
      room.discard.push(jail);
      if (!released) {
        // Serving the sentence. The turn is lost — no draw, no cards played — but
        // it is still THEIR turn, so the hand limit applies exactly as it would at
        // the end of any turn: discard down to hp, then it passes. Previously the
        // turn was handed straight on, which let a jailed player sit on a full hand
        // indefinitely and made Jail a way to PROTECT a hand from the limit.
        if (cur.hand.length > handLimitOf(room, cur)) {
          room.jailedTurn = true;
          room.turnPhase = "discard";
          pushLog(room, { kind: "turn", a: cur.name });
          // The turn state is already what it needs to be; the gate only withholds
          // input until they have seen why they are discarding instead of playing.
          gate("stay");
          return;
        }
        // Sentence served with nothing to discard: the only thing left is showing
        // them the card that cost them the turn, then handing it on.
        if (gate("skip")) return;
        if (!advanceToNextSeat(room)) return;
        continue;
      }
    }

    room.turnCounter += 1;

    room.turnPhase = "draw";
    pushLog(room, { kind: "turn", a: cur.name });
    // Survived the Dynamite, or walked out of Jail: the turn is theirs and already
    // set up, so this only holds the draw until they have seen the card.
    gate("stay");
    return;
  }
}

// Hand control back to a turn whose upkeep stopped half-done waiting on a Beer
// answer. Called from every place a `dying` pending can clear, because the turn is
// otherwise left in limbo: no Jail check, no turn phase, no `turn` log line.
function resumeUpkeep(room: Room) {
  const id = room.upkeepFor;
  if (!id || room.pending || room.phase !== "playing") return;
  room.upkeepFor = null;
  const p = room.players.find((x) => x.id === id);
  if (!p) return;
  if (p.alive) {
    // Survived on Beer: carry on with their own turn. The Dynamite is already gone
    // from their equipment, so re-entering can't explode it twice.
    beginTurn(room, true);
  } else if (advanceToNextSeat(room)) {
    // Took the death: the turn was theirs, so it has to move on to the next player.
    beginTurn(room);
  }
}

// --- reactions, damage, death, win ---

function clearPending(room: Room) {
  room.pending = null;
}

const hasHandCard = (p: Player, defId: string, cardId?: string) =>
  p.hand.findIndex((c) => c.defId === defId && (cardId ? c.id === cardId : true));


// A player replies to the active pending. `type` meaning depends on the pending.
export function respond(
  code: string,
  playerId: string,
  type: "missed" | "beer" | "bang" | "pass",
  cardId?: string
): Result {
  const room = rooms.get(code);
  if (!room || !room.pending) return { ok: false };
  const pending = room.pending;

  // --- Check reveal: only the player it happened to may dismiss it ---
  if (pending.kind === "check") {
    if (playerId !== pending.playerId) return err("not-your-reaction");
    if (type !== "pass") return { ok: false };
    const { resume } = pending;
    clearPending(room);
    // "stay" left the turn fully set up and merely blocked; "skip" still owes the
    // hand-off that the reveal was holding back.
    if (resume === "skip" && advanceToNextSeat(room)) beginTurn(room);
    return { ok: true };
  }

  // --- Somebody taking your card: only the victim may wave it through ---
  if (pending.kind === "taken") {
    if (playerId !== pending.victimId) return err("not-your-reaction");
    if (type !== "pass") return { ok: false };
    const taker = room.players.find((x) => x.id === pending.takerId);
    const victim = room.players.find((x) => x.id === pending.victimId);
    const moved = resolveTaken(room, pending);
    const { thenDraw, playName } = pending;
    clearPending(room);
    if (taker && victim && moved) {
      // Logged HERE, not when the card was played: the whole scene reads the log, so a
      // line written at play time would have the arms reaching while the dialog was
      // still up and the card had not moved.
      const entry = playName
        ? { kind: "play" as const, a: taker.name, card: playName, b: victim.name }
        : { kind: "draw" as const, a: taker.name, b: victim.name, n: 1 + (thenDraw ?? 0), took: 1 };
      pushLog(room, entry);
      notify(room, victim, entry);
    }
    // Jesse Jones: the rest of his draw phase was waiting behind this.
    if (thenDraw !== undefined) {
      if (thenDraw > 0) drawInto(room, taker?.hand ?? [], thenDraw);
      room.turnPhase = "play";
    }
    return { ok: true };
  }

  // --- Bang!: target dodges with Missed!(s) or takes the hit ---
  if (pending.kind === "bang") {
    if (playerId !== pending.targetId) return err("not-your-reaction");
    const target = room.players.find((p) => p.id === pending.targetId)!;
    if (type === "missed") {
      const idx = target.hand.findIndex((c) => c.id === cardId && canUseAs(target, c, "missed"));
      if (idx < 0) return err("no-valid-card", { s: "Missed!" });
      // Slab the Killer needs 2 Missed!: don't let a target burn a Missed! it can't
      // complete the dodge with (it would lose the card AND still take the hit).
      const remaining = pending.missedNeeded - pending.missedPlayed;
      const available = target.hand.filter((c) => canUseAs(target, c, "missed")).length;
      if (available < remaining) return err("need-more-missed", { n: pending.missedNeeded });
      room.discard.push(target.hand.splice(idx, 1)[0]);
      pushLog(room, { kind: "react", a: target.name, card: "Missed!" });
      pending.missedPlayed += 1;
      if (pending.missedPlayed >= pending.missedNeeded) clearPending(room); // dodged
      return { ok: true };
    }
    if (type === "pass") {
      clearPending(room);
      applyDamage(room, target, 1, pending.sourceId);
      if (room.phase === "playing") processDeathQueue(room);
      return { ok: true };
    }
    return { ok: false };
  }

  // --- Dying: play Beer(s) to survive, or pass to accept death ---
  if (pending.kind === "dying") {
    if (playerId !== pending.targetId) return err("not-your-reaction");
    const target = room.players.find((p) => p.id === pending.targetId)!;
    if (type === "beer") {
      const idx = hasHandCard(target, "beer", cardId);
      if (idx < 0) return err("card-not-in-hand");
      room.discard.push(target.hand.splice(idx, 1)[0]);
      // NOT healPlayer: this is the one heal that must not clamp at maxHp, because it starts
      // from 0 or below. deathQueue.needed already counted exactly how many Beers it takes to
      // reach 1, so clamping here would leave a dying player unable to come back and strand
      // the queue on a pending nothing can resolve.
      target.hp += 1;
      pushLog(room, { kind: "heal", a: target.name, n: 1 });
      pending.beersNeeded -= 1;
      if (pending.beersNeeded <= 0) {
        clearPending(room);
        processDeathQueue(room);
        resumeUpkeep(room); // their own turn may still be waiting to be set up
      }
      return { ok: true };
    }
    if (type === "pass") {
      clearPending(room);
      killPlayer(room, target, pending.sourceId, pending.creditId ?? null);
      checkWin(room);
      if (room.phase === "playing") processDeathQueue(room);
      resumeUpkeep(room); // if it was their turn, it has to move on
      return { ok: true };
    }
    return { ok: false };
  }

  // --- Multi (Indians!/Gatling): each responder defends or takes 1 ---
  if (pending.kind === "multi") {
    const r = pending.responders.find((x) => x.id === playerId);
    if (!r || r.done) return err("not-your-reaction");
    const me = room.players.find((p) => p.id === playerId)!;
    const need = pending.effect === "indians" ? "bang" : "missed";
    if (type === need) {
      const idx = me.hand.findIndex((c) => c.id === cardId && canUseAs(me, c, need));
      if (idx < 0) return err("no-valid-card", { s: need === "bang" ? "Bang!" : "Missed!" });
      room.discard.push(me.hand.splice(idx, 1)[0]);
      pushLog(room, { kind: "react", a: me.name, card: need === "bang" ? "Bang!" : "Missed!" });
      r.done = true;
      r.safe = true;
    } else if (type === "pass") {
      r.done = true;
      r.safe = false;
    } else {
      return { ok: false };
    }
    if (pending.responders.every((x) => x.done)) resolveMulti(room);
    return { ok: true };
  }

  // --- Duel: alternate discarding Bang!; first to pass loses 1 ---
  if (pending.kind === "duel") {
    if (playerId !== pending.turnId) return err("not-your-duel-turn");
    const me = room.players.find((p) => p.id === playerId)!;
    if (type === "bang") {
      const idx = me.hand.findIndex((c) => c.id === cardId && canUseAs(me, c, "bang"));
      if (idx < 0) return err("no-valid-card", { s: "Bang!" });
      room.discard.push(me.hand.splice(idx, 1)[0]);
      pushLog(room, { kind: "react", a: me.name, card: "Bang!" });
      pending.turnId = pending.turnId === pending.aId ? pending.bId : pending.aId; // pass back
      return { ok: true };
    }
    if (type === "pass") {
      const loser = room.players.find((p) => p.id === pending.turnId)!;
      const srcId = pending.turnId === pending.aId ? pending.bId : pending.aId;
      clearPending(room);
      applyDamage(room, loser, 1, srcId);
      if (room.phase === "playing") processDeathQueue(room);
      return { ok: true };
    }
    return { ok: false };
  }

  return { ok: false };
}

// Pick a card: General Store (turn order) or Kit Carlson (top-3 selection).
export function choose(code: string, playerId: string, cardId: string): Result {
  const room = rooms.get(code);
  if (!room || !room.pending) return { ok: false };

  if (room.pending.kind === "store") {
    const pending = room.pending;
    if (pending.order[0] !== playerId) return err("not-your-pick");
    const ci = pending.cards.findIndex((c) => c.id === cardId);
    if (ci < 0) return err("invalid-card");
    const picker = room.players.find((p) => p.id === playerId)!;
    picker.hand.push(pending.cards.splice(ci, 1)[0]);
    pending.order.shift();
    settleStore(room, pending);
    return { ok: true };
  }

  if (room.pending.kind === "kit") {
    const pending = room.pending;
    if (pending.playerId !== playerId) return err("not-your-turn");
    const ci = pending.cards.findIndex((c) => c.id === cardId);
    if (ci < 0) return err("invalid-card");
    const kit = room.players.find((p) => p.id === playerId)!;
    kit.hand.push(pending.cards.splice(ci, 1)[0]);
    pending.picksLeft -= 1;
    if (pending.picksLeft <= 0) {
      room.deck.unshift(...pending.cards); // remaining card(s) to the deck bottom
      clearPending(room);
      room.turnPhase = "play";
    }
    return { ok: true };
  }

  return { ok: false };
}

export function sidHeal(code: string, playerId: string, cardIds: string[]): Result {
  const room = rooms.get(code);
  if (!room || room.phase !== "playing") return { ok: false };
  // Sid Ketchum may discard 2 cards to regain 1 life AT ANY TIME — on or off his
  // turn, and even while dying (to save himself). So no turn/phase/pending gate.
  const sid = room.players.find((p) => p.id === playerId);
  if (!sid || !sid.alive) return { ok: false };
  if (!charEffect(sid).burnTwoToHeal) return err("ability-unavailable");
  if (activeEffect(room).noHeal) return err("event-forbids-heal");
  if (sid.hp >= sid.maxHp) return err("hp-full");
  if (cardIds.length !== 2 || cardIds[0] === cardIds[1]) return err("pick-two-distinct");
  const idxs = cardIds.map((id) => sid.hand.findIndex((c) => c.id === id));
  if (idxs.some((i) => i < 0)) return err("card-not-in-hand");
  for (const id of cardIds) {
    const i = sid.hand.findIndex((c) => c.id === id);
    room.discard.push(sid.hand.splice(i, 1)[0]);
  }
  healPlayer(room, sid, 1);
  pushLog(room, { kind: "heal", a: sid.name, n: 1 });
  // If he was dying and this brought him back above 0, he survives — resolve.
  if (room.pending?.kind === "dying" && room.pending.targetId === sid.id && sid.hp > 0) {
    clearPending(room);
    processDeathQueue(room);
    resumeUpkeep(room);
  }
  return { ok: true };
}

// Resolve a multi (Indians!/Gatling): each undefended responder takes 1 damage;
// lethal hits with an available Beer queue up for a dying window.
function resolveMulti(room: Room) {
  if (!room.pending || room.pending.kind !== "multi") return;
  const responders = room.pending.responders;
  const srcId = room.pending.sourceId;
  clearPending(room);
  for (const r of responders) {
    if (r.safe) continue;
    const t = room.players.find((x) => x.id === r.id);
    if (!t || !t.alive) continue;
    dealDamage(room, t, 1, srcId);
    if (t.hp <= 0) {
      room.deathQueue.push({ id: t.id, needed: 1 - t.hp, sourceId: srcId, creditId: null, saveable: true });
    }
  }
  checkWin(room);
  if (room.phase === "playing") processDeathQueue(room);
}

// Open dying windows one at a time for queued lethal hits; kill anyone who can't
// (or no longer can) be saved.
function processDeathQueue(room: Room) {
  while (room.deathQueue.length) {
    if (room.phase !== "playing") { room.deathQueue = []; return; }
    const entry = room.deathQueue[0];
    const t = room.players.find((x) => x.id === entry.id);
    if (!t || !t.alive || t.hp > 0) { room.deathQueue.shift(); continue; }
    // Sid Ketchum can also turn two cards into the life point that saves him, so
    // "can be saved" is not just a Beer count.
    const canSave =
      entry.saveable &&
      (beersInHand(t) >= entry.needed ||
        (!!charEffect(t).burnTwoToHeal && t.hand.length >= 2 * entry.needed));
    if (canSave) {
      room.pending = {
        kind: "dying",
        targetId: t.id,
        sourceId: entry.sourceId,
        creditId: entry.creditId,
        beersNeeded: entry.needed,
      };
      room.deathQueue.shift();
      return; // wait for this player's response
    }
    killPlayer(room, t, entry.sourceId, entry.creditId);
    checkWin(room);
    room.deathQueue.shift();
  }
}

// Apply damage; if it drops the target to <=0 HP, open a dying window if they
// can still be saved by Beer, otherwise kill them.
// Decrement HP and apply on-damage side effects (hit log, Bart Cassidy draw,
// El Gringo steal). Does NOT resolve death — the caller decides how to handle
// dropping to <=0 HP. Shared by single hits and multi (Indians!/Gatling) so
// those effects fire no matter how the life point is lost.
function dealDamage(room: Room, target: Player, amount: number, sourceId: string | null) {
  const eff = activeEffect(room);
  // Nothing reaches a ghost — it is already dead, and its turn ends when the turn ends
  // rather than when somebody shoots it. Nobody can aim at one (targetProblem needs a
  // living target, and every multi filters the living), so the only way in is a Duel a
  // ghost started and lost. Logged as a zero, like a Ceasefire, so the table sees the
  // shot go straight through instead of the duel just stopping.
  if (target.ghost) {
    pushLog(room, { kind: "hit", a: target.name, n: 0, hp: 0 });
    return;
  }
  // Ceasefire nullifies damage outright.
  if (eff.noDamage) {
    pushLog(room, { kind: "hit", a: target.name, n: 0, hp: target.hp });
    return;
  }
  amount = Math.max(0, amount + (eff.damageDelta ?? 0)); // Wartime and friends
  if (amount === 0) return;
  target.hp -= amount;
  const hit = { kind: "hit" as const, a: target.name, n: amount, hp: Math.max(0, target.hp) };
  pushLog(room, hit);
  const src = sourceId ? room.players.find((p) => p.id === sourceId) : null;
  // Their own Dynamite or an event has no attacker to report, and self-inflicted
  // damage is not something anyone needs telling about.
  if (src && src.id !== target.id) notify(room, target, hit);
  mission(room, { t: "damage", actor: src ?? null, target, n: amount });
  if (charEffect(target).drawOnDamage) drawInto(room, target.hand, amount);
  if (charEffect(target).stealOnDamage && src) {
    let took = 0;
    for (let i = 0; i < amount && src.hand.length > 0; i++) {
      target.hand.push(src.hand.splice(Math.floor(Math.random() * src.hand.length), 1)[0]);
      took++;
    }
    // Notifying the ATTACKER, not the victim: nothing in the shared log says their
    // hand just shrank, so from their seat cards vanish unexplained.
    if (took) notify(room, src, { kind: "draw", a: target.name, b: src.name, n: took, took });
  }
}

function applyDamage(
  room: Room,
  target: Player,
  amount: number,
  sourceId: string | null,
  saveable = true,
  // Indirect credit (Dynamite): earns the Outlaw bounty without counting as the
  // attacker. Kept separate from sourceId because sourceId also drives El Gringo's
  // steal, and El Gringo must NOT rob whoever's Dynamite happened to go off.
  creditId: string | null = null
) {
  dealDamage(room, target, amount, sourceId);
  // A ghost sits at 0 hp permanently; without this it would be queued for a death it
  // has already had on every hit that misses it.
  if (target.ghost || target.hp > 0) return;
  room.deathQueue.push({ id: target.id, needed: 1 - target.hp, sourceId, creditId, saveable });
  processDeathQueue(room);
}

// `creditId` is an INDIRECT kill: the player who set up the death without dealing
// the blow — today only whoever played the Dynamite that went off. It pays the
// bounty on an Outlaw and, per killPlayer, the Sheriff-kills-Deputy penalty too: the
// Sheriff is answerable for the Dynamite he put in play, whoever it goes off on
// Deputy, and it would be a nasty surprise to lose your whole hand to a card that
// drifted away from you long before it exploded.
function killPlayer(
  room: Room,
  target: Player,
  killerId: string | null = null,
  creditId: string | null = null
) {
  target.alive = false;
  target.hp = 0;
  // A fresh grave flips at a Heart again — the widened door belonged to the last one.
  target.ghost = false;
  target.ghostMisses = 0;
  pushLog(room, { kind: "death", a: target.name, role: target.role ?? undefined });
  const cards = [...target.hand, ...target.equipment];
  target.hand = [];
  target.equipment = [];
  // Vulture Sam: a living Sam takes all the dead player's cards instead of discard.
  const heir = room.players.find(
    (p) => p.alive && p.id !== target.id && charEffect(p).inheritsDeadCards
  );
  if (heir) heir.hand.push(...cards);
  else room.discard.push(...cards);

  // Death rewards / penalty for whoever landed the killing blow.
  const killer = killerId ? room.players.find((p) => p.id === killerId) : null;
  const usable = (p: Player | null | undefined) => (p && p.alive && p.id !== target.id ? p : null);
  // An indirect kill (the Dynamite you lit) counts exactly like landing the blow:
  // it earns the Outlaw bounty AND carries the Sheriff-kills-Deputy penalty. Losing
  // your whole hand to a card that drifted away from you turns ago is harsh, but
  // that is the intended rule here — the Sheriff is answerable for the Dynamite he
  // put in play, whoever it goes off on.
  const actor = usable(killer) ?? usable(creditId ? room.players.find((p) => p.id === creditId) : null);
  if (!actor) return;
  const draw3 = (p: Player) => {
    for (let i = 0; i < 3; i++) {
      const c = drawOne(room);
      if (c) p.hand.push(c);
    }
  };
  if (target.role === "outlaw") {
    draw3(actor);
  } else if (actor.role === "sheriff" && target.role === "deputy") {
    room.discard.push(...actor.hand, ...actor.equipment);
    actor.hand = [];
    actor.equipment = [];
  }
}

// Suzy Lafayette: any living Suzy left with an empty hand immediately draws one.
// Called after every resolved action (from the server broadcast).
export function refillEmptyHands(room: Room) {
  // Suzy draws the instant her hand is empty — even mid-duel / during a pending
  // reaction (so she isn't left defenceless in a duel).
  if (room.phase !== "playing") return;
  for (const p of room.players) {
    if (p.alive && charEffect(p).refillWhenEmpty && p.hand.length === 0) drawInto(room, p.hand, 1);
  }
}

function checkWin(room: Room) {
  const players = room.players;
  const sheriffAlive = players.some((p) => p.role === "sheriff" && p.alive);
  const alive = players.filter((p) => p.alive);

  let winner: Winner | null = null;
  if (!sheriffAlive) {
    // Renegade wins only if he is the sole survivor; otherwise the Outlaws win.
    winner = alive.length === 1 && alive[0].role === "renegade" ? "renegade" : "outlaws";
  } else {
    const outlawsDead = players.filter((p) => p.role === "outlaw").every((p) => !p.alive);
    const renegadesDead = players.filter((p) => p.role === "renegade").every((p) => !p.alive);
    if (outlawsDead && renegadesDead) winner = "sheriff";
  }

  if (winner) {
    clearPending(room);
    // No stake can be judged now — the turn it was about will never finish.
    room.predictions = [];
    room.winner = winner;
    room.phase = "result";
    // A ghost whose own turn ended the game goes back in the ground with it. Without
    // this the flag outlives the turn it belongs to: the result screen would show a
    // dead player standing at the table, still holding a hand.
    for (const p of room.players) if (p.ghost) layGhostDown(room, p);
    awardWins(room, winner);
  }
}

// One win per HUMAN on the winning side (bots don't count). The reward ticket is
// granted once, the first time somebody reaches the threshold, and the link then
// survives later games in the same room.
function awardWins(room: Room, winner: Winner) {
  const winningRoles: Role[] =
    winner === "sheriff" ? ["sheriff", "deputy"] : winner === "outlaws" ? ["outlaw"] : ["renegade"];
  for (const p of room.players) {
    if (p.isBot || !p.role || !winningRoles.includes(p.role)) continue;
    p.wins = (p.wins ?? 0) + 1;
    if (p.wins >= REWARD_WIN_THRESHOLD && !p.rewardTicket) {
      p.rewardTicket = buildEscapeRewardUrl();
    }
  }
}

export function restart(code: string): boolean {
  const room = rooms.get(code);
  if (!room) return false;
  clearBotTimer(room);
  clearPending(room);
  room.phase = "lobby";
  room.turnIndex = 0;
  room.turnPhase = "draw";
  room.jailedTurn = false;
  room.upkeepFor = null; // a half-finished upkeep must never survive into a new game
  room.bangsThisTurn = 0;
  room.playsThisTurn = 0;
  room.playedDefsThisTurn = [];
  room.winner = null;
  room.deathQueue = [];
  room.checks = [];
  room.deck = [];
  room.discard = [];
  room.predictions = [];
  room.turnShotIds = [];
  room.dealtMissionIds = [];
  room.missionFeed = [];
  room.players.forEach((p) => {
    p.missionId = null;
    p.missionProgress = 0;
    p.missionSeen = [];
    p.missionDone = false;
  });
  room.predictFeed = [];
  resetEventState(room);
  room.players.forEach((p) => {
    p.role = null;
    p.character = null;
    p.draftChoices = [];
    p.hasPicked = false;
    p.hp = 0;
    p.maxHp = 0;
    p.alive = true;
    p.hand = [];
    p.equipment = [];
    p.inbox = [];
  });
  return true;
}

// Play again: reset to the lobby and immediately start a fresh game with the same
// players (re-deal roles + character draft). Falls back to the lobby on error
// (e.g. someone left and the headcount is now invalid).
export function playAgain(code: string): Result {
  if (!restart(code)) return err("no-such-room");
  return startGame(code);
}

// --- view building (hidden-info filtering) ---





