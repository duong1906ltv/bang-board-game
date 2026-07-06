// Shared types between the server (game engine) and the client (React).
// SCOPE: room layer + character draft. Card decks and combat are still
// placeholders — filled in once the concrete card rules are provided.

// ─── Roles (hidden identity, Bang! base game) ────────────────────────────────

export type Role = "sheriff" | "deputy" | "outlaw" | "renegade";

export const ROLE_LABELS: Record<Role, string> = {
  sheriff: "Cảnh Sát Trưởng",
  deputy: "Phó Cảnh Sát",
  outlaw: "Kẻ Ngoài Vòng Pháp Luật",
  renegade: "Kẻ Phản Bội",
};

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

// Tier rank used only to auto-resolve the draft when a player runs out of time
// (higher tier wins; A > B > C > D > unranked).
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

// Auto-resolve priority for a timed-out draft pick: A > B > C > D > unranked.
export const RANK_PRIORITY: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
export function rankPriority(rank: CharRank): number {
  return rank ? RANK_PRIORITY[rank] ?? 0 : 0;
}

// ─── Cards ───────────────────────────────────────────────────────────────────

import type { Card } from "./cards";
export type { Card };

// ─── Game phases ─────────────────────────────────────────────────────────────

export type Phase = "lobby" | "drafting" | "playing" | "result";

// ─── Views sent to clients ───────────────────────────────────────────────────

export interface PlayerPublic {
  id: string;
  name: string;
  seat: number;
  isHost: boolean;
  connected: boolean;
  alive: boolean;
  hp: number;
  maxHp: number;
  handCount: number;
  character: Character | null; // face-up once the game starts (public in Bang!)
  hasPicked: boolean; // draft progress (whether they've locked a character)
  role: Role | null; // visible only for public roles (Sheriff) or dead players
  isTurn: boolean;
}

// Draft state, personalized: `choices` are only ever THIS player's two options.
export interface DraftView {
  endsAt: number | null; // epoch ms deadline for the 30s pick window
  choices: Character[]; // your two candidate characters
  youPicked: boolean;
  yourPick: Character | null;
  pickedCount: number;
  totalCount: number;
  waitingFor: string[]; // names still choosing
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
    alive: boolean;
  };
  players: PlayerPublic[];
  turnSeat: number | null;
  roleSetup: { role: Role; count: number }[];
  draft: DraftView | null; // present only during the drafting phase
  deckCount: number; // cards left in the draw pile
  discardCount: number; // cards in the discard pile
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
  pickCharacter: (data: { code: string; characterId: string }) => void;
  endTurn: (data: { code: string }) => void;
  restart: (data: { code: string }) => void;
}

export interface ServerToClientEvents {
  view: (view: PlayerView) => void;
  errorMsg: (msg: string) => void;
}
