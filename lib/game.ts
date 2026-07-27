// In-memory game engine for Bang! — full game: room lifecycle, role dealing,
// character draft (deal 2 per player, no time limit; auto-pick by tier rank only
// as a safety net if a player leaves), the card deck, and combat resolution.
// Rooms live in a Map for the lifetime of the server process (no DB).

import {
  Character,
  CheckView,
  CHARACTERS,
  DraftView,
  PendingAction,
  PendingView,
  Phase,
  PlayerPublic,
  PlayerView,
  PUBLIC_ROLES,
  rankPriority,
  Role,
  TurnPhase,
  Winner,
  LogEntry,
  EventView,
} from "./types";
import { buildDeck, Card, CARD_DEF_BY_ID, rankLabel, SUIT_SYMBOL } from "./cards";
import { buildEscapeRewardUrl } from "./escapeReward";
import {
  EVENT_BY_ID,
  EventCtx,
  EventEffect,
  EventLevel,
  pickBatch,
  GameEventDef,
  mergeEffect,
  pickWeighted,
} from "./events";

// Số ván phải THẮNG (cộng dồn trong cùng một phòng) để mở khoá phần thưởng liên game.
const REWARD_WIN_THRESHOLD = 3;

// An unresolved reaction that locks the table until responded to. There is no
// deadline: reactions never time out (players take as long as they need).
type Pending =
  | { kind: "bang"; targetId: string; sourceId: string; missedNeeded: number; missedPlayed: number }
  | { kind: "dying"; targetId: string; sourceId: string | null; creditId?: string | null; beersNeeded: number }
  | { kind: "multi"; effect: "indians" | "gatling"; sourceId: string; responders: { id: string; done: boolean; safe: boolean }[] }
  | { kind: "duel"; aId: string; bId: string; turnId: string }
  | { kind: "store"; sourceId: string; cards: Card[]; order: string[] }
  | { kind: "kit"; playerId: string; cards: Card[]; picksLeft: number };

export interface Player {
  id: string;
  name: string;
  socketId: string | null;
  isHost: boolean;
  isBot: boolean; // server-controlled AI (fills seats for testing)
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
  wins: number; // số ván đã thắng trong phòng (cộng dồn, KHÔNG reset khi chơi lại)
  rewardTicket?: string | null; // link thưởng escape — cấp khi thắng đủ ngưỡng (1 lần)
}

// A random event currently in force (or the one that just fired).
interface ActiveEvent {
  seq: number; // monotonic id, so the client can tell a NEW event from a repeat
  defId: string; // key into EVENT_BY_ID
  turnsLeft: number; // in turns; a round-long effect gets one turn per living player
}

export interface Room {
  code: string;
  phase: Phase;
  players: Player[]; // kept in seat order
  hostId: string;
  turnIndex: number; // index into players[] whose turn it is (playing phase)
  turnPhase: TurnPhase; // sub-phase of the current player's turn
  // The active player failed their Jail check: they serve the turn without playing
  // anything, but still have to discard down to their hand limit before it passes.
  jailedTurn: boolean;
  // Set when a player's own upkeep (their exploding Dynamite) knocked them to 0 and
  // we are waiting on their Beer answer. Their turn has NOT been set up yet — the
  // Jail check and the draw phase still have to run — so whoever resolves that
  // pending has to hand control back via resumeUpkeep().
  upkeepFor: string | null;
  bangsThisTurn: number; // Bang!s played by the active player this turn
  playsThisTurn: number; // cards played by the active player this turn (for maxPlays events)
  playedDefsThisTurn: string[]; // house rule: each card type only once per turn (Bang!/guns exempt)
  pending: Pending | null; // unresolved reaction locking the table
  winner: Winner | null; // set when the game ends
  deathQueue: { id: string; needed: number; sourceId: string | null }[]; // players awaiting a Beer-save
  checks: CheckView[]; // recent Draw! reveals (upkeep / Barrel), display-only
  botTimer: NodeJS.Timeout | null; // paces bot actions so humans can watch
  deck: Card[]; // draw pile (top = end of array)
  discard: Card[]; // discard pile
  log: LogEntry[]; // action history (oldest → newest, trimmed)
  logSeq: number; // monotonic id for log entries

  // --- random events (see lib/events.ts) ---
  eventLevel: EventLevel; // room setting, survives restart()
  roundStarterId: string | null; // whoever opens each round — the round boundary marker
  roundEventDue: boolean; // an event is queued for the next turn start
  events: ActiveEvent[]; // in force now (turn / lasting / curse)
  // Rolling feed of the most recently FIRED events, newest last. A single action
  // can fire more than one (a table event at a round boundary plus that player's
  // own turn event), so a "latest event" field would silently drop the first —
  // clients announce every entry they haven't seen yet, by `seq`.
  eventFeed: ActiveEvent[];
  eventSeq: number;
  usedEventIds: string[]; // every event already seen this game — drawn from like a deck
  turnCounter: number; // turns begun this game (drives the opening-round immunity)
  turnDir: 1 | -1; // play direction (the "reverse" event flips it)
}

const rooms = new Map<string, Room>();

// Append an action-history entry, keeping only the most recent ~40.
function pushLog(room: Room, e: Omit<LogEntry, "id">) {
  room.log.push({ ...e, id: room.logSeq++ });
  if (room.log.length > 40) room.log.shift();
}

// Record a Draw! reveal (Dynamite/Jail/Barrel/Black Jack…) in the permanent log
// so everyone can see it in history, not just the transient checks banner.
function logCheck(room: Room, c: { name: string; card: Card | null; kind: string; outcome: string }) {
  pushLog(room, {
    kind: "check",
    a: c.name,
    card: c.card ? `${rankLabel(c.card.rank)}${SUIT_SYMBOL[c.card.suit]}` : undefined,
    checkKind: c.kind,
    outcome: c.outcome,
  });
}

// Bang! plays 4–7 in the base game. This room is capped at 7 as requested.
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 7;

// Each player is offered 2 characters to choose from (no time limit to pick).
export const DRAFT_PER_PLAYER = 2;

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
    isBot: false,
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
    wins: 0,
    rewardTicket: null,
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
    deck: [],
    discard: [],
    log: [],
    logSeq: 0,
    eventLevel: "on",
    roundStarterId: null,
    roundEventDue: false,
    events: [],
    eventFeed: [],
    eventSeq: 0,
    usedEventIds: [],
    turnCounter: 0,
    turnDir: 1,
  };
  rooms.set(code, room);
  return { room, player };
}

// Host adds an AI-controlled player to the lobby (for testing / filling seats).
export function addBot(code: string): { ok: boolean; error?: string } {
  const room = rooms.get(code);
  if (!room) return { ok: false, error: "Phòng không tồn tại" };
  if (room.phase !== "lobby") return { ok: false, error: "Ván đang diễn ra" };
  if (room.players.length >= MAX_PLAYERS) return { ok: false, error: `Phòng đã đầy (tối đa ${MAX_PLAYERS})` };
  const botNum = room.players.filter((p) => p.isBot).length + 1;
  const bot = newPlayer(`🤖 Bot ${botNum}`, "", false, room.players.length);
  bot.socketId = null;
  bot.isBot = true;
  room.players.push(bot);
  return { ok: true };
}

// Host removes the most recently added bot (lobby only).
export function removeBot(code: string): boolean {
  const room = rooms.get(code);
  if (!room || room.phase !== "lobby") return false;
  let idx = -1;
  for (let i = room.players.length - 1; i >= 0; i--) {
    if (room.players[i].isBot) { idx = i; break; }
  }
  if (idx < 0) return false;
  room.players.splice(idx, 1);
  room.players.forEach((p, i) => (p.seat = i));
  return true;
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
    return room;
  }
  return null;
}

function clearBotTimer(room: Room) {
  if (room.botTimer) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
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
  // Random events start from a clean slate each game; the Sheriff opens round 1
  // and therefore marks every later round boundary.
  resetEventState(room);
  room.roundStarterId = room.players[room.turnIndex].id;
  beginTurn(room); // Sheriff begins (runs upkeep if they somehow have blue cards)
}

// --- random events ---------------------------------------------------------
// ONE scheduler: `rollRoundEvents` fires at the start of each ROUND — i.e. when play
// comes back round to the Sheriff — and the 2..4 events it draws stand for that whole
// round, applying to everyone. Every enforcement point in this file reads the merged result
// of `activeEffect`, so adding an event never means touching the engine (lib/events.ts).

// Host setting: how often events fire (persists across restart()).
export function setEventLevel(code: string, level: EventLevel): boolean {
  const room = rooms.get(code);
  if (!room) return false;
  room.eventLevel = level;
  return true;
}

// Wipe every per-game event field. `eventLevel` is a ROOM setting and survives,
// so the host doesn't have to re-pick the frequency after every game.
function resetEventState(room: Room) {
  room.events = [];
  room.eventFeed = [];
  room.eventSeq = 0;
  room.usedEventIds = [];
  room.turnCounter = 0;
  room.turnDir = 1;
  room.roundStarterId = null;
  room.roundEventDue = false;
}

// The effects in force right now. Every event applies to the whole table, so this
// takes no player: there is deliberately no way to ask "what applies to HIM".
export function activeEffect(room: Room): EventEffect {
  const out: EventEffect = {};
  for (const ev of room.events) {
    const def = EVENT_BY_ID[ev.defId];
    if (def?.effect) mergeEffect(out, def.effect);
  }
  return out;
}

// Every active effect ticks down one turn per turn started. Durations are set in
// turns because that is what the engine can count: one round = one turn per living
// player, so a round-long modifier expires exactly as the round closes.
function tickEvents(room: Room) {
  room.events = room.events.filter((ev) => {
    ev.turnsLeft -= 1;
    return ev.turnsLeft > 0;
  });
}

function aliveBySeat(room: Room): Player[] {
  return [...room.players].sort((a, b) => a.seat - b.seat).filter((p) => p.alive);
}

// Nobody gets an event until every living player has taken one turn: an event on
// turn 1 lands before anyone has a weapon or a full hand, which is pure bad luck
// rather than drama.
function eventsUnlocked(room: Room): boolean {
  // `>=`, not `>`: turnCounter is bumped AFTER this roll, so at the top of round 2
  // it still reads "one full round done". With `>` the first event would slip an
  // entire extra round — about five minutes of real play.
  return room.eventLevel !== "off" && room.turnCounter >= aliveBySeat(room).length;
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
  for (const def of pickBatch(aliveBySeat(room).length, room.usedEventIds, Math.random)) {
    if (room.phase !== "playing") return; // an instant ended the game mid-batch
    fireEvent(room, def, opener);
  }
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
    if (!p.alive || activeEffect(room).noHeal) return;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + n);
    if (p.hp > before) pushLog(room, { kind: "heal", a: p.name, n: p.hp - before });
  };
  const draw = (p: Player, n: number) => {
    let got = 0;
    for (let i = 0; i < n; i++) {
      const c = drawOne(room);
      if (c) { p.hand.push(c); got++; }
    }
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
    reverseOrder: () => { room.turnDir = room.turnDir === 1 ? -1 : 1; },
    generalStore: () => {
      if (room.pending) return; // never overwrite a live reaction
      openGeneralStore(room, opener);
    },
  };
}

// Build the client-facing shape of one active event.
function toEventView(room: Room, ev: ActiveEvent): EventView {
  const def = EVENT_BY_ID[ev.defId];
  return {
    seq: ev.seq,
    id: ev.defId,
    emoji: def?.emoji ?? "🎲",
    scope: def?.scope ?? "instant",
    // A countdown is meaningful for anything that persists: it says how many turns
    // of this round the rule still covers. Instants have nothing to count.
    turnsLeft: def && def.scope !== "instant" ? ev.turnsLeft : undefined,
  };
}

// --- event-aware rule queries ----------------------------------------------
// Single source of truth, used by BOTH the engine (to validate) and lib/bot.ts
// (to filter). If the bot used its own copy it would keep attempting plays the
// engine rejects, and since a failed bot step stops the scheduler, the table
// would freeze with no timeout to break it.

// Cards whose whole point is restoring life — suppressed together by `noHeal`.
const HEAL_DEF_IDS = ["beer", "saloon"];

// Cards a player may keep at the end of their turn.
// Floored at 1, never 0. A limit of 0 is unsatisfiable for Suzy Lafayette: she
// draws the instant her hand is empty (refillEmptyHands runs after every action),
// so discarding her last card immediately puts her back over the limit and the turn
// can never be ended — an infinite discard/draw loop for bot and human alike.
// Drought therefore stops biting at 1 life, which costs almost nothing.
export function handLimitOf(room: Room, p: Player): number {
  return Math.max(1, p.hp + (activeEffect(room).handLimitDelta ?? 0));
}

// How many more Bang!s the player may fire this turn (0 = none).
export function bangBudget(room: Room, p: Player): number {
  const eff = activeEffect(room);
  if (eff.noBang) return 0;
  const unlimited = hasEquip(p, "volcanic") || p.character?.id === "willy-the-kid";
  const cap = eff.bangLimit ?? (unlimited ? 99 : 1);
  return Math.max(0, cap - room.bangsThisTurn);
}

// Why this card can't be played right now, or null if it can. Covers the
// once-per-turn house rule and every event restriction; range/target validity is
// still checked by the individual play handlers.
export function playBlock(room: Room, p: Player, card: Card, targetId?: string): string | null {
  const def = CARD_DEF_BY_ID[card.defId];
  if (!def) return "Lá không hợp lệ";
  // Serving a Jail sentence blocks every play. This has to live HERE rather than only
  // in playCard(), because playBlock is the shared predicate: the bot filters its
  // candidate moves through it, and a bot move the engine then rejects returns false
  // from step(), which stops the bot scheduler and freezes the table for good.
  if (room.jailedTurn && room.players[room.turnIndex]?.id === p.id) {
    return "Đang bị giam — chỉ được bỏ bài";
  }
  const eff = activeEffect(room);

  if (eff.bannedDefIds?.includes(card.defId)) return `Sự kiện đang cấm ${def.name}`;
  if (eff.bannedKinds?.includes(def.kind)) return `Sự kiện đang cấm loại lá này`;
  if (eff.maxPlays != null && room.playsThisTurn >= eff.maxPlays) {
    return `Sự kiện: chỉ được đánh ${eff.maxPlays} lá lượt này`;
  }
  // Healing plays, blocked as a group. Note this covers the PROACTIVE Beer only —
  // a dying player may still drink to survive (respond()), so "no healing" never
  // becomes "no saving throw".
  if (HEAL_DEF_IDS.includes(card.defId) && eff.noHeal) return "Sự kiện đang cấm hồi máu";
  if (isBangLike(p, card, targetId) && bangBudget(room, p) <= 0) {
    return eff.noBang ? "Sự kiện: không được bắn lượt này" : "Chỉ 1 Bang!/lượt (trừ Volcanic/Willy)";
  }
  if (!isExemptPlay(room, p, card, targetId) && room.playedDefsThisTurn.includes(card.defId)) {
    return `Đã dùng ${def.name} trong lượt này`;
  }
  return null;
}

// The distinct card types in `p`'s hand that cannot be played right now. Sent in
// the view so the client can grey those cards out instead of letting the player
// aim into a silent server rejection.
function blockedDefIdsFor(room: Room, p: Player): string[] {
  const out = new Set<string>();
  for (const c of p.hand) {
    if (out.has(c.defId)) continue;
    if (playBlock(room, p, c)) out.add(c.defId);
  }
  return [...out];
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

// Weapon range: the equipped gun's range, or 1 (Colt .45) if unarmed. Events may
// override it outright (Short Barrel / Sniper Nest) or shift it (Eagle Eye).
export function rangeOf(p: Player, room?: Room): number {
  let range = 1;
  for (const c of p.equipment) {
    const def = CARD_DEF_BY_ID[c.defId];
    if (def?.kind === "gun" && def.range) range = def.range;
  }
  if (!room) return range;
  const eff = activeEffect(room);
  if (eff.rangeOverride != null) range = eff.rangeOverride;
  return Math.max(1, range + (eff.rangeDelta ?? 0));
}

// Does a player have a given blue card equipped (e.g. mustang / scope)?
function hasEquip(p: Player, defId: string): boolean {
  return p.equipment.some((c) => c.defId === defId);
}

// How many Barrel-style Draw!s a player gets when hit by a Bang!: one per Barrel
// in play, plus one innate for Jourdonnais.
function barrelAttempts(p: Player): number {
  return (hasEquip(p, "barrel") ? 1 : 0) + (p.character?.id === "jourdonnais" ? 1 : 0);
}

// Distance the viewer `from` sees to player `to`, counting only living players
// around the circle. Mustang and Paul Regret each add +1 to how far others see
// the target; Scope and Rose Doolan each subtract 1 from what the viewer sees.
// Both pairs stack (Paul Regret + Mustang = +2). Minimum 1.
export function distanceBetween(room: Room, from: Player, to: Player): number {
  if (from.id === to.id) return 0;
  const alive = [...room.players].sort((a, b) => a.seat - b.seat).filter((p) => p.alive);
  const i = alive.findIndex((p) => p.id === from.id);
  const j = alive.findIndex((p) => p.id === to.id);
  if (i < 0 || j < 0) return Infinity;
  const raw = Math.abs(i - j);
  let dist = Math.min(raw, alive.length - raw);

  // Target seen farther. Mustang and Paul Regret's ability stack: a Paul Regret
  // holding a Mustang is seen at +2.
  if (hasEquip(to, "mustang")) dist += 1;
  if (to.character?.id === "paul-regret") dist += 1;
  // Viewer sees closer. Scope and Rose Doolan's ability stack the same way.
  if (hasEquip(from, "scope")) dist -= 1;
  if (from.character?.id === "rose-doolan") dist -= 1;
  // Weather events stretch or flatten the whole table (Fog / Open Plains).
  dist += activeEffect(room).distanceDelta ?? 0;

  return Math.max(1, dist);
}

// --- turn flow ---

// Draw phase: the active player draws their 2 cards, then may play.
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

  // Kit Carlson: reveal the top 3, pick 2 (the third returns to the deck bottom).
  if (current.character?.id === "kit-carlson" && drawTotal > 0) {
    const cards: Card[] = [];
    for (let i = 0; i < drawTotal + 1; i++) {
      const c = drawOne(room);
      if (c) cards.push(c);
    }
    room.pending = { kind: "kit", playerId: current.id, cards, picksLeft: drawTotal };
    return true; // stays in draw phase until picks resolve
  }

  // Jesse Jones: draw the first card from a chosen player's hand.
  if (current.character?.id === "jesse-jones" && source === "player" && targetId && drawTotal > 0) {
    const t = room.players.find((p) => p.id === targetId);
    if (t && t.id !== current.id && t.hand.length > 0) {
      current.hand.push(t.hand.splice(Math.floor(Math.random() * t.hand.length), 1)[0]);
    } else {
      const c = drawOne(room);
      if (c) current.hand.push(c);
    }
    for (let k = 1; k < drawTotal; k++) {
      const c = drawOne(room);
      if (c) current.hand.push(c);
    }
    room.turnPhase = "play";
    pushLog(room, { kind: "draw", a: current.name, n: current.hand.length - beforeDraw });
    return true;
  }

  // Pedro Ramirez: draw the first card from the discard pile.
  if (current.character?.id === "pedro-ramirez" && source === "discard" && room.discard.length > 0 && drawTotal > 0) {
    current.hand.push(room.discard.pop()!);
    for (let k = 1; k < drawTotal; k++) {
      const c = drawOne(room);
      if (c) current.hand.push(c);
    }
    room.turnPhase = "play";
    pushLog(room, { kind: "draw", a: current.name, n: current.hand.length - beforeDraw });
    return true;
  }

  if (current.character?.id === "black-jack" && drawTotal >= 2) {
    // Draw 1; reveal the 2nd — on Heart/Diamond, draw a bonus card.
    const c1 = drawOne(room);
    if (c1) current.hand.push(c1);
    const c2 = drawOne(room);
    if (c2) {
      current.hand.push(c2);
      const bonus = c2.suit === "hearts" || c2.suit === "diamonds";
      room.checks = [{ name: current.name, card: c2, kind: "blackjack", outcome: bonus ? "bonus" : "nobonus" }];
      logCheck(room, room.checks[0]);
      if (bonus) {
        const c3 = drawOne(room);
        if (c3) current.hand.push(c3);
      }
    }
    for (let k = 2; k < drawTotal; k++) {
      const c = drawOne(room);
      if (c) current.hand.push(c);
    }
  } else {
    for (let k = 0; k < drawTotal; k++) {
      const c = drawOne(room);
      if (c) current.hand.push(c);
    }
  }
  room.turnPhase = "play";
  pushLog(room, { kind: "draw", a: current.name, n: current.hand.length - beforeDraw });
  return true;
}

// Play a card from the active player's hand.
// Step 2a scope: blue self-equipment (guns, Mustang, Scope, Barrel). Targeted
// blue cards (Jail/Dynamite) and brown cards are handled in later steps.
// A play that is EXEMPT from the "each card type only once per turn" house rule:
//  • any gun swap (weapons change freely), and
//  • a Bang! — including Calamity Janet firing a Missed! as a Bang! — which is
//    governed by its OWN limit instead (bangsThisTurn: once, or unlimited with
//    Volcanic / Willy the Kid; see playBang).
// A Bang! being fired — including Calamity Janet using a Missed! as one. Governed
// by the Bang!/turn budget rather than the once-per-turn house rule.
function isBangLike(p: Player, card: Card, targetId?: string): boolean {
  return card.defId === "bang" || (card.defId === "missed" && p.character?.id === "calamity-janet" && !!targetId);
}

function isExemptPlay(room: Room, p: Player, card: Card, targetId?: string): boolean {
  if (activeEffect(room).ignoreOncePerTurn) return true; // Frenzy suspends the house rule
  const def = CARD_DEF_BY_ID[card.defId];
  if (def?.kind === "gun") return true;
  return isBangLike(p, card, targetId);
}

export function playCard(
  code: string,
  playerId: string,
  cardId: string,
  targetId?: string,
  targetCardId?: string
): { ok: boolean; error?: string } {
  // Capture card/target names before the play mutates state, then log on success.
  const room = rooms.get(code);
  const actor = room?.players[room.turnIndex];
  const playedCard = actor?.hand.find((c) => c.id === cardId);
  const cardName = playedCard?.name;
  const exempt = !!playedCard && !!actor && !!room && isExemptPlay(room, actor, playedCard, targetId);
  const targetName = targetId ? room?.players.find((p) => p.id === targetId)?.name : undefined;
  const res = playCardImpl(code, playerId, cardId, targetId, targetCardId);
  if (res.ok && room) {
    room.playsThisTurn += 1; // events may cap how many cards a turn allows
    // Mark this card type as used this turn (exempt plays don't consume a slot).
    if (!exempt && playedCard) room.playedDefsThisTurn.push(playedCard.defId);
    if (actor && cardName) pushLog(room, { kind: "play", a: actor.name, card: cardName, b: targetName });
  }
  return res;
}

function playCardImpl(
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
  // Serving a Jail sentence: the only thing allowed is discarding down to the limit.
  // Reactions still work — they go through respond(), not here — so a jailed player
  // can still play Missed! when shot at, which is correct.
  if (room.turnPhase === "discard") {
    return { ok: false, error: "Đang bị giam — chỉ được bỏ bài rồi kết thúc lượt" };
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
    if (current.character?.id === "calamity-janet" && _targetId) return playBang(room, current, idx, _targetId);
    return { ok: false, error: "Missed! chỉ dùng để phản ứng Bang!" };
  }
  return { ok: false, error: "Lá này sẽ hỗ trợ ở bước sau" };
}

// Indians! / Gatling: open a simultaneous reaction for every other living player.
// Gatling also lets a defender's Barrel help (it is a Bang! effect).
function playMulti(room: Room, current: Player, handIdx: number, effect: "indians" | "gatling"): { ok: boolean; error?: string } {
  moveToDiscard(room, current.hand.splice(handIdx, 1)[0]);
  const responders = room.players
    .filter((p) => p.alive && p.id !== current.id)
    .map((p) => ({ id: p.id, done: false, safe: false }));
  room.checks = [];
  // Gatling: auto-Barrel each defender up front (Jourdonnais included).
  if (effect === "gatling") {
    for (const r of responders) {
      const p = room.players.find((x) => x.id === r.id)!;
      const attempts = barrelAttempts(p);
      for (let i = 0; i < attempts && !r.safe; i++) {
        const card = drawCheck(room, p, goodBarrel);
        const heart = !!card && card.suit === "hearts";
        const chk = { name: p.name, card, kind: "barrel", outcome: heart ? "hit" : "miss" };
        room.checks.push(chk);
        logCheck(room, chk);
        if (heart) { r.done = true; r.safe = true; }
      }
    }
  }
  room.pending = { kind: "multi", effect, sourceId: current.id, responders };
  if (responders.every((r) => r.done)) resolveMulti(room);
  return { ok: true };
}

// Duel: the target discards a Bang! first, then alternating; first to fail loses 1.
function playDuel(room: Room, current: Player, handIdx: number, targetId?: string): { ok: boolean; error?: string } {
  const target = room.players.find((p) => p.id === targetId);
  if (!target || !target.alive || target.id === current.id) return { ok: false, error: "Mục tiêu không hợp lệ" };
  if (activeEffect(room).protectSheriff && target.role === "sheriff") {
    return { ok: false, error: "Hiệp Ước: không được bắn Cảnh Sát Trưởng" };
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
  room.pending = { kind: "store", sourceId: current.id, cards, order: order.slice(0, cards.length) };
}

function playGeneralStore(room: Room, current: Player, handIdx: number): { ok: boolean; error?: string } {
  moveToDiscard(room, current.hand.splice(handIdx, 1)[0]);
  openGeneralStore(room, current);
  return { ok: true };
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
  if (activeEffect(room).noHeal) return { ok: false, error: "Sự kiện đang cấm hồi máu" };
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

// Remove and return the card a `pickTargetCard` result points at.
function takePickedCard(target: Player, pick: { from: "hand" | "equipment"; index: number }): Card {
  const pile = pick.from === "hand" ? target.hand : target.equipment;
  return pile.splice(pick.index, 1)[0];
}

// Panic!: take a card from a player at distance 1 into your hand.
function playPanic(room: Room, current: Player, handIdx: number, targetId?: string, targetCardId?: string): { ok: boolean; error?: string } {
  const target = room.players.find((p) => p.id === targetId);
  if (!target || !target.alive || target.id === current.id) return { ok: false, error: "Mục tiêu không hợp lệ" };
  if (distanceBetween(room, current, target) > 1) return { ok: false, error: "Chỉ lấy được của người ở khoảng cách 1" };
  const pick = pickTargetCard(target, targetCardId);
  if (!pick) return { ok: false, error: "Mục tiêu không có bài" };
  moveToDiscard(room, current.hand.splice(handIdx, 1)[0]);
  current.hand.push(takePickedCard(target, pick));
  return { ok: true };
}

// Cat Balou: force any player to discard a card (any distance).
function playCatBalou(room: Room, current: Player, handIdx: number, targetId?: string, targetCardId?: string): { ok: boolean; error?: string } {
  const target = room.players.find((p) => p.id === targetId);
  if (!target || !target.alive) return { ok: false, error: "Mục tiêu không hợp lệ" };
  const pick = pickTargetCard(target, targetCardId);
  if (!pick) return { ok: false, error: "Mục tiêu không có bài" };
  moveToDiscard(room, current.hand.splice(handIdx, 1)[0]);
  moveToDiscard(room, takePickedCard(target, pick));
  return { ok: true };
}

// Play Bang! at a target: check the 1-per-turn limit and range, discard the
// card, then open a reaction window for the target.
function playBang(room: Room, current: Player, handIdx: number, targetId?: string): { ok: boolean; error?: string } {
  let target = room.players.find((p) => p.id === targetId);
  if (!target || !target.alive || target.id === current.id) return { ok: false, error: "Mục tiêu không hợp lệ" };
  const eff = activeEffect(room);
  // Truce: the Sheriff can't be shot while the pact holds.
  if (eff.protectSheriff && target.role === "sheriff") return { ok: false, error: "Hiệp Ước: không được bắn Cảnh Sát Trưởng" };
  const range = rangeOf(current, room);
  if (distanceBetween(room, current, target) > range) {
    return { ok: false, error: "Mục tiêu ngoài tầm bắn" };
  }
  // Drunk: the shot goes wide — it lands on a random valid target instead.
  if (eff.drunkAim) {
    const candidates = room.players.filter(
      (p) =>
        p.alive &&
        p.id !== current.id &&
        distanceBetween(room, current, p) <= range &&
        !(eff.protectSheriff && p.role === "sheriff")
    );
    if (candidates.length) target = candidates[Math.floor(Math.random() * candidates.length)];
  }
  const [c] = current.hand.splice(handIdx, 1);
  room.discard.push(c);
  room.bangsThisTurn += 1;
  const missedNeeded = Math.max(
    1,
    (current.character?.id === "slab-the-killer" ? 2 : 1) + (eff.missedNeededDelta ?? 0)
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
function playBeer(room: Room, current: Player, handIdx: number): { ok: boolean; error?: string } {
  if (current.hp >= current.maxHp) return { ok: false, error: "Máu đã đầy" };
  const [c] = current.hand.splice(handIdx, 1);
  room.discard.push(c);
  // Happy Hour makes a Beer worth 2 life points.
  current.hp = Math.min(current.maxHp, current.hp + (activeEffect(room).beerHeal ?? 1));
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
  pushLog(room, { kind: "discard", a: current.name, n: 1 });
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
  const limit = handLimitOf(room, current);
  if (current.hand.length > limit) {
    return { ok: false, error: `Bỏ bớt ${current.hand.length - limit} lá (giới hạn = máu)` };
  }
  if (!advanceToNextAlive(room)) return { ok: false };
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
    case "store":
      p.order = p.order.filter((o) => o !== id);
      if (p.order.length === 0) { room.discard.push(...p.cards); clearPending(room); }
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
export function surrender(code: string, playerId: string): { ok: boolean; error?: string } {
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
    if (wasTurn && room.phase === "playing" && !room.pending && advanceToNextAlive(room)) beginTurn(room);
  }
  return { ok: true };
}

// Move the turn to the next living player (by seat, wrapping). Returns false if
// nobody living is found.
// Move the turn to the next living player, following `turnDir` (the Reverse event
// flips it) and marking the round boundary that schedules events.
function advanceToNextAlive(room: Room): boolean {
  const n = room.players.length;
  for (let step = 1; step <= n; step++) {
    const idx = (room.turnIndex + step * room.turnDir + n * n) % n;
    if (room.players[idx].alive) {
      room.turnIndex = idx;
      markRoundBoundary(room);
      return true;
    }
  }
  return false;
}

// A round ends when play returns to whoever opened it. If that player has died, the
// marker moves to whoever is up now — otherwise the boundary would be lost for the
// rest of the game and events would never fire again.
function markRoundBoundary(room: Room) {
  const cur = room.players[room.turnIndex];
  if (!cur) return;
  const starter = room.players.find((p) => p.id === room.roundStarterId);
  if (!starter || !starter.alive) {
    room.roundStarterId = cur.id;
    room.roundEventDue = true;
    return;
  }
  if (cur.id === starter.id) room.roundEventDue = true;
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
  const isLuckyDuke = drawer?.character?.id === "lucky-duke";
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

// Start-of-turn upkeep: resolve Dynamite then Jail for the active player (and any
// players skipped by Jail), then leave them in the draw phase — unless Jail makes
// them skip, in which case play passes on. Fully synchronous (no reaction window,
// since Dynamite damage cannot be saved by Beer in this variant).
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
    if (handOffs++ > room.players.length) {
      // Everyone is skipped: force the current player to play rather than hang.
      const stuck = room.players[room.turnIndex];
      if (stuck) {
        room.turnPhase = "draw";
        pushLog(room, { kind: "turn", a: stuck.name });
      }
      return;
    }
    const cur = room.players[room.turnIndex];
    if (!cur) return;
    room.bangsThisTurn = 0;
    room.playsThisTurn = 0;
    room.playedDefsThisTurn = [];
    room.jailedTurn = false;

    // --- This round's event: rolled as the round opens (the Sheriff's turn), before
    // any upkeep, so it also colours that turn's Dynamite/Jail Draw! checks. ---
    if (room.roundEventDue) {
      room.roundEventDue = false;
      rollRoundEvents(room, cur);
      if (room.phase !== "playing") return; // an event ended the game
      if (!cur.alive) {
        // The event killed whoever was about to play — pass the turn on.
        if (!advanceToNextAlive(room)) return;
        continue;
      }
    }

    // --- Dynamite ---
    const dyn = cur.equipment.find((c) => c.defId === "dynamite");
    if (dyn) {
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
          return;
        }
        // Nothing to discard — hand it on without making them click anything.
        if (!advanceToNextAlive(room)) return;
        continue;
      }
    }

    room.turnCounter += 1;

    room.turnPhase = "draw";
    pushLog(room, { kind: "turn", a: cur.name });
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
  } else if (advanceToNextAlive(room)) {
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

// Whether `card` may be used as `asDefId`. Calamity Janet may swap Bang!/Missed!.
function canUseAs(player: Player, card: Card, asDefId: string): boolean {
  if (card.defId === asDefId) return true;
  if (player.character?.id === "calamity-janet") {
    if (asDefId === "missed" && card.defId === "bang") return true;
    if (asDefId === "bang" && card.defId === "missed") return true;
  }
  return false;
}

// A player replies to the active pending. `type` meaning depends on the pending.
export function respond(
  code: string,
  playerId: string,
  type: "missed" | "beer" | "bang" | "pass",
  cardId?: string
): { ok: boolean; error?: string } {
  const room = rooms.get(code);
  if (!room || !room.pending) return { ok: false };
  const pending = room.pending;

  // --- Bang!: target dodges with Missed!(s) or takes the hit ---
  if (pending.kind === "bang") {
    if (playerId !== pending.targetId) return { ok: false, error: "Không phải lượt phản ứng của bạn" };
    const target = room.players.find((p) => p.id === pending.targetId)!;
    if (type === "missed") {
      const idx = target.hand.findIndex((c) => c.id === cardId && canUseAs(target, c, "missed"));
      if (idx < 0) return { ok: false, error: "Không có lá né hợp lệ" };
      // Slab the Killer needs 2 Missed!: don't let a target burn a Missed! it can't
      // complete the dodge with (it would lose the card AND still take the hit).
      const remaining = pending.missedNeeded - pending.missedPlayed;
      const available = target.hand.filter((c) => canUseAs(target, c, "missed")).length;
      if (available < remaining) return { ok: false, error: `Cần đủ ${pending.missedNeeded} Missed! để né` };
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
    if (playerId !== pending.targetId) return { ok: false, error: "Không phải lượt phản ứng của bạn" };
    const target = room.players.find((p) => p.id === pending.targetId)!;
    if (type === "beer") {
      const idx = hasHandCard(target, "beer", cardId);
      if (idx < 0) return { ok: false, error: "Không có Beer đó" };
      room.discard.push(target.hand.splice(idx, 1)[0]);
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
    if (!r || r.done) return { ok: false, error: "Không phải lượt phản ứng của bạn" };
    const me = room.players.find((p) => p.id === playerId)!;
    const need = pending.effect === "indians" ? "bang" : "missed";
    if (type === need) {
      const idx = me.hand.findIndex((c) => c.id === cardId && canUseAs(me, c, need));
      if (idx < 0) return { ok: false, error: `Không có ${need === "bang" ? "Bang!" : "Missed!"} hợp lệ` };
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
    if (playerId !== pending.turnId) return { ok: false, error: "Chưa tới lượt bạn trong Duel" };
    const me = room.players.find((p) => p.id === playerId)!;
    if (type === "bang") {
      const idx = me.hand.findIndex((c) => c.id === cardId && canUseAs(me, c, "bang"));
      if (idx < 0) return { ok: false, error: "Không có Bang! hợp lệ" };
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
export function choose(code: string, playerId: string, cardId: string): { ok: boolean; error?: string } {
  const room = rooms.get(code);
  if (!room || !room.pending) return { ok: false };

  if (room.pending.kind === "store") {
    const pending = room.pending;
    if (pending.order[0] !== playerId) return { ok: false, error: "Chưa tới lượt chọn của bạn" };
    const ci = pending.cards.findIndex((c) => c.id === cardId);
    if (ci < 0) return { ok: false, error: "Lá không hợp lệ" };
    const picker = room.players.find((p) => p.id === playerId)!;
    picker.hand.push(pending.cards.splice(ci, 1)[0]);
    pending.order.shift();
    if (pending.order.length === 0) {
      room.discard.push(...pending.cards);
      clearPending(room);
    }
    return { ok: true };
  }

  if (room.pending.kind === "kit") {
    const pending = room.pending;
    if (pending.playerId !== playerId) return { ok: false, error: "Không phải lượt của bạn" };
    const ci = pending.cards.findIndex((c) => c.id === cardId);
    if (ci < 0) return { ok: false, error: "Lá không hợp lệ" };
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

// Sid Ketchum: discard exactly two cards to regain 1 life.
export function sidHeal(code: string, playerId: string, cardIds: string[]): { ok: boolean; error?: string } {
  const room = rooms.get(code);
  if (!room || room.phase !== "playing") return { ok: false };
  // Sid Ketchum may discard 2 cards to regain 1 life AT ANY TIME — on or off his
  // turn, and even while dying (to save himself). So no turn/phase/pending gate.
  const sid = room.players.find((p) => p.id === playerId);
  if (!sid || !sid.alive) return { ok: false };
  if (sid.character?.id !== "sid-ketchum") return { ok: false, error: "Chỉ Sid Ketchum dùng được" };
  if (activeEffect(room).noHeal) return { ok: false, error: "Sự kiện đang cấm hồi máu" };
  if (sid.hp >= sid.maxHp) return { ok: false, error: "Máu đã đầy" };
  if (cardIds.length !== 2 || cardIds[0] === cardIds[1]) return { ok: false, error: "Chọn đúng 2 lá khác nhau" };
  const idxs = cardIds.map((id) => sid.hand.findIndex((c) => c.id === id));
  if (idxs.some((i) => i < 0)) return { ok: false, error: "Không có lá đó" };
  for (const id of cardIds) {
    const i = sid.hand.findIndex((c) => c.id === id);
    room.discard.push(sid.hand.splice(i, 1)[0]);
  }
  sid.hp = Math.min(sid.maxHp, sid.hp + 1);
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
      const beers = t.hand.filter((c) => c.defId === "beer").length;
      if (beers >= 1 - t.hp) room.deathQueue.push({ id: t.id, needed: 1 - t.hp, sourceId: srcId });
      else killPlayer(room, t, srcId);
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
    const beers = t.hand.filter((c) => c.defId === "beer").length;
    if (beers >= entry.needed) {
      room.pending = { kind: "dying", targetId: t.id, sourceId: entry.sourceId, beersNeeded: entry.needed };
      room.deathQueue.shift();
      return; // wait for this player's response
    }
    killPlayer(room, t, entry.sourceId);
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
  // Ceasefire nullifies damage outright.
  if (eff.noDamage) {
    pushLog(room, { kind: "hit", a: target.name, n: 0, hp: target.hp });
    return;
  }
  amount = Math.max(0, amount + (eff.damageDelta ?? 0)); // Wartime and friends
  if (amount === 0) return;
  target.hp -= amount;
  pushLog(room, { kind: "hit", a: target.name, n: amount, hp: Math.max(0, target.hp) });
  // Bart Cassidy: draw a card for each life point lost.
  if (target.character?.id === "bart-cassidy") {
    for (let i = 0; i < amount; i++) {
      const c = drawOne(room);
      if (c) target.hand.push(c);
    }
  }
  // El Gringo: steal a card from the attacker for each life point lost.
  if (target.character?.id === "el-gringo" && sourceId) {
    const src = room.players.find((p) => p.id === sourceId);
    if (src) {
      for (let i = 0; i < amount && src.hand.length > 0; i++) {
        target.hand.push(src.hand.splice(Math.floor(Math.random() * src.hand.length), 1)[0]);
      }
    }
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
  if (target.hp > 0) return;
  const needed = 1 - target.hp; // Beers required to reach 1 HP
  const beers = target.hand.filter((c) => c.defId === "beer").length;
  if (saveable && beers >= needed) {
    // Death is deferred until they answer, so the credit has to ride along on the
    // pending — otherwise passing on the Beer would pay nobody.
    room.pending = { kind: "dying", targetId: target.id, sourceId, creditId, beersNeeded: needed };
  } else {
    killPlayer(room, target, sourceId, creditId);
    checkWin(room);
  }
}

// `creditId` is an INDIRECT kill: the player who set up the death without dealing
// the blow — today only whoever played the Dynamite that went off. It pays the
// bounty on an Outlaw, but deliberately does NOT carry the Sheriff-shoots-Deputy
// penalty: lighting a fuse three turns ago is not the same act as shooting your own
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
  pushLog(room, { kind: "death", a: target.name, role: target.role ?? undefined });
  const cards = [...target.hand, ...target.equipment];
  target.hand = [];
  target.equipment = [];
  // Vulture Sam: a living Sam takes all the dead player's cards instead of discard.
  const sam = room.players.find((p) => p.alive && p.id !== target.id && p.character?.id === "vulture-sam");
  if (sam) sam.hand.push(...cards);
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
    if (p.alive && p.character?.id === "suzy-lafayette" && p.hand.length === 0) {
      const c = drawOne(room);
      if (c) p.hand.push(c);
    }
  }
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
    awardWins(room, winner);
  }
}

// Cộng 1 thắng cho mỗi NGƯỜI (không tính bot) thuộc phe thắng; đủ ngưỡng thì cấp
// vé thưởng escape MỘT LẦN (giữ nguyên link qua các ván sau).
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
  });
  return true;
}

// Play again: reset to the lobby and immediately start a fresh game with the same
// players (re-deal roles + character draft). Falls back to the lobby on error
// (e.g. someone left and the headcount is now invalid).
export function playAgain(code: string): { ok: boolean; error?: string } {
  if (!restart(code)) return { ok: false, error: "Phòng không tồn tại" };
  return startGame(code);
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
    isBot: p.isBot,
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
  const name = (id: string) => room.players.find((x) => x.id === id)?.name ?? "";
  const meId = me?.id;
  // Whether the viewer holds a card usable as `defId` — respects Calamity Janet's
  // Bang!⇄Missed! swap so her reaction buttons show for the substituted card too.
  const has = (defId: string) => {
    if (!me) return false;
    const m = me;
    return m.hand.some((c) => canUseAs(m, c, defId));
  };
  const acts = (mine: boolean, primary: PendingAction | null): PendingAction[] => {
    if (!mine) return [];
    const out: PendingAction[] = [];
    if (primary && has(primary)) out.push(primary);
    out.push("pass");
    return out;
  };

  if (p.kind === "bang") {
    const mine = meId === p.targetId;
    // Only offer "Missed!" if the target holds enough to complete the dodge
    // (2 vs Slab the Killer) — otherwise a lone Missed! would be wasted.
    const remaining = p.missedNeeded - p.missedPlayed;
    const missedAvail = me ? me.hand.filter((c) => canUseAs(me, c, "missed")).length : 0;
    const canDodge = mine && missedAvail >= remaining;
    const actions: PendingAction[] = mine ? (canDodge ? ["missed", "pass"] : ["pass"]) : [];
    return {
      kind: "bang",
      youMustRespond: mine,
      actions,
      missedNeeded: p.missedNeeded,
      missedPlayed: p.missedPlayed,
      actorName: name(p.sourceId),
      targetName: name(p.targetId),
    };
  }
  if (p.kind === "dying") {
    const mine = meId === p.targetId;
    return { kind: "dying", youMustRespond: mine, actions: acts(mine, "beer"), actorName: name(p.targetId) };
  }
  if (p.kind === "multi") {
    const r = p.responders.find((x) => x.id === meId);
    const mine = !!r && !r.done;
    const need = p.effect === "indians" ? "bang" : "missed";
    const waiting = p.responders.filter((x) => !x.done).map((x) => name(x.id));
    return { kind: "multi", youMustRespond: mine, actions: acts(mine, need), actorName: name(p.sourceId), effect: p.effect, waiting };
  }
  if (p.kind === "duel") {
    const mine = meId === p.turnId;
    return {
      kind: "duel",
      youMustRespond: mine,
      actions: acts(mine, "bang"),
      actorName: name(p.aId),
      targetName: name(p.bId),
      turnName: name(p.turnId),
    };
  }
  if (p.kind === "kit") {
    const mine = meId === p.playerId;
    return { kind: "kit", youMustRespond: mine, actions: [], storeCards: mine ? p.cards : [], actorName: name(p.playerId) };
  }
  // store
  const mine = meId === p.order[0];
  return { kind: "store", youMustRespond: mine, actions: [], storeCards: p.cards, actorName: name(p.order[0]) };
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
      // Serving a Jail sentence: it's your turn but the only legal move is to
      // discard down to the limit and pass.
      jailed: isMyTurn && room.jailedTurn,
      range: me ? rangeOf(me, room) : 1,
      // Bang! budget: once per turn by default, unlimited with Volcanic / Willy
      // the Kid, and overridden by events (Hot Streak / Jammed Gun).
      canBang: isMyTurn && !!me && bangBudget(room, me) > 0,
      // House rule: each card type only once per turn — defIds already used.
      playedDefsThisTurn: isMyTurn ? [...room.playedDefsThisTurn] : [],
      // Everything you may NOT play right now, resolved server-side so the client
      // never has to re-implement the house rule or any event restriction.
      blockedDefIds: isMyTurn && me ? blockedDefIdsFor(room, me) : [],
      handLimit: me ? handLimitOf(room, me) : 0,
      wins: me?.wins ?? 0,
      rewardUrl: me?.rewardTicket ?? null, // chỉ view của CHÍNH người thắng đủ ngưỡng mới có link
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
    topDiscard: room.discard.length > 0 ? room.discard[room.discard.length - 1] : null,
    log: room.log,
    eventLevel: room.eventLevel,
    events: room.events.map((ev) => toEventView(room, ev)),
    eventFeed: room.eventFeed.map((ev) => toEventView(room, ev)),
  };
}
