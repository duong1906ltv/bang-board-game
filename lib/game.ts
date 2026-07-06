// In-memory game engine for Bang! — room + character draft.
// Rooms live in a Map for the lifetime of the server process (no DB).
//
// SCOPE: room lifecycle, role dealing, and the character draft (deal 2 per
// player, 30s to pick 1, auto-pick by tier rank on timeout). The card deck and
// combat resolution are stubbed and will be implemented with the card rules.

import {
  Card,
  Character,
  CHARACTERS,
  DraftView,
  Phase,
  PlayerPublic,
  PlayerView,
  PUBLIC_ROLES,
  rankPriority,
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
  character: Character | null; // locked in after the draft
  draftChoices: Character[]; // the two candidates offered during the draft
  hasPicked: boolean; // draft: has locked a character
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
  draftEndsAt: number | null; // epoch ms deadline for the 30s pick window
  draftTimer: NodeJS.Timeout | null;
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
    draftEndsAt: null,
    draftTimer: null,
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
    p.hand = []; // dealt when the card layer lands
  });
  const sheriffIdx = room.players.findIndex((p) => p.role === "sheriff");
  room.turnIndex = sheriffIdx >= 0 ? sheriffIdx : 0;
  room.phase = "playing";
}

// --- turn flow ---

// Placeholder turn advance — hands the turn to the next living player.
export function endTurn(code: string, playerId: string): boolean {
  const room = rooms.get(code);
  if (!room || room.phase !== "playing") return false;
  const current = room.players[room.turnIndex];
  if (!current || current.id !== playerId) return false;
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
  clearDraftTimer(room);
  room.phase = "lobby";
  room.turnIndex = 0;
  room.draftEndsAt = null;
  room.players.forEach((p) => {
    p.role = null;
    p.character = null;
    p.draftChoices = [];
    p.hasPicked = false;
    p.hp = 0;
    p.maxHp = 0;
    p.alive = true;
    p.hand = [];
  });
  return true;
}

// --- view building (hidden-info filtering) ---

function visibleRole(p: Player): Role | null {
  if (!p.role) return null;
  if (PUBLIC_ROLES.includes(p.role)) return p.role;
  if (!p.alive) return p.role;
  return null;
}

function toPublic(p: Player, room: Room, turnId: string | null): PlayerPublic {
  // Characters are public once the game is underway; during the draft, nobody
  // sees anyone else's options or pick.
  const characterPublic = room.phase === "playing" || room.phase === "result" ? p.character : null;
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
    role: visibleRole(p),
    isTurn: turnId != null && p.id === turnId,
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

// Build the personalized view for one player: they always see their OWN role,
// character and hand; for everyone else only public info is exposed.
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
      character: me?.character ?? null,
      hp: me?.hp ?? 0,
      maxHp: me?.maxHp ?? 0,
      hand: me?.hand ?? [],
      alive: me?.alive ?? true,
    },
    players: bySeat.map((p) => toPublic(p, room, turnId)),
    turnSeat: turnPlayer ? turnPlayer.seat : null,
    roleSetup: roleSetupFor(room.players.length),
    draft: room.phase === "drafting" ? buildDraft(room, me) : null,
  };
}
