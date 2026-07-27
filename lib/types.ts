// Shared types between the server (game engine) and the client (React):
// rooms, roles, the character draft, cards, combat, and the socket events.

// ─── Roles (hidden identity, Bang! base game) ────────────────────────────────

export type Role = "sheriff" | "deputy" | "outlaw" | "renegade";

export const ROLE_EMOJI: Record<Role, string> = {
  sheriff: "⭐",
  deputy: "🎖️",
  outlaw: "🤠",
  renegade: "🐍",
};

export const ROLE_GOAL: Record<Role, string> = {
  sheriff: "Tiêu diệt tất cả Outlaw và Renegade.",
  deputy: "Bảo vệ Cảnh Sát Trưởng. Thắng cùng phe Cảnh Sát.",
  outlaw: "Hạ gục Cảnh Sát Trưởng.",
  renegade: "Là người sống sót cuối cùng — hạ mọi người, Cảnh Sát Trưởng cuối cùng.",
};

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
  ability: string;
}

export const CHARACTERS: Character[] = [
  { id: "kit-carlson", name: "Kit Carlson", rank: "A", maxHp: 4, ability: "Xem 3 lá trên cùng bộ bài, chọn 2 lá để rút và trả lá còn lại xuống dưới." },
  { id: "suzy-lafayette", name: "Suzy Lafayette", rank: "A", maxHp: 4, ability: "Ngay khi hết bài trên tay, rút 1 lá." },
  { id: "willy-the-kid", name: "Willy the Kid", rank: null, maxHp: 4, ability: "Có thể chơi bao nhiêu lá Bang! tùy thích mỗi lượt (như súng Volcanic)." },
  { id: "jesse-jones", name: "Jesse Jones", rank: null, maxHp: 4, ability: "Lá rút đầu tiên có thể lấy từ tay một người chơi khác." },
  { id: "el-gringo", name: "El Gringo", rank: null, maxHp: 3, ability: "Mỗi khi bị một người chơi gây sát thương, rút 1 lá từ tay người đó." },
  { id: "paul-regret", name: "Paul Regret", rank: "B", maxHp: 3, ability: "Mọi người thấy anh ta ở khoảng cách +1." },
  { id: "slab-the-killer", name: "Slab the Killer", rank: "A", maxHp: 4, ability: "Đối thủ cần 2 lá Missed! mới né được Bang! của anh ta." },
  { id: "jourdonnais", name: "Jourdonnais", rank: "A", maxHp: 4, ability: "Khi là mục tiêu của Bang!, có thể Draw!; ra lá Cơ (Heart) thì coi như Missed!." },
  { id: "lucky-duke", name: "Lucky Duke", rank: "A", maxHp: 4, ability: "Mỗi khi Draw!, lật 2 lá trên cùng và chọn 1." },
  { id: "calamity-janet", name: "Calamity Janet", rank: null, maxHp: 4, ability: "Có thể dùng Bang! làm Missed! và ngược lại." },
  { id: "rose-doolan", name: "Rose Doolan", rank: null, maxHp: 4, ability: "Thấy mọi người ở khoảng cách −1." },
  { id: "vulture-sam", name: "Vulture Sam", rank: "D", maxHp: 4, ability: "Mỗi khi một người chơi bị loại, lấy toàn bộ bài của người đó vào tay." },
  { id: "pedro-ramirez", name: "Pedro Ramirez", rank: "B", maxHp: 4, ability: "Lá rút đầu tiên có thể lấy từ chồng bài bỏ (discard)." },
  { id: "bart-cassidy", name: "Bart Cassidy", rank: "C", maxHp: 4, ability: "Mỗi khi bị mất máu, rút 1 lá." },
  { id: "black-jack", name: "Black Jack", rank: "B", maxHp: 4, ability: "Lá rút thứ hai được lật ngửa; nếu là Cơ/Rô (Heart/Diamond) thì rút thêm 1 lá." },
  { id: "sid-ketchum", name: "Sid Ketchum", rank: null, maxHp: 4, ability: "Có thể bỏ 2 lá để hồi 1 máu." },
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

// Sub-phases within a single player's turn.
export type TurnPhase = "draw" | "play" | "discard";

// Who won, once the game ends.
export type Winner = "sheriff" | "outlaws" | "renegade";

// An unresolved action that locks the table until responded to.
//  - bang:  a target dodges with Missed!(s) or takes the hit
//  - dying: a player at 0 HP plays Beer(s) to survive
//  - multi: Indians!/Gatling — each other player defends or takes 1
//  - duel:  two players alternate discarding Bang!; first to fail loses 1
//  - store: General Store — players pick a revealed card in turn order
export type PendingKind = "bang" | "dying" | "multi" | "duel" | "store" | "kit";
export type PendingAction = "missed" | "beer" | "bang" | "pass";

export interface PendingView {
  kind: PendingKind;
  youMustRespond: boolean; // is it your turn to act right now
  actions: PendingAction[]; // response buttons to show you
  storeCards?: Card[]; // store: revealed cards to pick from
  missedNeeded?: number; // bang: Missed! required (2 vs Slab)
  missedPlayed?: number; // bang: Missed! played so far
  // Names/params for the client to build a localized description:
  actorName: string; // main actor (shooter / source / duel A / picker / Kit)
  targetName?: string; // secondary (bang target / duel B / dying player)
  turnName?: string; // duel: whose turn to discard now
  effect?: "indians" | "gatling"; // multi effect
  waiting?: string[]; // multi: names of players who haven't reacted yet
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
    role: Role | null;
    character: Character | null;
    hp: number;
    maxHp: number;
    hand: Card[];
    equipment: Card[];
    alive: boolean;
    turnPhase: TurnPhase | null; // your current turn sub-phase (null if not your turn)
    range: number; // how far you can Bang! (weapon range, default 1)
    canBang: boolean; // may you still play a Bang! this turn (once, or unlimited w/ Volcanic/Willy)
    playedDefsThisTurn: string[]; // house rule: card types already played this turn (each once; Bang!/guns exempt)
    wins: number; // số ván bạn đã thắng trong phòng này (cộng dồn)
    rewardUrl: string | null; // link phần thưởng escape (chỉ có khi thắng đủ ngưỡng)
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
}

// One entry in the action history. Formatted per-locale on the client.
export interface LogEntry {
  id: number;
  kind: "play" | "hit" | "heal" | "death" | "draw" | "turn" | "react" | "check" | "discard" | "surrender";
  a?: string; // primary actor name
  b?: string; // target name
  card?: string; // card name (or the drawn card label for a check, e.g. "5♠")
  n?: number; // count (cards drawn, life points, cards discarded)
  hp?: number; // resulting HP
  role?: Role; // revealed role (death)
  checkKind?: string; // Draw! check type (dynamite/jail/barrel/blackjack)
  outcome?: string; // Draw! check outcome key
}

// ─── Socket.IO event payloads ────────────────────────────────────────────────

export interface ClientToServerEvents {
  createRoom: (
    data: { name: string },
    cb: (res: { code: string; playerId: string }) => void
  ) => void;
  joinRoom: (
    data: { code: string; name: string },
    cb: (res: { ok: boolean; playerId?: string; error?: string }) => void
  ) => void;
  rejoin: (
    data: { code: string; playerId: string },
    cb: (res: { ok: boolean; error?: string }) => void
  ) => void;
  startGame: (data: { code: string }) => void;
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
  errorMsg: (msg: string) => void;

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
