// PHẦN THƯỞNG LIÊN GAME (server-only): thắng đủ số ván trong một phòng Bang ->
// cấp link mở "phòng thoát bí ẩn" bên game Escape Room.
//
// Ký vé bằng REWARD_SECRET (CHUNG với Escape) theo ĐÚNG định dạng escape đọc được
// (lib/net/tickets.ts):  ticket = base64url(payload) + "." + base64url(HMAC_SHA256(payload_b64, SECRET))
//   payload = { rid, jti (duy nhất), exp (epoch giây) }
// Link cuối:  <ESCAPE_BASE_URL>/<ticket>   (escape verify + tiêu vé 1 lần khi mở).
//
// KHÔNG import ở client (dùng node:crypto). Chỉ game.ts (server) gọi.

import crypto from "node:crypto";

// CHUNG secret với Escape. Fallback dev khớp cả hai app để test cross-game không cần set env.
const SECRET = process.env.REWARD_SECRET || "dev-shared-secret-change-me";
// URL gốc của game Escape. Prod đặt = https://escape.room.boardgamehocbai.website
// (lấy từ `terraform output game_url`). Dev mặc định localhost:3000.
const ESCAPE_BASE = (process.env.ESCAPE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const ROOM_ID = process.env.ESCAPE_ROOM_ID || "observatory";
const TTL_SEC = parseInt(process.env.ESCAPE_TICKET_TTL || "604800", 10); // mặc định 7 ngày

if (!process.env.REWARD_SECRET) {
  console.warn("[escapeReward] REWARD_SECRET chưa đặt — dùng secret DEV, không an toàn cho prod.");
}

function b64url(input: crypto.BinaryLike): string {
  return Buffer.from(input as Buffer | string).toString("base64url");
}

// Sinh MỘT link thưởng mới (jti duy nhất -> vé dùng một lần).
export function buildEscapeRewardUrl(): string {
  const payload = { rid: ROOM_ID, jti: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + TTL_SEC };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${ESCAPE_BASE}/${body}.${sig}`;
}
