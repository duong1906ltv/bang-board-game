// Opening, joining and leaving a room — everything that happens around a game rather
// than inside one, plus the room browser the home page reads.
//
// disconnect() is deliberately NOT here. It is the one function in this group that
// calls back into the core (beginTurn, advanceToNextSeat, layGhostDown), because a
// player dropping mid-turn has to let the table carry on. Dragging it over would drag
// that arrow with it and put this module back inside the cycle, so it stays in
// index.ts. Slightly out of place by name; the module graph stays a stack.

import { LobbySummary, LogEntry, MAX_PLAYERS, MySeat, Role } from "../types";
import { err, Result } from "../errors";
import { Player, ROLE_SETUP, Room, genCode, genId, rooms } from "./state";

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

export function newPlayer(name: string, socketId: string, isHost: boolean): Player {
  return {
    id: genId(),
    name: name.trim().slice(0, 20) || "Người chơi",
    socketId,
    isHost,
    isBot: false,
    connected: true,
    role: null,
    character: null,
    draftChoices: [],
    hasPicked: false,
    hp: 0,
    maxHp: 0,
    alive: true,
    ghost: false,
    ghostMisses: 0,
    hand: [],
    equipment: [],
    wins: 0,
    rewardTicket: null,
    inbox: [],
  };
}

// Append to `target`'s personal feed. Callers filter out self-inflicted entries — the
// feed answers "who is coming after me", and a Dynamite you lit yourself is not news.
// Dead players get nothing, and 20 caps what one long wait can pile up.
export function notify(room: Room, target: Player | null | undefined, e: Omit<LogEntry, "id">) {
  if (!target || !target.alive) return;
  target.inbox.push({ ...e, id: room.logSeq++ });
  if (target.inbox.length > 20) target.inbox.shift();
}

export function createRoom(
  name: string,
  socketId: string,
  unlisted = false
): { room: Room; player: Player } {
  const code = genCode();
  const player = newPlayer(name, socketId, true);
  const room: Room = {
    code,
    phase: "lobby",
    unlisted,
    players: [player],
    hostId: player.id,
    turnIndex: 0,
    turnPhase: "draw",
    jailedTurn: false,
    upkeepFor: null,
    bangsThisTurn: 0,
    playsThisTurn: 0,
    playedDefsThisTurn: [],
    pending: null,
    winner: null,
    deathQueue: [],
    checks: [],
    botTimer: null,
    ackTimer: null,
    deck: [],
    discard: [],
    log: [],
    logSeq: 0,
    eventLevel: "on",
    roundStarterId: null,
    roundEventDue: false,
    events: [],
    roundEvents: [],
    eventFeed: [],
    eventSeq: 0,
    usedEventIds: [],
    turnCounter: 0,
    turnDir: 1,
    turnDirRestore: null,
    predictions: [],
    turnShotIds: [],
    predictFeed: [],
    predictSeq: 0,
  };
  rooms.set(code, room);
  return { room, player };
}

// Host adds an AI-controlled player to the lobby (for testing / filling seats).
export function addBot(code: string): Result {
  const room = rooms.get(code);
  if (!room) return err("no-such-room");
  if (room.phase !== "lobby") return err("game-in-progress");
  if (room.players.length >= MAX_PLAYERS) return err("room-full", { n: MAX_PLAYERS });
  const botNum = room.players.filter((p) => p.isBot).length + 1;
  const bot = newPlayer(`🤖 Bot ${botNum}`, "", false);
  bot.socketId = null;
  bot.isBot = true;
  room.players.push(bot);
  return { ok: true };
}

export function removeBot(code: string): boolean {
  const room = rooms.get(code);
  if (!room || room.phase !== "lobby") return false;
  let idx = -1;
  for (let i = room.players.length - 1; i >= 0; i--) {
    if (room.players[i].isBot) { idx = i; break; }
  }
  if (idx < 0) return false;
  room.players.splice(idx, 1);
  return true;
}

// Why a running game can't take a newcomer: roles are dealt from a fixed
// distribution for the exact headcount (ROLE_SETUP), so a 6th player at a
// 5-player table has no role to be given — inventing one retroactively rewrites
// who wins. Seat order is also the distance metric every range check reads, so
// splicing a seat in silently moves everyone's targets mid-round. A player whose
// own seat is still open comes back through rejoin() instead.
export function addPlayer(
  code: string,
  name: string,
  socketId: string
): Result & { player?: Player } {
  const room = rooms.get(code);
  if (!room) return err("no-such-room");
  if (room.phase !== "lobby") return err("game-in-progress");

  // A lobby that is "full" of bots is not full to a human: bots exist only to
  // fill empty seats for testing, so a real arrival takes one back rather than
  // being turned away from a table of machines. Replaced in place, because seat
  // order is the distance metric and a push would move everyone else along.
  const player = newPlayer(name, socketId, false);
  if (room.players.length >= MAX_PLAYERS) {
    const idx = room.players.findIndex((p) => p.isBot);
    if (idx === -1) return err("room-full", { n: MAX_PLAYERS });
    room.players.splice(idx, 1, player);
  } else {
    room.players.push(player);
  }
  return { ok: true, player };
}

// Every room a stranger may walk into. `unlisted` rooms are held back: someone
// opened those for their own group and shares the code themselves.
export function listLobbies(): LobbySummary[] {
  return [...rooms.values()]
    .filter((r) => r.phase === "lobby" && !r.unlisted)
    // Fullest first. A room one player short of starting is the one worth joining;
    // spreading arrivals across empty rooms is how nobody ever reaches MIN_PLAYERS.
    .sort((a, b) => b.players.length - a.players.length)
    .map((r) => {
      const humans = r.players.filter((p) => !p.isBot);
      return {
        code: r.code,
        players: humans.map((p) => p.name),
        bots: r.players.length - humans.length,
        max: MAX_PLAYERS,
      };
    });
}

// Which of the seats this browser remembers are still its own. A seat still held
// by a live connection is skipped, so a second tab cannot pull the chair out from
// under the tab that is actually playing.
export function mySeats(seats: { code: string; playerId: string }[]): MySeat[] {
  const out: MySeat[] = [];
  for (const s of seats) {
    const room = rooms.get((s.code || "").toUpperCase().trim());
    const seat = room?.players.find((p) => p.id === s.playerId);
    if (!room || !seat || seat.connected || seat.isBot) continue;
    out.push({ code: room.code, playerId: seat.id, name: seat.name, players: room.players.length });
  }
  return out;
}

// Who may kick off a game. Host-only in an `unlisted` room: someone opened it for
// their own group and picks the moment. In a public room, anyone seated — being
// "host" there is an accident of arrival order, so tying the start button to it
// hands one AFK tab the power to strand everyone else. Only the START of a game is
// shared this way; restart (which discards a live game) and bot management stay
// with the host, where a stray tap can't undo other people's play.
export function mayStart(room: Room, player: Player): boolean {
  return player.isHost || (!room.unlisted && !player.isBot);
}

export function rejoin(code: string, playerId: string, socketId: string): Result {
  const room = rooms.get(code);
  if (!room) return err("no-such-room");
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return err("player-not-found");
  player.socketId = socketId;
  player.connected = true;
  return { ok: true };
}

export function clearBotTimer(room: Room) {
  if (room.botTimer) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
  }
}
