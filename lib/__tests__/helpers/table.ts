// Deterministic board builder for the engine tests.
//
// lib/game.ts shuffles with Math.random and offers no seam to inject a seed, so the
// tests do not try to control the shuffle: they let a real game start, then overwrite
// the Room — which getRoom() hands back mutable — into the exact position under test.

import * as game from "../../game";
import type { Card, Suit } from "../../cards";
import { CARD_DEF_BY_ID } from "../../cards";
import { CHARACTERS, type Character } from "../../types";
import { predictWindowMs } from "../../predictions";

// Every character in CHARACTERS has an ability, and the draft deals two of them at
// random. Left alone, a Bang! test would fail whenever somebody happened to draw
// Jourdonnais — a failure that moves between runs, which is the worst kind a suite
// can have. So the table seats a character that does nothing, and a test that wants
// an ability asks for it by name.
const PLAIN: Character = {
  id: "test-plain",
  name: "Plain",
  rank: null,
  maxHp: 4,
  effect: {},
};

let cardSeq = 0;
let sockSeq = 0;

// disconnect() scans every room for a socket id, so ids must never repeat across
// tables or one test's teardown would reach into another test's room.
export const sock = () => `sock${++sockSeq}`;

export function card(defId: string, suit: Suit, rank: number): Card {
  const def = CARD_DEF_BY_ID[defId];
  if (!def) throw new Error(`unknown card def: ${defId}`);
  return { id: `t${++cardSeq}`, defId, name: def.name, suit, rank };
}

export function hand(p: game.Player, ...cards: Card[]) {
  p.hand = cards;
}

export function equip(p: game.Player, ...cards: Card[]) {
  p.equipment = cards;
}

// Cards are given in the order they will be drawn. The engine takes them off the END
// of room.deck (finalizeDraft deals with `splice(-hp, hp)`), so the array is reversed
// here — a test that had to remember that would silently assert the wrong direction.
export function stackDeck(room: game.Room, ...cards: Card[]) {
  room.deck = [...cards].reverse();
}

// Swap in a real character and recompute life, since maxHp comes from it (+1 Sheriff).
export function setCharacter(room: game.Room, p: game.Player, characterId: string) {
  const found = CHARACTERS.find((c) => c.id === characterId);
  if (!found) throw new Error(`unknown character: ${characterId}`);
  p.character = found;
  p.maxHp = found.maxHp + (p.role === "sheriff" ? 1 : 0);
  p.hp = p.maxHp;
}

// Hand the turn to a specific seat, ready to play (past the draw phase).
export function turnTo(room: game.Room, p: game.Player) {
  room.turnIndex = room.players.indexOf(p);
  room.turnPhase = "play";
  room.pending = null;
  room.bangsThisTurn = 0;
  room.playsThisTurn = 0;
  room.playedDefsThisTurn = [];
  // A turn opening also opens the prediction window — beginTurn does this in the engine, in
  // the same block as the resets above. Without it every test that hands the turn over would
  // inherit a shut window and silently refuse any guess it then tried to stake.
  room.predictEndsAt = Date.now() + predictWindowMs(room.players.filter((x) => !x.alive).length);
}

export interface Table {
  code: string;
  room: game.Room;
  players: game.Player[];
  sheriff: game.Player;
}

// A game in progress: n seated, plain characters, full life, empty hands, empty deck.
// Tests fill in only what they care about, so nothing dealt at random can reach them.
export function startTable(n = 4): Table {
  const { room } = game.createRoom("P0", sock());
  for (let i = 1; i < n; i++) game.addPlayer(room.code, `P${i}`, sock());

  const started = game.startGame(room.code);
  if (!started.ok) throw new Error(`startGame failed: ${JSON.stringify(started.error)}`);
  // Before the draft closes, not after: finalizeDraft ends by calling beginTurn, which
  // rolls the opening round's events. Left on, that hands out random guns and reshuffles
  // the deck inside the harness — the tests would then pass or fail by the weather.
  game.setEventLevel(room.code, "off");
  // Nhiệm vụ phụ tắt, cùng lý do và cùng chỗ với events: chúng hoàn thành một cách TÌNH CỜ
  // trong lúc test làm việc khác, rồi phần thưởng drawInto ăn mất đúng lá bài mà test đã
  // stack — và test sẽ pass hay fail theo thời tiết. Test nhiệm vụ bật lại bằng withMissions().
  room.missionsOn = false;
  // startGame only reaches the draft. finalizeDraft — which deals the cards and flips
  // the phase to "playing" — runs off the last pick, so every seat has to choose.
  for (const p of room.players) game.pickCharacter(room.code, p.id, p.draftChoices[0].id);

  // Roles are dealt by a shuffle, which would make players[1] the Sheriff on some
  // runs and an Outlaw on others — and the Sheriff carries an extra life point, so
  // any test asserting damage would pass or fail by luck. Seat them in the canonical
  // order instead; a test that cares about a particular role overwrites p.role.
  const roles = game.roleSetupFor(room.players.length).flatMap(({ role, count }) => Array(count).fill(role));
  room.players.forEach((p, i) => (p.role = roles[i]));

  for (const p of room.players) {
    p.character = PLAIN;
    p.maxHp = PLAIN.maxHp + (p.role === "sheriff" ? 1 : 0);
    p.hp = p.maxHp;
    p.hand = [];
    p.equipment = [];
    p.alive = true;
    p.ghost = false;
    p.ghostMisses = 0;
  }
  room.deck = [];
  room.discard = [];
  room.checks = [];
  room.pending = null;
  room.events = [];
  room.roundEventDue = false;

  const sheriff = room.players.find((p) => p.role === "sheriff")!;
  turnTo(room, sheriff);
  return { code: room.code, room, players: room.players, sheriff };
}

// Kill a seat outright, without routing through damage — for setting up the board
// states (distance across a corpse, win conditions) rather than testing death itself.
export function kill(p: game.Player) {
  p.hp = 0;
  p.alive = false;
  p.hand = [];
  p.equipment = [];
}

// Bật nhiệm vụ và gán một nhiệm vụ CỤ THỂ cho một ghế. Gán tay chứ không qua dealMissions:
// một test về `all-in` không được phụ thuộc vào việc pickMissions có bốc đúng nó hay không.
export function withMission(room: game.Room, p: game.Player, missionId: string) {
  room.missionsOn = true;
  p.missionId = missionId;
  p.missionProgress = 0;
  p.missionSeen = [];
  p.missionDone = false;
}
