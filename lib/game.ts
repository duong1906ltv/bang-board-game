// In-memory game engine for Bang! — ROOM layer.
// Rooms live in a Map for the lifetime of the server process (no DB).
//
// SCOPE: room lifecycle + seating + role dealing + turn order for up to 7
// players. The card deck, character abilities and combat resolution are stubbed
// and will be implemented once the concrete rules/characters are provided.

import {
  Card,
  Phase,
  PlayerPublic,
  PlayerView,
  PUBLIC_ROLES,
  Role,
} from "./types";

export interface Player {
  id: string;
  name: string;
  socketId: string | null;
  isHost: boolean;
  connected: boolean;
  seat: number; // fixed clockwise seat index, assigned on join
  role: Role | null; // dealt at game start
  characterName: string | null; // assigned once characters are provided
  hp: number;
  maxHp: number;
  alive: boolean;
  hand: Card[]; // stays empty until the card layer lands
}

export interface Room {
  code: string;
  phase: Phase;
  players: Player[]; // kept in seat order
  hostId: string;
  turnIndex: number; // index into players[] whose turn it is (playing phase)
}

const rooms = new Map<string, Room>();

// Bang! plays 4–7 in the base game. This room is capped at 7 as requested.
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 7;

// Placeholder base life until characters (which set real HP) are provided.
// The Sheriff always gets +1 life point in Bang!.
const BASE_HP = 4;

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
  // Stable, meaningful order.
  const order: Role[] = ["sheriff", "deputy", "outlaw", "renegade"];
  return order
    .filter((r) => counts.has(r))
    .map((role) => ({ role, count: counts.get(role)! }));
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
    characterName: null,
    hp: 0,
    maxHp: 0,
    alive: true,
    hand: [],
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
  const seat = room.players.length; // next open seat
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
    // Only remove players (and reseat) while still in the lobby; mid-game we keep
    // the seat so they can rejoin.
    if (room.phase === "lobby") {
      room.players = room.players.filter((p) => p.id !== player.id);
      room.players.forEach((p, i) => (p.seat = i)); // re-pack seats
      if (room.players.length === 0) {
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

// --- game start / turn flow ---

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
  room.players.forEach((p, i) => {
    p.role = roles[i];
    // Placeholder HP until characters are provided; Sheriff gets +1.
    p.maxHp = BASE_HP + (roles[i] === "sheriff" ? 1 : 0);
    p.hp = p.maxHp;
    p.alive = true;
    p.characterName = null; // set when characters land
    p.hand = []; // dealt when the card layer lands
  });

  // The Sheriff always takes the first turn.
  const sheriffIdx = room.players.findIndex((p) => p.role === "sheriff");
  room.turnIndex = sheriffIdx >= 0 ? sheriffIdx : 0;
  room.phase = "playing";
  return { ok: true };
}

// Placeholder turn advance — hands the turn to the next living player.
// Real turn structure (draw/play/discard) arrives with the card layer.
export function endTurn(code: string, playerId: string): boolean {
  const room = rooms.get(code);
  if (!room || room.phase !== "playing") return false;
  const current = room.players[room.turnIndex];
  if (!current || current.id !== playerId) return false; // only the active player may end their turn
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

export function restart(code: string): boolean {
  const room = rooms.get(code);
  if (!room) return false;
  room.phase = "lobby";
  room.turnIndex = 0;
  room.players.forEach((p) => {
    p.role = null;
    p.characterName = null;
    p.hp = 0;
    p.maxHp = 0;
    p.alive = true;
    p.hand = [];
  });
  return true;
}

// --- view building (hidden-info filtering) ---

// A role is visible to others only when it's a public role (Sheriff) or the
// player is dead.
function visibleRole(p: Player): Role | null {
  if (!p.role) return null;
  if (PUBLIC_ROLES.includes(p.role)) return p.role;
  if (!p.alive) return p.role;
  return null;
}

function toPublic(p: Player, turnId: string | null): PlayerPublic {
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
    characterName: p.characterName,
    role: visibleRole(p),
    isTurn: turnId != null && p.id === turnId,
  };
}

// Build the personalized view for one player: they always see their OWN role and
// hand; for everyone else only public info is exposed.
export function buildView(room: Room, playerId: string): PlayerView {
  const me = room.players.find((p) => p.id === playerId);
  const turnPlayer = room.phase === "playing" ? room.players[room.turnIndex] : null;
  const turnId = turnPlayer ? turnPlayer.id : null;
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
      characterName: me?.characterName ?? null,
      hp: me?.hp ?? 0,
      maxHp: me?.maxHp ?? 0,
      hand: me?.hand ?? [],
      alive: me?.alive ?? true,
    },
    players: bySeat.map((p) => toPublic(p, turnId)),
    turnSeat: turnPlayer ? turnPlayer.seat : null,
    roleSetup: roleSetupFor(room.players.length),
  };
}
