"use client";

import { useState } from "react";
import type { PlayerView } from "@/lib/types";
import { MISSION_BY_ID } from "@/lib/missions";
import { L, useLocale, missionName, missionDesc } from "@/lib/i18n";

// Nhiệm vụ bí mật của bạn, trong HUD. Có CHỮ, không phải emoji trần: chip đoán-hành-động từng
// chỉ là một 🔮 với một cái tên bên cạnh, và hai lần liền có người nhìn thẳng vào nó rồi hỏi
// tính năng đâu. Thụ động không đồng nghĩa với không dán nhãn.
export function MissionChip({ view }: { view: PlayerView }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  // Mặc định `?? null`: view đến từ một process khác qua socket, và trong mọi cửa sổ restart —
  // hot-reload lúc dev, rolling deploy trên EC2 — một tab đang mở được phục vụ bởi code chưa
  // có field này. Type là hợp đồng của server; đây là dây.
  const m = view.you.mission ?? null;
  if (!m || !view.missionsOn) return null;
  const def = MISSION_BY_ID[m.id];
  if (!def) return null;

  const chip = (
    <button
      onClick={() => setOpen(true)}
      title={L(locale, "Nhiệm vụ bí mật của bạn", "Your secret mission")}
      style={{
        width: "auto", padding: "3px 9px", fontSize: "0.82rem", fontWeight: 700,
        borderRadius: 8, color: "#f0e2c0", fontFamily: "system-ui, sans-serif",
        background: m.done ? "rgba(24,56,36,0.95)" : "rgba(16,32,52,0.92)",
        border: `1px solid ${m.done ? "rgba(120,220,150,0.85)" : "rgba(226,178,90,0.8)"}`,
        display: "flex", alignItems: "center", gap: 5,
      }}
    >
      <span style={{ fontSize: "0.95rem" }}>{m.done ? "✓" : "🎯"}</span>
      <span style={{ fontWeight: 700 }}>{L(locale, "Nhiệm vụ", "Mission")}</span>
      <span style={{ opacity: 0.78, fontWeight: 600 }}>
        {m.done ? L(locale, "xong", "done") : `${m.progress}/${m.goal}`}
      </span>
    </button>
  );

  if (!open) return chip;

  const reward = [
    def.reward.cards ? L(locale, `+${def.reward.cards} lá`, `+${def.reward.cards} card${def.reward.cards > 1 ? "s" : ""}`) : null,
    def.reward.hp ? L(locale, `+${def.reward.hp} máu`, `+${def.reward.hp} life`) : null,
  ].filter(Boolean).join(" · ");

  return (
    <>
      {chip}
      <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1149 }} />
      <div
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed", left: "50%", top: "22%", transform: "translateX(-50%)",
          zIndex: 1150, width: "min(420px, 92vw)", maxHeight: "64%", overflowY: "auto",
          padding: "16px 18px", borderRadius: 14, textAlign: "left",
          fontFamily: "system-ui, sans-serif", color: "#f0e2c0",
          background: "rgba(16,32,52,0.97)",
          border: "1px solid #e2b25a",
          boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <strong style={{ fontSize: "1rem" }}>
            {def.emoji} {missionName(locale, m.id)}
          </strong>
          <button
            onClick={() => setOpen(false)}
            aria-label={L(locale, "Đóng", "Close")}
            style={{ width: "auto", background: "none", border: "none", color: "#f0e2c0", fontSize: "1.1rem" }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: "0.88rem", lineHeight: 1.55 }}>
          {missionDesc(locale, m.id)}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 12, fontSize: "0.85rem" }}>
          <span style={{ opacity: 0.8 }}>
            {L(locale, "Tiến độ", "Progress")}: <strong>{m.progress}/{m.goal}</strong>
          </span>
          <span style={{ opacity: 0.8 }}>
            {L(locale, "Thưởng", "Reward")}: <strong style={{ color: "#8fe0a8" }}>{reward}</strong>
          </span>
        </div>

        <div style={{ marginTop: 12, fontSize: "0.78rem", opacity: 0.7, lineHeight: 1.5 }}>
          {m.done
            ? L(locale, "Đã xong — cả bàn đã biết bạn làm gì.", "Done — the table knows what you did.")
            : L(
                locale,
                "Chỉ bạn thấy nhiệm vụ này. Làm xong thì cả bàn mới biết. Không làm cũng không mất gì.",
                "Only you can see this. The table finds out when you finish it. Ignoring it costs nothing."
              )}
        </div>
      </div>
    </>
  );
}
