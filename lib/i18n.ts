"use client";

// Lightweight i18n for the client. Proper nouns (card & character names) stay as
// printed; roles, abilities, UI chrome, banners and messages are translated.
import { useEffect, useState } from "react";
import type { Role } from "./types";
import type { PlayerView } from "./types";

export type Locale = "vi" | "en";

// --- locale store (persisted, shared across components) ---
let current: Locale = "vi";
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}
export function setLocale(l: Locale) {
  current = l;
  try {
    localStorage.setItem("bang:lang", l);
  } catch {}
  listeners.forEach((f) => f());
}
export function initLocale() {
  try {
    const s = localStorage.getItem("bang:lang");
    if (s === "en" || s === "vi") current = s;
  } catch {}
}
export function useLocale(): Locale {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return current;
}

// Pick one of two strings by locale (used for inline UI text).
export function L(locale: Locale, vi: string, en: string): string {
  return locale === "vi" ? vi : en;
}

// --- roles ---
const ROLE_LABEL: Record<Role, [string, string]> = {
  sheriff: ["Cảnh Sát Trưởng", "Sheriff"],
  deputy: ["Phó Cảnh Sát", "Deputy"],
  outlaw: ["Kẻ Ngoài Vòng Pháp Luật", "Outlaw"],
  renegade: ["Kẻ Phản Bội", "Renegade"],
};
const ROLE_GOAL: Record<Role, [string, string]> = {
  sheriff: ["Tiêu diệt tất cả Outlaw và Renegade.", "Eliminate all Outlaws and the Renegade."],
  deputy: ["Bảo vệ Cảnh Sát Trưởng. Thắng cùng phe Cảnh Sát.", "Protect the Sheriff. Win with the Law."],
  outlaw: ["Hạ gục Cảnh Sát Trưởng.", "Kill the Sheriff."],
  renegade: ["Là người sống sót cuối cùng — Cảnh Sát Trưởng chết cuối.", "Be the last one standing — Sheriff dies last."],
};
export const roleLabel = (l: Locale, r: Role) => ROLE_LABEL[r][l === "vi" ? 0 : 1];
export const roleGoal = (l: Locale, r: Role) => ROLE_GOAL[r][l === "vi" ? 0 : 1];

// --- character abilities (names kept as printed) ---
const CHAR_ABILITY: Record<string, [string, string]> = {
  "kit-carlson": ["Xem 3 lá trên cùng bộ bài, chọn 2 lá để rút và trả lá còn lại xuống dưới.", "Look at the top 3 cards of the deck and draw 2 of them; the third goes back."],
  "suzy-lafayette": ["Ngay khi hết bài trên tay, rút 1 lá.", "As soon as she has no cards in hand, she draws a card."],
  "willy-the-kid": ["Có thể chơi bao nhiêu lá Bang! tùy thích mỗi lượt.", "He can play any number of Bang! cards each turn."],
  "jesse-jones": ["Lá rút đầu tiên có thể lấy từ tay một người chơi khác.", "He may draw his first card from a player's hand."],
  "el-gringo": ["Mỗi khi bị một người chơi gây sát thương, rút 1 lá từ tay người đó.", "Each time he is hit by a player, he draws a card from that player's hand."],
  "paul-regret": ["Mọi người thấy anh ta ở khoảng cách +1.", "All players see him at a distance increased by 1."],
  "slab-the-killer": ["Đối thủ cần 2 lá Missed! mới né được Bang! của anh ta.", "Players need 2 Missed! to cancel his Bang!."],
  "jourdonnais": ["Khi là mục tiêu của Bang!, có thể Draw!; ra lá Cơ (Heart) thì coi như Missed!.", "When targeted by a Bang!, he may Draw!; on a Heart he is Missed!."],
  "lucky-duke": ["Mỗi khi Draw!, lật 2 lá trên cùng và chọn 1.", "Each time he Draws!, he flips the top two cards and picks one."],
  "calamity-janet": ["Có thể dùng Bang! làm Missed! và ngược lại.", "She can play Bang! as Missed! and vice versa."],
  "rose-doolan": ["Thấy mọi người ở khoảng cách −1.", "She sees all players at a distance decreased by 1."],
  "vulture-sam": ["Mỗi khi một người chơi bị loại, lấy toàn bộ bài của người đó vào tay.", "Whenever a player is eliminated, he takes all their cards into his hand."],
  "pedro-ramirez": ["Lá rút đầu tiên có thể lấy từ chồng bài bỏ (discard).", "He may draw his first card from the discard pile."],
  "bart-cassidy": ["Mỗi khi bị mất máu, rút 1 lá.", "Each time he loses a life point, he draws a card."],
  "black-jack": ["Lá rút thứ hai được lật ngửa; nếu là Cơ/Rô thì rút thêm 1 lá.", "He reveals his 2nd drawn card; on Heart/Diamond he draws one more."],
  "sid-ketchum": ["Có thể bỏ 2 lá để hồi 1 máu.", "He may discard 2 cards to regain 1 life point."],
};
export const charAbility = (l: Locale, id?: string | null) =>
  (id && CHAR_ABILITY[id] ? CHAR_ABILITY[id][l === "vi" ? 0 : 1] : "");

// --- winner ---
const WINNER: Record<string, [string, string]> = {
  sheriff: ["Phe Cảnh Sát thắng! ⭐", "The Law wins! ⭐"],
  outlaws: ["Phe Ngoài Vòng Pháp Luật thắng! 🤠", "The Outlaws win! 🤠"],
  renegade: ["Kẻ Phản Bội thắng! 🐍", "The Renegade wins! 🐍"],
};
export const winnerText = (l: Locale, w: string) => (WINNER[w] ? WINNER[w][l === "vi" ? 0 : 1] : "");

// --- pending descriptions (built from structured fields) ---
export function formatPending(l: Locale, p: PlayerView["pending"]): string {
  if (!p) return "";
  const a = p.actorName;
  const b = p.targetName ?? "";
  switch (p.kind) {
    case "bang":
      return L(l, `${a} bắn Bang! vào ${b}`, `${a} shoots Bang! at ${b}`);
    case "dying":
      return L(l, `${a} sắp gục — cần Beer để sống`, `${a} is dying — needs a Beer to survive`);
    case "multi":
      return p.effect === "indians"
        ? L(l, `${a} dùng Indians! — bỏ 1 Bang! hoặc mất 1 máu`, `${a} plays Indians! — discard a Bang! or lose 1 life`)
        : L(l, `${a} dùng Gatling — đánh Missed! hoặc mất 1 máu`, `${a} plays Gatling — play a Missed! or lose 1 life`);
    case "duel":
      return L(l, `Duel: ${a} vs ${b} — tới lượt ${p.turnName} bỏ Bang!`, `Duel: ${a} vs ${b} — ${p.turnName} must discard a Bang!`);
    case "kit":
      return L(l, `${a} (Kit Carlson) chọn 2 trong 3 lá`, `${a} (Kit Carlson) picks 2 of 3 cards`);
    case "store":
      return L(l, `General Store — ${a} đang chọn bài`, `General Store — ${a} is picking`);
  }
}

// --- Draw! check reveals ---
const CHECK_KIND: Record<string, [string, string]> = {
  dynamite: ["Dynamite", "Dynamite"],
  jail: ["Jail", "Jail"],
  barrel: ["Barrel", "Barrel"],
  blackjack: ["Black Jack", "Black Jack"],
};
const CHECK_OUTCOME: Record<string, [string, string]> = {
  blast: ["Nổ! −3 máu", "Blast! −3 life"],
  safe: ["An toàn", "Safe"],
  free: ["Thoát tù", "Freed"],
  skip: ["Bỏ lượt", "Turn skipped"],
  hit: ["Né được!", "Missed!"],
  miss: ["Trượt", "No luck"],
  bonus: ["Rút thêm 1!", "Draw 1 more!"],
  nobonus: ["Không thêm", "No bonus"],
};
export function checkText(l: Locale, kind: string, outcome: string): { kind: string; outcome: string } {
  const i = l === "vi" ? 0 : 1;
  return {
    kind: CHECK_KIND[kind]?.[i] ?? kind,
    outcome: CHECK_OUTCOME[outcome]?.[i] ?? outcome,
  };
}

// --- action buttons ---
const ACTIONS: Record<string, [string, string]> = {
  missed: ["Đánh Missed!", "Play Missed!"],
  beer: ["Uống Beer 🍺", "Drink Beer 🍺"],
  bang: ["Bỏ 1 Bang!", "Discard a Bang!"],
  pass: ["Bỏ qua / Chịu", "Pass / Take it"],
};
export const actionLabel = (l: Locale, a: string) => (ACTIONS[a] ? ACTIONS[a][l === "vi" ? 0 : 1] : a);

// --- error messages (server sends Vietnamese; map to EN, with a few parametric) ---
const ERROR_EN: Record<string, string> = {
  "Phòng không tồn tại": "Room not found",
  "Ván đang diễn ra, không thể vào": "Game in progress — can't join",
  "Không tìm thấy người chơi": "Player not found",
  "Không vào lại được phòng": "Couldn't rejoin the room",
  "Ván đã bắt đầu": "The game already started",
  "Số người chơi không hợp lệ": "Invalid player count",
  "Bạn phải rút bài trước": "You must draw first",
  "Đang chờ phản ứng": "Waiting for a reaction",
  "Mục tiêu không hợp lệ": "Invalid target",
  "Mục tiêu ngoài tầm bắn": "Target out of range",
  "Chỉ 1 Bang!/lượt (trừ Volcanic/Willy)": "Only 1 Bang! per turn (unless Volcanic/Willy)",
  "Không thể bỏ tù Cảnh Sát Trưởng": "Can't jail the Sheriff",
  "Người này đã bị giam": "That player is already jailed",
  "Máu đã đầy": "Life is already full",
  "Missed! chỉ dùng để phản ứng Bang!": "Missed! can only be used to react to a Bang!",
  "Chỉ lấy được của người ở khoảng cách 1": "Only from a player at distance 1",
  "Mục tiêu không có bài": "Target has no cards",
  "Không phải lượt phản ứng của bạn": "Not your turn to react",
  "Không có lá né hợp lệ": "No valid card to dodge with",
  "Không có Beer đó": "No such Beer",
  "Chưa tới lượt bạn trong Duel": "Not your turn in the Duel",
  "Không có Bang! hợp lệ": "No valid Bang!",
  "Chưa tới lượt chọn của bạn": "Not your turn to pick",
  "Lá không hợp lệ": "Invalid card",
  "Không phải lượt của bạn": "Not your turn",
  "Chỉ Sid Ketchum dùng được": "Only Sid Ketchum can do this",
  "Chọn đúng 2 lá khác nhau": "Pick exactly 2 different cards",
  "Không có lá đó": "No such card",
};
export function tError(l: Locale, msg: string): string {
  if (l === "vi") return msg;
  if (ERROR_EN[msg]) return ERROR_EN[msg];
  // Parametric fallbacks.
  let m = msg.match(/^Bỏ bớt (\d+) lá/);
  if (m) return `Discard ${m[1]} card(s) (limit = life)`;
  m = msg.match(/^Cần tối thiểu (\d+) người/);
  if (m) return `Need at least ${m[1]} players`;
  m = msg.match(/^Tối đa (\d+) người/);
  if (m) return `At most ${m[1]} players`;
  m = msg.match(/^Phòng đã đầy \(tối đa (\d+)\)/);
  if (m) return `Room full (max ${m[1]})`;
  m = msg.match(/^Đã có .+ trên bàn$/);
  if (m) return "Already in play";
  m = msg.match(/^Không có (Bang!|Missed!) hợp lệ$/);
  if (m) return `No valid ${m[1]}`;
  return msg;
}
