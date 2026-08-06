"use client";

import { PlayerView, ROLE_EMOJI } from "@/lib/types";
import { L, useLocale, roleLabel, winnerText } from "@/lib/i18n";

// End-of-game screen: who won, every role revealed, and the rematch controls.
export function ResultOverlay({
  view,
  onRestart,
  onPlayAgain,
}: {
  view: PlayerView;
  onRestart: () => void;
  onPlayAgain: () => void;
}) {
  const locale = useLocale();
  if (view.phase !== "result" || !view.winner) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.78)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, fontFamily: "system-ui, sans-serif", padding: 20, overflowY: "auto" }}>
      <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#f0e2c0", textAlign: "center" }}>{winnerText(locale, view.winner)}</div>

      {/* Cross-game reward: enough wins in one room unlocks the escape-room link */}
      {view.you.rewardUrl ? (
        <a
          href={view.you.rewardUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            width: "auto", padding: "12px 22px", borderRadius: 12, textDecoration: "none",
            fontWeight: 800, textAlign: "center", color: "#231a0c",
            background: "linear-gradient(180deg,#ffd873,#e0a83a)",
            border: "1px solid #b9862a", boxShadow: "0 4px 16px rgba(224,168,58,0.45)",
          }}
        >
          🎁 {L(locale, "Nhận thưởng: Phòng thoát bí ẩn", "Claim reward: Escape Room")}
          <div style={{ fontSize: "0.72rem", fontWeight: 600, opacity: 0.8, marginTop: 2 }}>
            {L(locale, "Link riêng của bạn · dùng một lần", "Your personal link · one-time use")}
          </div>
        </a>
      ) : view.you.wins > 0 ? (
        <div style={{ color: "#f0e2c0", opacity: 0.85, fontSize: "0.95rem", textAlign: "center" }}>
          🏆 {L(locale, `Chuỗi thắng: ${view.you.wins}/3`, `Wins: ${view.you.wins}/3`)}
          <span style={{ opacity: 0.7 }}> — {L(locale, "thắng đủ 3 ván để mở phần thưởng", "win 3 to unlock a reward")}</span>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 460 }}>
        <div style={{ color: "#f0e2c0", opacity: 0.8, fontSize: "0.9rem", textAlign: "center" }}>
          {L(locale, "Vai trò của mọi người", "Everyone's roles")}
        </div>
        {[...view.players].sort((a, b) => a.seat - b.seat).map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex", alignItems: "center", gap: 10, background: "rgba(20,18,16,0.9)",
              border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", color: "#f0e2c0",
              opacity: p.alive ? 1 : 0.6,
            }}
          >
            <span style={{ fontSize: 20 }}>{p.role ? ROLE_EMOJI[p.role] : "❔"}</span>
            <span style={{ fontWeight: 700, flex: "0 0 auto" }}>
              {p.name}{p.id === view.you.id ? L(locale, " (bạn)", " (you)") : ""}
            </span>
            <span style={{ opacity: 0.85, fontSize: "0.9rem" }}>
              {p.role ? roleLabel(locale, p.role) : "?"}
            </span>
            {p.character && <span style={{ marginLeft: "auto", opacity: 0.7, fontSize: "0.85rem" }}>🎭 {p.character.name}</span>}
            {!p.alive && <span title={L(locale, "Bị loại", "Eliminated")}>☠️</span>}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        {/* The rematch is open to whoever may start (everyone, in a matchmade
            room); going back to the lobby stays with the host, so one tap can't
            dissolve the table out from under people who wanted another hand. */}
        {view.you.canStart ? (
          <>
            <button style={{ width: "auto", padding: "12px 24px" }} onClick={onPlayAgain}>{L(locale, "🔁 Chơi lại", "🔁 Play again")}</button>
            {view.you.isHost && (
              <button className="ghost" style={{ width: "auto", padding: "12px 24px" }} onClick={onRestart}>{L(locale, "🏠 Về phòng chờ", "🏠 Back to lobby")}</button>
            )}
          </>
        ) : (
          <p className="muted">{L(locale, "Chờ chủ phòng bắt đầu ván mới…", "Waiting for the host…")}</p>
        )}
      </div>
    </div>
  );
}
