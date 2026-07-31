// Shared types between the server (game engine) and the client (React):
// rooms, roles, the character draft, cards, combat, and the socket events.

// ─── Roles (hidden identity, Bang! base game) ────────────────────────────────

import type { GameError } from "./errors";

export type Role = "sheriff" | "deputy" | "outlaw" | "renegade";

export const ROLE_EMOJI: Record<Role, string> = {
  sheriff: "⭐",
  deputy: "🎖️",
  outlaw: "🤠",
  renegade: "🐍",
};

// Bang! plays 4–7 in the base game. This room is capped at 7 as requested. Lives
// here, not in game.ts: the client needs them for the lobby, and game.ts pulls in
// node:crypto (escapeReward) so it cannot be imported from the browser.
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 7;

// The Sheriff's identity is public from the start; everyone else is hidden until
// death (or the end of the game).
export const PUBLIC_ROLES: Role[] = ["sheriff"];

// ─── Characters ──────────────────────────────────────────────────────────────

// Tier rank used only as a draft safety net — if a player leaves before picking,
// their character is auto-resolved by rank (higher wins; A > B > C > D > unranked).
export type CharRank = "A" | "B" | "C" | "D" | null;

export interface Character {
  id: string; // stable slug
  name: string;
  rank: CharRank;
  maxHp: number; // "bullets" / life points (Sheriff gets +1 on top)
  effect: CharacterEffect;
}

// A character's ability as DATA, the same way events.ts models events: the engine
// reads these at fixed checkpoints instead of comparing character ids, so adding a
// character means adding one entry here. The whole object rides along in the view,
// so the client and the bot read the same fields rather than keeping their own
// copies of who can do what.
export interface CharacterEffect {
  // --- how the draw phase works (default: draw 2 off the deck) ---
  //  kit       : reveal drawCount+1, keep drawCount, bottom the rest
  //  jesse     : first card may come from a chosen player's hand
  //  pedro     : first card may come off the discard pile
  //  blackjack : reveal the 2nd; on Heart/Diamond draw a bonus card
  drawMode?: "kit" | "jesse" | "pedro" | "blackjack";

  // --- shooting ---
  unlimitedBang?: boolean; // Bang!/turn budget lifted (as if holding a Volcanic)
  missedNeededDelta?: number; // extra Missed! the target must produce
  // Cards this character may play in place of one another, both ways.
  useAs?: [string, string];

  // --- being shot at ---
  extraBarrel?: number; // innate Barrel-style Draw!s, on top of Barrels in play
  distanceToDelta?: number; // others see this player this much farther away
  distanceSeenDelta?: number; // this player sees everyone this much closer

  // --- draw! checks ---
  luckyDraw?: boolean; // flip two, keep the better card

  // --- reactions to damage and death ---
  drawOnDamage?: boolean; // draw one card per life point lost
  stealOnDamage?: boolean; // steal one card from the attacker per life point lost
  burnTwoToHeal?: boolean; // discard any 2 cards to regain 1 life, at any time
  refillWhenEmpty?: boolean; // draw immediately whenever the hand runs out
  inheritsDeadCards?: boolean; // takes a dead player's cards instead of the discard
}

export const CHARACTERS: Character[] = [
  { id: "kit-carlson", name: "Kit Carlson", rank: "A", maxHp: 4, effect: { drawMode: "kit" } },
  { id: "suzy-lafayette", name: "Suzy Lafayette", rank: "A", maxHp: 4, effect: { refillWhenEmpty: true } },
  { id: "willy-the-kid", name: "Willy the Kid", rank: null, maxHp: 4, effect: { unlimitedBang: true } },
  { id: "jesse-jones", name: "Jesse Jones", rank: null, maxHp: 4, effect: { drawMode: "jesse" } },
  { id: "el-gringo", name: "El Gringo", rank: null, maxHp: 3, effect: { stealOnDamage: true } },
  { id: "paul-regret", name: "Paul Regret", rank: "B", maxHp: 3, effect: { distanceToDelta: 1 } },
  { id: "slab-the-killer", name: "Slab the Killer", rank: "A", maxHp: 4, effect: { missedNeededDelta: 1 } },
  { id: "jourdonnais", name: "Jourdonnais", rank: "A", maxHp: 4, effect: { extraBarrel: 1 } },
  { id: "lucky-duke", name: "Lucky Duke", rank: "A", maxHp: 4, effect: { luckyDraw: true } },
  { id: "calamity-janet", name: "Calamity Janet", rank: null, maxHp: 4, effect: { useAs: ["bang", "missed"] } },
  { id: "rose-doolan", name: "Rose Doolan", rank: null, maxHp: 4, effect: { distanceSeenDelta: 1 } },
  { id: "vulture-sam", name: "Vulture Sam", rank: "D", maxHp: 4, effect: { inheritsDeadCards: true } },
  { id: "pedro-ramirez", name: "Pedro Ramirez", rank: "B", maxHp: 4, effect: { drawMode: "pedro" } },
  { id: "bart-cassidy", name: "Bart Cassidy", rank: "C", maxHp: 4, effect: { drawOnDamage: true } },
  { id: "black-jack", name: "Black Jack", rank: "B", maxHp: 4, effect: { drawMode: "blackjack" } },
  { id: "sid-ketchum", name: "Sid Ketchum", rank: null, maxHp: 4, effect: { burnTwoToHeal: true } },
];

// Auto-resolve priority for the draft safety net: A > B > C > D > unranked.
export const RANK_PRIORITY: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
export function rankPriority(rank: CharRank): number {
  return rank ? RANK_PRIORITY[rank] ?? 0 : 0;
}

// ─── Cards ───────────────────────────────────────────────────────────────────

import type { Card } from "./cards";
export type { Card };

// ─── Game phases ─────────────────────────────────────────────────────────────

export type Phase = "lobby" | "drafting" | "playing" | "result";

export type TurnPhase = "draw" | "play" | "discard";

export type Winner = "sheriff" | "outlaws" | "renegade";

// An unresolved action that locks the table until responded to.
//  - bang:  a target dodges with Missed!(s) or takes the hit
//  - dying: a player at 0 HP plays Beer(s) to survive
//  - multi: Indians!/Gatling — each other player defends or takes 1
//  - duel:  two players alternate discarding Bang!; first to fail loses 1
//  - store: General Store — players pick a revealed card in turn order
export type PendingKind = "bang" | "dying" | "multi" | "duel" | "store" | "kit" | "check";
export type PendingAction = "missed" | "beer" | "bang" | "pass";

export interface PendingView {
  kind: PendingKind;
  youMustRespond: boolean; // is it your turn to act right now
  actions: PendingAction[]; // response buttons to show you
  storeCards?: Card[]; // store: revealed cards to pick from
  checks?: CheckView[]; // check: the Dynamite/Jail reveal(s) being acknowledged
  missedNeeded?: number; // bang: Missed! required (2 vs Slab)
  missedPlayed?: number; // bang: Missed! played so far
  // Names/params for the client to build a localized description:
  actorName: string; // main actor (shooter / source / duel A / picker / Kit)
  targetName?: string; // secondary (bang target / duel B / dying player)
  turnName?: string; // duel: whose turn to discard now
  effect?: "indians" | "gatling"; // multi effect
  waiting?: string[]; // multi: names of players who haven't reacted yet
}

// ─── Random events ───────────────────────────────────────────────────────────

import type { EventLevel, EventScope } from "./events";
export type { EventLevel };

// One active (or just-fired) event, as shown to clients. Every event is table-wide
// (one per round, at the Sheriff's turn) and none singles out a player, so there is
// no target to name. Names/descriptions are localized on the client (lib/i18n.ts).
export interface EventView {
  seq: number; // monotonic: lets the client detect a NEW event to announce
  id: string;
  emoji: string;
  scope: EventScope;
  turnsLeft?: number; // lasting only — turns of this round the rule still covers
}

// ─── Views sent to clients ───────────────────────────────────────────────────

export interface PlayerPublic {
  id: string;
  name: string;
  seat: number;
  isHost: boolean;
  isBot: boolean; // server-controlled AI player (for testing / filling seats)
  connected: boolean;
  alive: boolean;
  hp: number;
  maxHp: number;
  handCount: number;
  character: Character | null; // face-up once the game starts (public in Bang!)
  hasPicked: boolean; // draft progress (whether they've locked a character)
  role: Role | null; // visible only for public roles (Sheriff) or dead players
  isTurn: boolean;
  distance: number | null; // distance from the viewing player (null for self / not playing)
  equipment: Card[]; // blue cards in play (guns, Mustang, Scope, Jail, Dynamite...)
}

// Draft state, personalized: `choices` are only ever THIS player's two options.
export interface DraftView {
  choices: Character[]; // your two candidate characters
  youPicked: boolean;
  yourPick: Character | null;
  pickedCount: number;
  totalCount: number;
  waitingFor: string[]; // names still choosing
}

// One resolved "Draw!" reveal (upkeep Dynamite/Jail, or Barrel), shown briefly.
export interface CheckView {
  name: string; // whose card was checked
  card: Card | null; // the flipped/revealed card
  kind: string; // "dynamite" | "jail" | "barrel" | "blackjack" | "lucky-duke" ...
  outcome: string; // human-readable result
}

export interface PlayerView {
  code: string;
  phase: Phase;
  hostId: string;
  you: {
    id: string;
    name: string;
    seat: number;
    isHost: boolean;
    // May press Start / Play again. The host always may; in a matchmade (public)
    // room so may anyone seated, because the "host" there is just whoever the
    // matchmaker happened to seat first — if they wander off, host-only would
    // leave six people staring at a button none of them can press.
    canStart: boolean;
    role: Role | null;
    character: Character | null;
    hp: number;
    maxHp: number;
    hand: Card[];
    equipment: Card[];
    alive: boolean;
    turnPhase: TurnPhase | null; // your current turn sub-phase (null if not your turn)
    jailed: boolean; // failed a Jail check: may only discard to the limit, then pass
    range: number; // how far you can Bang! (weapon range, default 1)
    canBang: boolean; // may you still play a Bang! this turn (once, or unlimited w/ Volcanic/Willy)
    playedDefsThisTurn: string[]; // house rule: card types already played this turn (each once; Bang!/guns exempt)
    blockedDefIds: string[]; // card types you cannot play right now (house rule + events)
    // defId -> ids this card may be aimed at, resolved by the engine. The client
    // must not re-derive targeting rules: it had its own copy and did not know
    // about Truce, so it painted crosshairs on a Sheriff the server would refuse.
    legalTargets: Record<string, string[]>;
    legalDrawTargets: string[]; // players whose hand your draw phase may take from
    handLimit: number; // cards you may keep at end of turn (= hp, ± events)
    wins: number; // your cumulative wins in this room
    rewardUrl: string | null; // escape reward, present only once you hit the threshold
  };
  players: PlayerPublic[];
  turnSeat: number | null;
  roleSetup: { role: Role; count: number }[];
  draft: DraftView | null; // present only during the drafting phase
  pending: PendingView | null; // an unresolved reaction locking the table
  winner: Winner | null; // set in the result phase
  checks: CheckView[]; // recent Draw! reveals to show (upkeep / Barrel)
  deckCount: number; // cards left in the draw pile
  discardCount: number; // cards in the discard pile
  topDiscard: Card | null; // top card of the discard pile (for the center play area)
  log: LogEntry[]; // recent action history (oldest → newest)
  eventLevel: EventLevel; // room setting: how often random events fire
  events: EventView[]; // events currently in force
  eventFeed: EventView[]; // recently fired events, oldest first — announce any `seq` you haven't shown
}

// One entry in the action history. Formatted per-locale on the client.
export interface LogEntry {
  id: number;
  kind:
    | "play" | "hit" | "heal" | "death" | "draw" | "turn" | "react"
    | "check" | "discard" | "surrender" | "event";
  a?: string; // primary actor name
  b?: string; // target name
  card?: string; // card name (or the drawn card label for a check, e.g. "5♠")
  n?: number; // count (cards drawn, life points, cards discarded)
  hp?: number; // resulting HP
  role?: Role; // revealed role (death)
  checkKind?: string; // Draw! check type (dynamite/jail/barrel/blackjack)
  outcome?: string; // Draw! check outcome key
  event?: string; // random-event id (kind "event")
}

// ─── Socket.IO event payloads ────────────────────────────────────────────────

export interface ClientToServerEvents {
  createRoom: (
    data: { name: string },
    cb: (res: { code: string; playerId: string }) => void
  ) => void;
  joinRoom: (
    data: { code: string; name: string },
    cb: (res: { ok: boolean; playerId?: string; error?: GameError }) => void
  ) => void;
  // One-tap matchmaking: no code to type. `seats` are the (code, playerId) pairs
  // this browser remembers, so a returning player is put back in their own seat
  // instead of a stranger's lobby. Never fails — worst case it opens a new lobby.
  quickJoin: (
    data: { name: string; seats: { code: string; playerId: string }[] },
    cb: (res: { code: string; playerId: string; kind: "rejoin" | "joined" | "created" }) => void
  ) => void;
  rejoin: (
    data: { code: string; playerId: string },
    cb: (res: { ok: boolean; error?: GameError }) => void
  ) => void;
  startGame: (data: { code: string }) => void;
  setEventLevel: (data: { code: string; level: EventLevel }) => void; // host: random-event frequency
  addBot: (data: { code: string }) => void; // host: add an AI player (testing)
  removeBot: (data: { code: string }) => void; // host: remove the last AI player
  pickCharacter: (data: { code: string; characterId: string }) => void;
  drawCards: (data: { code: string; source?: "deck" | "discard" | "player"; targetId?: string }) => void; // draw phase
  sidHeal: (data: { code: string; cardIds: string[] }) => void; // Sid Ketchum: discard 2 to heal 1
  playCard: (data: { code: string; cardId: string; targetId?: string; targetCardId?: string }) => void; // play a card
  respond: (data: { code: string; type: "missed" | "beer" | "bang" | "pass"; cardId?: string }) => void; // reply to a pending
  choose: (data: { code: string; cardId: string }) => void; // pick a card (General Store)
  discardCard: (data: { code: string; cardId: string }) => void; // discard from hand
  endTurn: (data: { code: string }) => void;
  surrender: (data: { code: string }) => void; // concede: remove yourself from the game
  restart: (data: { code: string }) => void; // back to lobby
  playAgain: (data: { code: string }) => void; // restart + immediately deal a new game

  // --- WebRTC voice/video (mesh) signaling ---
  // Turn media on: server registers this socket as media-ready and replies with
  // `rtcReady` (ICE config + existing media peers). Newcomer initiates offers.
  rtcJoin: (data: { code: string }) => void;
  // Turn media off / leave the call (also handled on disconnect).
  rtcLeave: (data: { code: string }) => void;
  // Relay an SDP offer/answer or ICE candidate to one specific peer (`to` = their socket id).
  rtcSignal: (data: { code: string; to: string; data: RtcSignalData }) => void;
}

// One signaling payload: either a session description (offer/answer) or an ICE
// candidate. Kept loose on purpose — it is just relayed between browsers.
export interface RtcSignalData {
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

// A media-enabled peer in the room, identified by its socket id.
export interface RtcPeer {
  id: string; // socket id — the signaling address
  playerId: string; // seat identity, so the client can put this feed on the right seat
  name: string; // player display name
}

export interface ServerToClientEvents {
  view: (view: PlayerView) => void;
  errorMsg: (e: GameError) => void;

  // --- WebRTC voice/video (mesh) signaling ---
  // Sent to the joiner right after `rtcJoin`: ICE servers to use and the peers
  // already in the call (which the joiner will send offers to).
  rtcReady: (data: { selfId: string; iceServers: RTCIceServer[]; peers: RtcPeer[] }) => void;
  // A new peer entered the call; existing peers wait for that peer's offer.
  rtcPeerJoin: (peer: RtcPeer) => void;
  // A peer turned media off or disconnected; tear down that connection.
  rtcPeerLeave: (data: { id: string }) => void;
  // An incoming SDP/ICE payload relayed from `from` (their socket id).
  rtcSignal: (data: { from: string; data: RtcSignalData }) => void;
}
