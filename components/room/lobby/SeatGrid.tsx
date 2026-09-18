"use client";

// Cái bàn, vẽ ra thành ghế. Trước đây phòng chờ chỉ có dòng "2/8 người" và một danh sách
// đúng bằng số người đã vào — nên sáu chỗ còn trống là vô hình, và người chờ không thấy
// bàn đang đầy dần.
//
// Ghế trống của chủ bàn kiêm luôn nút thêm bot, nên mục "Thêm AI để test" tách riêng
// biến mất: chỗ để thêm người vào bàn chính là chỗ người đó sẽ ngồi.
import type { PlayerPublic } from "@/lib/types";
import { MAX_PLAYERS } from "@/lib/types";
import { L, useLocale } from "@/lib/i18n";
import { AVATAR_COLORS } from "@/lib/seat-colors";

export function SeatGrid({
  players,
  youId,
  isHost,
  onAddBot,
  onRemoveBot,
}: {
  players: PlayerPublic[];
  youId: string;
  isHost: boolean;
  onAddBot: () => void;
  onRemoveBot: () => void;
}) {
  const locale = useLocale();
  // onRemoveBot bỏ con bot CUỐI (API hiện tại không nhận id), nên chỉ ghế đó mới được
  // mọc nút gỡ — mọc ở mọi ghế bot là hứa một điều làm không được.
  const lastBotIndex = players.map((p) => p.isBot).lastIndexOf(true);

  return (
    <ul className="seat-grid">
      {Array.from({ length: MAX_PLAYERS }, (_, i) => {
        const p = players[i];
        if (!p) {
          return (
            <li key={`empty-${i}`} className="seat-slot empty">
              {isHost ? (
                <button className="seat-add" onClick={onAddBot}>
                  {L(locale, "+ Thêm bot", "+ Add bot")}
                </button>
              ) : (
                <span className="muted">{L(locale, "Ghế trống", "Empty chair")}</span>
              )}
            </li>
          );
        }
        return (
          <li key={p.id} className={`seat-slot${p.id === youId ? " you" : ""}`}>
            <span className="seat-face" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
              {(p.name.trim()[0] ?? "?").toUpperCase()}
            </span>
            <span className="seat-name">
              {p.name}
              {p.id === youId && <span className="muted"> {L(locale, "(bạn)", "(you)")}</span>}
            </span>
            {p.isHost && <span className="seat-tag host">{L(locale, "Chủ bàn", "Host")}</span>}
            {p.isBot && <span className="seat-tag">{L(locale, "Máy", "Bot")}</span>}
            {!p.connected && <span className="seat-tag off">{L(locale, "Mất kết nối", "Offline")}</span>}
            {isHost && i === lastBotIndex && (
              <button className="seat-drop" onClick={onRemoveBot} title={L(locale, "Bớt bot", "Remove bot")} aria-label={L(locale, "Bớt bot", "Remove bot")}>
                ×
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
