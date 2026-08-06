"use client";

import { Character, PlayerView, ROLE_EMOJI } from "@/lib/types";
import { L, useLocale, roleLabel, roleGoal, charAbility } from "@/lib/i18n";

// Shown automatically only on this device's first game (localStorage); afterwards it
// is reachable from the ⓘ role badge.
export function Briefing({
  role,
  character,
  onClose,
}: {
  role: NonNullable<PlayerView["you"]["role"]>;
  character: Character | null;
  onClose: () => void;
}) {
  const locale = useLocale();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        background: "rgba(0,0,0,0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          maxWidth: 520,
          maxHeight: "90%",
          overflowY: "auto",
          padding: 28,
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "3.5rem", lineHeight: 1 }}>{ROLE_EMOJI[role]}</div>
          <div style={{ fontSize: "1.7rem", fontWeight: 800, margin: "6px 0 2px" }}>
            {roleLabel(locale, role)}
          </div>
        </div>
        <p style={{ lineHeight: 1.7, color: "var(--text)", fontSize: 15, marginTop: 12 }}>
          🎯 {roleGoal(locale, role)}
        </p>
        {character && (
          <p style={{ lineHeight: 1.7, color: "var(--muted)", fontSize: 14, marginTop: 10 }}>
            🎭 <b style={{ color: "var(--accent)" }}>{character.name}</b> —{" "}
            {charAbility(locale, character.id)}
          </p>
        )}
        <div
          style={{
            marginTop: 18,
            padding: "12px 14px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 1,
              opacity: 0.6,
            }}
          >
            {L(locale, "Cách chơi", "Controls")}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--muted)" }}>
            {L(locale, "• Bấm lá trên tay để xem, rồi xác nhận để chơi.", "• Click a card in hand to inspect, then confirm to play.")}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--muted)" }}>
            {L(locale, "• Lá cần mục tiêu: bấm người chơi quanh bàn để nhắm.", "• Targeted cards: click a player around the table to aim.")}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--muted)" }}>
            {L(locale, "• Bấm badge 🎭 / ⓘ trên HUD để xem lại nhân vật và vai.", "• Use the 🎭 / ⓘ badges in the HUD to review your character and role.")}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--muted)" }}>
            {L(locale, "• Máy chạy chậm? Vào ⚙️ tắt hiệu ứng đồ hoạ.", "• Running slow? Turn off effects in ⚙️.")}
          </div>
        </div>
        <button style={{ width: "auto", alignSelf: "center", marginTop: 18, padding: "10px 28px" }} onClick={onClose}>
          {L(locale, "Vào bàn", "Enter the table")}
        </button>
      </div>
    </div>
  );
}
