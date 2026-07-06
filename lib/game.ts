// In-memory game engine for Bang! — room + character draft.
// Rooms live in a Map for the lifetime of the server process (no DB).
//
// SCOPE: room lifecycle, role dealing, and the character draft (deal 2 per
// player, 30s to pick 1, auto-pick by tier rank on timeout). The card deck and
// combat resolution are stubbed and will be implemented with the card rules.

import {
  Character,
  CheckView,
  CHARACTERS,
  DraftView,
  PendingView,
  Phase,
  PlayerPublic,
  PlayerView,
  PUBLIC_ROLES,
  rankPriority,
  Role,
  TurnPhase,
  Winner,
} from "./types";
import { buildDeck, Card, CARD_DEF_BY_ID } from "./cards";

// An unresolved reaction that locks the table until the target responds.
type Pending =
  | { kind: "bang"; targetId: string; sourceId: string; missedNeeded: number; missedPlayed: number; endsAt: number }
  | { kind: "dying"; targetId: string; sourceId: string | null; beersNeeded: number; endsAt: number };

// Reaction window (ms) for Bang!/dying responses.
export const REACTION_MS = 15_000;

export interface Player {
  id: string;
  name: string;
  socketId: string | null;
  isHost: boolean;
  connected: boolean;
  seat: number; // fixed clockwise seat index, assigned on join
  role: Role | null; // dealt at game start
  character: Character | null; // locked in after the draft
  draftChoices: Character[]; // the two candidates offered during the draft
  hasPicked: boolean; // draft: has locked a character
  hp: number;
  maxHp: number;
  alive: boolean;
  hand: Card[];
  equipment: Card[]; // blue cards in play (gun, Mustang, Scope, Jail, Dynamite...)
}

export interface Room {
  code: string;
  phase: Phase;
  players: Player[]; // kept in seat order
  hostId: string;
  turnIndex: number; // index into players[] whose turn it is (playing phase)
  turnPhase: TurnPhase; // sub-phase of the current player's turn
  bangsThisTurn: number; // Bang!s played by the active player this turn
  pending: Pending | null; // unresolved reaction locking the table
  pendingTimer: NodeJS.Timeout | null;
  winner: Winner | null; // set when the game ends
  checks: CheckView[]; // recent Draw! reveals (upkeep / Barrel), display-only
  draftEndsAt: number | null; // epoch ms deadline for the 30s pick window
  draftTimer: NodeJS.Timeout | null;
  deck: Card[]; // draw pile (top = end of array)
  discard: Card[]; // discard pile
}

const rooms = new Map<string, Room>();

// Bang! plays 4–7 in the base game. This room is capped at 7 as requested.
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 7;

// Each player is offered 2 characters to choose from, and has 30s to pick.
export const DRAFT_PER_PLAYER = 2;
export const DRAFT_MS = 30_000;

// Role distribution by player count (classic Bang! base game).
const ROLE_SETUP: Record<number, Role[]> = {
  4: ["sheriff", "renegade", "outlaw", "outlaw"],
  5: ["sheriff", "renegade", "outlaw", "outlaw", "deputy"],
  6: ["sheriff", "renegade", "outlaw", "outlaw", "outlaw", "deputy"],
  7: ["sheriff", "renegade", "outlaw", "outlaw", "outlaw", "deputy", "deputy"],
};

// --- helpers ---

function genCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (rooms.has(code));
  return code;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

// Public preview of the role distribution for a given headcount (shown in lobby).
export function roleSetupFor(n: number): { role: Role; count: number }[] {
  const setup = ROLE_SETUP[n];
  if (!setup) return [];
  const counts = new Map<Role, number>();
  for (const r of setup) counts.set(r, (counts.get(r) || 0) + 1);
  const order: Role[] = ["sheriff", "deputy", "outlaw", "renegade"];
  return order.filter((r) => counts.has(r)).map((role) => ({ role, count: counts.get(role)! }));
}

// --- room lifecycle ---

function newPlayer(name: string, socketId: string, isHost: boolean, seat: number): Player {
  return {
    id: genId(),
    name: name.trim().slice(0, 20) || "Người chơi",
    socketId,
    isHost,
    connected: true,
    seat,
    role: null,
    character: null,
    draftChoices: [],
    hasPicked: false,
    hp: 0,
    maxHp: 0,
    alive: true,
    hand: [],
    equipment: [],
  };
}

export function createRoom(name: string, socketId: string): { room: Room; player: Player } {
  const code = genCode();
  const player = newPlayer(name, socketId, true, 0);
  const room: Room = {
    code,
    phase: "lobby",
    players: [player],
    hostId: player.id,
    turnIndex: 0,
    turnPhase: "draw",
    bangsThisTurn: 0,
    pending: null,
    pendingTimer: null,
    winner: null,
    checks: [],
    draftEndsAt: null,
    draftTimer: null,
    deck: [],
    discard: [],
  };
  rooms.set(code, room);
  return { room, player };
}

export function addPlayer(
  code: string,
  name: string,
  socketId: string
): { ok: boolean; player?: Player; error?: string } {
  const room = rooms.get(code);
  if (!room) return { ok: false, error: "Phòng không tồn tại" };
  if (room.phase !== "lobby") return { ok: false, error: "Ván đang diễn ra, không thể vào" };
  if (room.players.length >= MAX_PLAYERS) return { ok: false, error: `Phòng đã đầy (tối đa ${MAX_PLAYERS})` };
  const seat = room.players.length;
  const player = newPlayer(name, socketId, false, seat);
  room.players.push(player);
  return { ok: true, player };
}

export function rejoin(code: string, playerId: string, socketId: string): { ok: boolean; error?: string } {
  const room = rooms.get(code);
  if (!room) return { ok: false, error: "Phòng không tồn tại" };
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: "Không tìm thấy người chơi" };
  player.socketId = socketId;
  player.connected = true;
  return { ok: true };
}

export function disconnect(socketId: string): Room | null {
  for (const room of rooms.values()) {
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) continue;
    player.connected = false;
    player.socketId = null;
    if (room.phase === "lobby") {
      room.players = room.players.filter((p) => p.id !== player.id);
      room.players.forEach((p, i) => (p.seat = i));
      if (room.players.length === 0) {
        clearDraftTimer(room);
        rooms.delete(room.code);
        return null;
      }
      if (player.isHost) {
        room.players[0].isHost = true;
        room.hostId = room.players[0].id;
      }
    }
    return room;
  }
  return null;
}

function clearDraftTimer(room: Room) {
  if (room.draftTimer) {
    clearTimeout(room.draftTimer);
    room.draftTimer = null;
  }
}

// --- game start / character draft ---

export function startGame(code: string): { ok: boolean; error?: string } {
  const room = rooms.get(code);
  if (!room) return { ok: false, error: "Phòng không tồn tại" };
  if (room.phase !== "lobby") return { ok: false, error: "Ván đã bắt đầu" };
  const n = room.players.length;
  if (n < MIN_PLAYERS) return { ok: false, error: `Cần tối thiểu ${MIN_PLAYERS} người` };
  if (n > MAX_PLAYERS) return { ok: false, error: `Tối đa ${MAX_PLAYERS} người` };
  const setup = ROLE_SETUP[n];
  if (!setup) return { ok: false, error: "Số người chơi không hợp lệ" };

  // Deal roles randomly to the seated players.
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
    p.hand = [];
  });

  room.phase = "drafting";
  room.draftEndsAt = Date.now() + DRAFT_MS;
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

// Called by the server timer when the 30s window expires: auto-pick for anyone
// who didn't choose, then start the game.
export function draftTimeout(code: string): boolean {
  const room = rooms.get(code);
  if (!room || room.phase !== "drafting") return false;
  for (const p of room.players) {
    if (!p.hasPicked) {
      p.character = autoPick(p.draftChoices);
      p.hasPicked = true;
    }
  }
  finalizeDraft(room);
  return true;
}

// Transition drafting -> playing: set HP from characters (Sheriff +1) and give
// the first turn to the Sheriff.
function finalizeDraft(room: Room) {
  clearDraftTimer(room);
  room.draftEndsAt = null;
  room.players.forEach((p) => {
    if (!p.character) p.character = autoPick(p.draftChoices); // safety net
    const bonus = p.role === "sheriff" ? 1 : 0;
    p.maxHp = p.character.maxHp + bonus;
    p.hp = p.maxHp;
    p.alive = true;
    p.hand = [];
    p.equipment = [];
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
  beginTurn(room); // Sheriff begins (runs upkeep if they somehow have blue cards)
}

// --- deck helpers ---

// Draw one card; reshuffle the discard pile into the deck if the deck is empty.
function drawOne(room: Room): Card | null {
  if (room.deck.length === 0) {
    if (room.discard.length === 0) return null;
    room.deck = shuffle(room.discard);
    room.discard = [];
  }
  return room.deck.pop() ?? null;
}

// --- distance & range ---

// Weapon range: the equipped gun's range, or 1 (Colt .45) if unarmed.
export function rangeOf(p: Player): number {
  let range = 1;
  for (const c of p.equipment) {
    const def = CARD_DEF_BY_ID[c.defId];
    if (def?.kind === "gun" && def.range) range = def.range;
  }
  return range;
}

// Does a player have a given blue card equipped (e.g. mustang / scope)?
function hasEquip(p: Player, defId: string): boolean {
  return p.equipment.some((c) => c.defId === defId);
}

// Distance the viewer `from` sees to player `to`, counting only living players
// around the circle. Mustang/Paul Regret add +1 to how far others see the
// target; Scope/Rose Doolan subtract 1 from what the viewer sees. Minimum 1.
export function distanceBetween(room: Room, from: Player, to: Player): number {
  if (from.id === to.id) return 0;
  const alive = [...room.players].sort((a, b) => a.seat - b.seat).filter((p) => p.alive);
  const i = alive.findIndex((p) => p.id === from.id);
  const j = alive.findIndex((p) => p.id === to.id);
  if (i < 0 || j < 0) return Infinity;
  const raw = Math.abs(i - j);
  let dist = Math.min(raw, alive.length - raw);

  // Target seen farther (Mustang, Paul Regret's ability).
  if (hasEquip(to, "mustang") || to.character?.id === "paul-regret") dist += 1;
  // Viewer sees farther/closer (Scope, Rose Doolan's ability).
  if (hasEquip(from, "scope") || from.character?.id === "rose-doolan") dist -= 1;

  return Math.max(1, dist);
}

// --- turn flow ---

// Draw phase: the active player draws their 2 cards, then may play.
export function drawCards(code: string, playerId: string): boolean {
  const room = rooms.get(code);
  if (!room || room.phase !== "playing" || room.turnPhase !== "draw") return false;
  if (room.pending) return false;
  const current = room.players[room.turnIndex];
  if (!current || current.id !== playerId) return false;
  for (let k = 0; k < 2; k++) {
    const c = drawOne(room);
    if (c) current.hand.push(c);
  }
  room.turnPhase = "play";
  return true;
}

// Play a card from the active player's hand.
// Step 2a scope: blue self-equipment (guns, Mustang, Scope, Barrel). Targeted
// blue cards (Jail/Dynamite) and brown cards are handled in later steps.
export function playCard(
  code: string,
  playerId: string,
  cardId: string,
  _targetId?: string,
  targetCardId?: string
): { ok: boolean; error?: string } {
  const room = rooms.get(code);
  if (!room || room.phase !== "playing") return { ok: false };
  if (room.pending) return { ok: false, error: "Đang chờ phản ứng" };
  const current = room.players[room.turnIndex];
  if (!current || current.id !== playerId) return { ok: false };
  if (room.turnPhase === "draw") return { ok: false, error: "Bạn phải rút bài trước" };
  const idx = current.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return { ok: false };
  const card = current.hand[idx];
  const def = CARD_DEF_BY_ID[card.defId];
  if (!def) return { ok: false };

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
      if (!target || !target.alive || target.id === current.id) return { ok: false, error: "Mục tiêu không hợp lệ" };
      if (target.role === "sheriff") return { ok: false, error: "Không thể bỏ tù Cảnh Sát Trưởng" };
      if (target.equipment.some((c) => c.defId === "jail")) return { ok: false, error: "Người này đã bị giam" };
      current.hand.splice(idx, 1);
      target.equipment.push(card);
      return { ok: true };
    }
    // Self-equip (Mustang / Scope / Barrel / Dynamite): at most one of each.
    if (hasEquip(current, card.defId)) return { ok: false, error: `Đã có ${def.name} trên bàn` };
    current.hand.splice(idx, 1);
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
  // Missed! is only playable as a reaction, not proactively.
  if (card.defId === "missed") return { ok: false, error: "Missed! chỉ dùng để phản ứng Bang!" };
  return { ok: false, error: "Lá này sẽ hỗ trợ ở bước sau" };
}

// Discard `card` from a player's hand or table.
function moveToDiscard(room: Room, c: Card) {
  room.discard.push(c);
}

// Stagecoach / Wells Fargo: draw N cards.
function playDraw(room: Room, current: Player, handIdx: number, n: number): { ok: boolean; error?: string } {
  moveToDiscard(room, current.hand.splice(handIdx, 1)[0]);
  for (let k = 0; k < n; k++) {
    const c = drawOne(room);
    if (c) current.hand.push(c);
  }
  return { ok: true };
}

// Saloon: every living player heals 1 (capped at their max).
function playSaloon(room: Room, current: Player, handIdx: number): { ok: boolean; error?: string } {
  moveToDiscard(room, current.hand.splice(handIdx, 1)[0]);
  for (const p of room.players) {
    if (p.alive) p.hp = Math.min(p.maxHp, p.hp + 1);
  }
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

// Panic!: take a card from a player at distance 1 into your hand.
function playPanic(room: Room, current: Player, handIdx: number, targetId?: string, targetCardId?: string): { ok: boolean; error?: string } {
  const target = room.players.find((p) => p.id === targetId);
  if (!target || !target.alive || target.id === current.id) return { ok: false, error: "Mục tiêu không hợp lệ" };
  if (distanceBetween(room, current, target) > 1) return { ok: false, error: "Chỉ lấy được của người ở khoảng cách 1" };
  const pick = pickTargetCard(target, targetCardId);
  if (!pick) return { ok: false, error: "Mục tiêu không có bài" };
  moveToDiscard(room, current.hand.splice(handIdx, 1)[0]);
  const taken = pick.from === "hand" ? target.hand.splice(pick.index, 1)[0] : target.equipment.splice(pick.index, 1)[0];
  current.hand.push(taken);
  return { ok: true };
}

// Cat Balou: force any player to discard a card (any distance).
function playCatBalou(room: Room, current: Player, handIdx: number, targetId?: string, targetCardId?: string): { ok: boolean; error?: string } {
  const target = room.players.find((p) => p.id === targetId);
  if (!target || !target.alive) return { ok: false, error: "Mục tiêu không hợp lệ" };
  const pick = pickTargetCard(target, targetCardId);
  if (!pick) return { ok: false, error: "Mục tiêu không có bài" };
  moveToDiscard(room, current.hand.splice(handIdx, 1)[0]);
  const gone = pick.from === "hand" ? target.hand.splice(pick.index, 1)[0] : target.equipment.splice(pick.index, 1)[0];
  moveToDiscard(room, gone);
  return { ok: true };
}

// Play Bang! at a target: check the 1-per-turn limit and range, discard the
// card, then open a reaction window for the target.
function playBang(room: Room, current: Player, handIdx: number, targetId?: string): { ok: boolean; error?: string } {
  const target = room.players.find((p) => p.id === targetId);
  if (!target || !target.alive || target.id === current.id) return { ok: false, error: "Mục tiêu không hợp lệ" };
  const unlimited = hasEquip(current, "volcanic") || current.character?.id === "willy-the-kid";
  if (!unlimited && room.bangsThisTurn >= 1) {
    return { ok: false, error: "Chỉ 1 Bang!/lượt (trừ Volcanic/Willy)" };
  }
  if (distanceBetween(room, current, target) > rangeOf(current)) {
    return { ok: false, error: "Mục tiêu ngoài tầm bắn" };
  }
  const [c] = current.hand.splice(handIdx, 1);
  room.discard.push(c);
  room.bangsThisTurn += 1;
  const missedNeeded = current.character?.id === "slab-the-killer" ? 2 : 1;
  const pending = {
    kind: "bang" as const,
    targetId: target.id,
    sourceId: current.id,
    missedNeeded,
    missedPlayed: 0,
    endsAt: Date.now() + REACTION_MS,
  };
  room.pending = pending;
  room.checks = [];

  // Barrel: auto Draw! — a Heart counts as one Missed!.
  if (hasEquip(target, "barrel")) {
    const card = drawCheck(room);
    const heart = !!card && card.suit === "hearts";
    room.checks = [{ name: target.name, card, kind: "barrel", outcome: heart ? "Barrel né được!" : "Barrel trượt" }];
    if (heart) {
      pending.missedPlayed += 1;
      if (pending.missedPlayed >= pending.missedNeeded) clearPending(room); // fully dodged
    }
  }
  return { ok: true };
}

// Play Beer proactively (only on your own turn) to heal 1, capped at max HP.
function playBeer(room: Room, current: Player, handIdx: number): { ok: boolean; error?: string } {
  if (current.hp >= current.maxHp) return { ok: false, error: "Máu đã đầy" };
  const [c] = current.hand.splice(handIdx, 1);
  room.discard.push(c);
  current.hp = Math.min(current.maxHp, current.hp + 1);
  return { ok: true };
}

// Discard a card from the active player's hand to the discard pile.
export function discardCard(code: string, playerId: string, cardId: string): boolean {
  const room = rooms.get(code);
  if (!room || room.phase !== "playing" || room.pending) return false;
  const current = room.players[room.turnIndex];
  if (!current || current.id !== playerId || room.turnPhase === "draw") return false;
  const idx = current.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return false;
  const [card] = current.hand.splice(idx, 1);
  room.discard.push(card);
  return true;
}

// End the turn: only allowed after drawing and once the hand is within the
// life-point limit. Advances to the next living player, who starts by drawing.
export function endTurn(code: string, playerId: string): { ok: boolean; error?: string } {
  const room = rooms.get(code);
  if (!room || room.phase !== "playing") return { ok: false };
  if (room.pending) return { ok: false, error: "Đang chờ phản ứng" };
  const current = room.players[room.turnIndex];
  if (!current || current.id !== playerId) return { ok: false };
  if (room.turnPhase === "draw") return { ok: false, error: "Bạn phải rút bài trước" };
  if (current.hand.length > current.hp) {
    return { ok: false, error: `Bỏ bớt ${current.hand.length - current.hp} lá (giới hạn = máu)` };
  }
  if (!advanceToNextAlive(room)) return { ok: false };
  beginTurn(room);
  return { ok: true };
}

// Move the turn to the next living player (by seat, wrapping). Returns false if
// nobody living is found.
function advanceToNextAlive(room: Room): boolean {
  const n = room.players.length;
  for (let step = 1; step <= n; step++) {
    const idx = (room.turnIndex + step) % n;
    if (room.players[idx].alive) {
      room.turnIndex = idx;
      return true;
    }
  }
  return false;
}

// The living player to the left (next in play order) of `p`.
function leftNeighbor(room: Room, p: Player): Player | null {
  const alive = [...room.players].sort((a, b) => a.seat - b.seat).filter((x) => x.alive);
  const i = alive.findIndex((x) => x.id === p.id);
  if (i < 0 || alive.length < 2) return null;
  return alive[(i + 1) % alive.length];
}

// A Draw!: flip the top card to the discard pile and return it.
function drawCheck(room: Room): Card | null {
  const c = drawOne(room);
  if (c) room.discard.push(c);
  return c;
}

// Start-of-turn upkeep: resolve Dynamite then Jail for the active player (and any
// players skipped by Jail), then leave them in the draw phase — unless Jail makes
// them skip, in which case play passes on. Fully synchronous (no reaction window,
// since Dynamite damage cannot be saved by Beer in this variant).
function beginTurn(room: Room) {
  room.checks = [];
  while (room.phase === "playing") {
    const cur = room.players[room.turnIndex];
    if (!cur) return;
    room.bangsThisTurn = 0;

    // --- Dynamite ---
    const dyn = cur.equipment.find((c) => c.defId === "dynamite");
    if (dyn) {
      const card = drawCheck(room);
      const exploded = !!card && card.suit === "spades" && card.rank >= 2 && card.rank <= 9;
      room.checks.push({ name: cur.name, card, kind: "dynamite", outcome: exploded ? "Nổ! −3 máu" : "An toàn" });
      cur.equipment = cur.equipment.filter((c) => c.id !== dyn.id);
      if (exploded) {
        room.discard.push(dyn);
        applyDamage(room, cur, 3, null, false); // unsaveable: Beer can't cancel Dynamite
        if (!cur.alive) {
          if (room.phase !== "playing") return; // game ended
          if (!advanceToNextAlive(room)) return;
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
      const card = drawCheck(room);
      const released = !!card && card.suit === "hearts";
      room.checks.push({ name: cur.name, card, kind: "jail", outcome: released ? "Thoát tù" : "Bỏ lượt" });
      cur.equipment = cur.equipment.filter((c) => c.id !== jail.id);
      room.discard.push(jail);
      if (!released) {
        if (!advanceToNextAlive(room)) return;
        continue; // skipped turn — next player's upkeep
      }
    }

    room.turnPhase = "draw";
    return;
  }
}

// --- reactions, damage, death, win ---

function clearPending(room: Room) {
  room.pending = null;
  if (room.pendingTimer) {
    clearTimeout(room.pendingTimer);
    room.pendingTimer = null;
  }
}

// The target of a pending replies: play a Missed! / Beer, or pass (take it).
export function respond(
  code: string,
  playerId: string,
  type: "missed" | "beer" | "pass",
  cardId?: string
): { ok: boolean; error?: string } {
  const room = rooms.get(code);
  if (!room || !room.pending) return { ok: false };
  const pending = room.pending;
  if (playerId !== pending.targetId) return { ok: false, error: "Không phải lượt phản ứng của bạn" };
  const target = room.players.find((p) => p.id === pending.targetId);
  if (!target) return { ok: false };

  if (pending.kind === "bang") {
    if (type === "missed") {
      const idx = target.hand.findIndex((c) => c.id === cardId && c.defId === "missed");
      if (idx < 0) return { ok: false, error: "Không có Missed! đó" };
      const [c] = target.hand.splice(idx, 1);
      room.discard.push(c);
      pending.missedPlayed += 1;
      if (pending.missedPlayed >= pending.missedNeeded) clearPending(room); // dodged
      return { ok: true };
    }
    if (type === "pass") {
      clearPending(room);
      applyDamage(room, target, 1, pending.sourceId);
      return { ok: true };
    }
    return { ok: false };
  }

  // dying: play Beer(s) to climb back to 1 HP, or pass to accept death.
  if (type === "beer") {
    const idx = target.hand.findIndex((c) => c.id === cardId && c.defId === "beer");
    if (idx < 0) return { ok: false, error: "Không có Beer đó" };
    const [c] = target.hand.splice(idx, 1);
    room.discard.push(c);
    target.hp += 1;
    pending.beersNeeded -= 1;
    if (pending.beersNeeded <= 0) clearPending(room); // survived
    return { ok: true };
  }
  if (type === "pass") {
    clearPending(room);
    killPlayer(room, target);
    checkWin(room);
    return { ok: true };
  }
  return { ok: false };
}

// Timer callback when a reaction window expires (take the hit / accept death).
export function pendingTimeout(code: string): boolean {
  const room = rooms.get(code);
  if (!room || !room.pending) return false;
  const pending = room.pending;
  const target = room.players.find((p) => p.id === pending.targetId);
  clearPending(room);
  if (!target) return true;
  if (pending.kind === "bang") {
    applyDamage(room, target, 1, pending.sourceId);
  } else {
    killPlayer(room, target);
    checkWin(room);
  }
  return true;
}

// Apply damage; if it drops the target to <=0 HP, open a dying window if they
// can still be saved by Beer, otherwise kill them.
function applyDamage(room: Room, target: Player, amount: number, sourceId: string | null, saveable = true) {
  target.hp -= amount;
  if (target.hp > 0) return;
  const needed = 1 - target.hp; // Beers required to reach 1 HP
  const beers = target.hand.filter((c) => c.defId === "beer").length;
  // Dynamite damage (saveable=false) cannot be cancelled by Beer.
  if (saveable && beers >= needed) {
    room.pending = { kind: "dying", targetId: target.id, sourceId, beersNeeded: needed, endsAt: Date.now() + REACTION_MS };
  } else {
    killPlayer(room, target);
    checkWin(room);
  }
}

function killPlayer(room: Room, target: Player) {
  target.alive = false;
  target.hp = 0;
  room.discard.push(...target.hand, ...target.equipment);
  target.hand = [];
  target.equipment = [];
  // Death rewards (draw 3 on killing an Outlaw; Sheriff-kills-Deputy penalty)
  // and character death triggers are handled in a later step.
}

// Evaluate win conditions; if met, set the winner and end the game.
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
    room.winner = winner;
    room.phase = "result";
  }
}

export function restart(code: string): boolean {
  const room = rooms.get(code);
  if (!room) return false;
  clearDraftTimer(room);
  clearPending(room);
  room.phase = "lobby";
  room.turnIndex = 0;
  room.turnPhase = "draw";
  room.bangsThisTurn = 0;
  room.winner = null;
  room.checks = [];
  room.draftEndsAt = null;
  room.deck = [];
  room.discard = [];
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
  });
  return true;
}

// --- view building (hidden-info filtering) ---

function visibleRole(p: Player, room: Room): Role | null {
  if (!p.role) return null;
  if (room.phase === "result") return p.role; // all roles revealed at the end
  if (PUBLIC_ROLES.includes(p.role)) return p.role;
  if (!p.alive) return p.role;
  return null;
}

function toPublic(p: Player, room: Room, viewer: Player | undefined, turnId: string | null): PlayerPublic {
  // Characters are public once the game is underway; during the draft, nobody
  // sees anyone else's options or pick.
  const inGame = room.phase === "playing" || room.phase === "result";
  const characterPublic = inGame ? p.character : null;
  const distance =
    room.phase === "playing" && viewer && viewer.alive && p.alive && p.id !== viewer.id
      ? distanceBetween(room, viewer, p)
      : null;
  return {
    id: p.id,
    name: p.name,
    seat: p.seat,
    isHost: p.isHost,
    connected: p.connected,
    alive: p.alive,
    hp: p.hp,
    maxHp: p.maxHp,
    handCount: p.hand.length,
    character: characterPublic,
    hasPicked: p.hasPicked,
    role: visibleRole(p, room),
    isTurn: turnId != null && p.id === turnId,
    distance,
    equipment: inGame ? p.equipment : [],
  };
}

function buildDraft(room: Room, me: Player | undefined): DraftView {
  return {
    endsAt: room.draftEndsAt,
    choices: me?.draftChoices ?? [],
    youPicked: me?.hasPicked ?? false,
    yourPick: me?.character ?? null,
    pickedCount: room.players.filter((p) => p.hasPicked).length,
    totalCount: room.players.length,
    waitingFor: room.players.filter((p) => !p.hasPicked).map((p) => p.name),
  };
}

function buildPending(room: Room, me: Player | undefined): PendingView | null {
  const p = room.pending;
  if (!p) return null;
  const target = room.players.find((x) => x.id === p.targetId);
  const source = p.kind === "bang" ? room.players.find((x) => x.id === p.sourceId) : undefined;
  const youAreTarget = !!me && me.id === p.targetId;
  const base = {
    kind: p.kind,
    targetId: p.targetId,
    targetName: target?.name ?? "",
    sourceName: source?.name ?? "",
    endsAt: p.endsAt,
    youAreTarget,
  };
  if (p.kind === "bang") {
    return {
      ...base,
      missedNeeded: p.missedNeeded,
      missedPlayed: p.missedPlayed,
      canMissed: youAreTarget && !!me?.hand.some((c) => c.defId === "missed"),
    };
  }
  return { ...base, canBeer: youAreTarget && !!me?.hand.some((c) => c.defId === "beer") };
}

// Build the personalized view for one player: they always see their OWN role,
// character and hand; for everyone else only public info is exposed.
export function buildView(room: Room, playerId: string): PlayerView {
  const me = room.players.find((p) => p.id === playerId);
  const turnPlayer = room.phase === "playing" ? room.players[room.turnIndex] : null;
  const turnId = turnPlayer ? turnPlayer.id : null;
  const isMyTurn = !!(me && turnPlayer && turnPlayer.id === me.id);
  const bySeat = [...room.players].sort((a, b) => a.seat - b.seat);

  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    you: {
      id: me?.id ?? "",
      name: me?.name ?? "",
      seat: me?.seat ?? 0,
      isHost: me?.isHost ?? false,
      role: me?.role ?? null,
      character: me?.character ?? null,
      hp: me?.hp ?? 0,
      maxHp: me?.maxHp ?? 0,
      hand: me?.hand ?? [],
      equipment: me?.equipment ?? [],
      alive: me?.alive ?? true,
      turnPhase: isMyTurn ? room.turnPhase : null,
      range: me ? rangeOf(me) : 1,
    },
    players: bySeat.map((p) => toPublic(p, room, me, turnId)),
    turnSeat: turnPlayer ? turnPlayer.seat : null,
    roleSetup: roleSetupFor(room.players.length),
    draft: room.phase === "drafting" ? buildDraft(room, me) : null,
    pending: buildPending(room, me),
    winner: room.winner,
    checks: room.checks,
    deckCount: room.deck.length,
    discardCount: room.discard.length,
  };
}
