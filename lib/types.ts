// Shared types between the server (game engine) and the client (React).
// SCOPE: this file currently covers the ROOM layer only (lobby, seating, roles,
// turn order). Card decks, character abilities and combat are intentionally left
// as placeholders — they'll be filled in once the concrete rules/characters are
// provided.

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

// ─── Placeholders for the card/character layer (filled in later) ─────────────

// A card in hand or on the table. Only the shape is fixed for now.
export interface Card {
  id: string;
  name: string; // e.g. "bang", "missed", "beer" — concrete set added later
}

// A character with a special ability. Abilities are added with the real rules.
export interface Character {
  id: string;
  name: string;
  maxHp: number; // "bullets" / life points
  ability: string;
}

// ─── Game phases ─────────────────────────────────────────────────────────────

export type Phase = "lobby" | "playing" | "result";

// ─── Views sent to clients ───────────────────────────────────────────────────

// What everyone at the table can see about a player. Secret info (exact role
// while alive, cards in hand) is NOT included here.
export interface PlayerPublic {
  id: string;
  name: string;
  seat: number; // fixed clockwise seat index around the table
  isHost: boolean;
  connected: boolean;
  alive: boolean;
  hp: number;
  maxHp: number;
  handCount: number; // how many cards they hold — count only, never contents
  characterName: string | null;
  role: Role | null; // visible only for public roles (Sheriff) or dead players
  isTurn: boolean;
}

// Personalized view sent to ONE player — the only place secret info appears,
// and only for the receiving player.
export interface PlayerView {
  code: string;
  phase: Phase;
  hostId: string;
  you: {
    id: string;
    name: string;
    seat: number;
    isHost: boolean;
    role: Role | null; // your own role (you always see it once dealt)
    characterName: string | null;
    hp: number;
    maxHp: number;
    hand: Card[]; // your own hand (empty until the card layer lands)
    alive: boolean;
  };
  players: PlayerPublic[]; // everyone, in seat order (including you)
  turnSeat: number | null; // whose turn it is (seat index), null in lobby/result
  roleSetup: { role: Role; count: number }[]; // role distribution for this count
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
  endTurn: (data: { code: string }) => void; // placeholder turn advance (no cards yet)
  restart: (data: { code: string }) => void;
}

export interface ServerToClientEvents {
  view: (view: PlayerView) => void;
  errorMsg: (msg: string) => void;
}
