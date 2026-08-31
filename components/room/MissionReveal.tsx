"use client";

import type { PlayerView, MissionReveal as Reveal } from "@/lib/types";
import { MISSION_BY_ID } from "@/lib/missions";
import { L, useLocale, missionName, missionDesc } from "@/lib/i18n";

// Ai đó vừa hoàn thành một nhiệm vụ bí mật, và giờ cả bàn biết.
//
// Bật cho MỌI người, khác PredictReveal (chỉ bật cho người có cược): một dự đoán mở ở mọi lượt
// nên modal cho cả bàn sẽ là 40-60 lần một ván, còn nhiệm vụ chỉ xong khi có người thật sự trả
// một cái giá — nó là sự kiện của bàn, và nó hiếm.
export function MissionReveal({
  reveal,
  view,
  onDone,
}: {
  reveal: Reveal;
  view: PlayerView;
  onDone: () => void;
}) {
  const locale = useLocale();
  const who = view.players.find((p) => p.id === reveal.playerId);
  const def = MISSION_BY_ID[reveal.missionId];
  const isMe = reveal.playerId === view.you.id;

  const paid = [
    reveal.cards ? L(locale, `+${reveal.cards} lá`, `+${reveal.cards} card${reveal.cards > 1 ? "s" : ""}`) : null,
    reveal.hp ? L(locale, `+${reveal.hp} máu`, `+${reveal.hp} life`) : null,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <div onClick={onDone} style={{ position: "fixed", inset: 0, zIndex: 1159, background: "rgba(0,0,0,0.28)" }} />
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed", left: "50%", top: "18%", transform: "translateX(-50%)",
          zIndex: 1160, width: "min(440px, 92vw)", maxHeight: "70%", overflowY: "auto",
          padding: "16px 18px", borderRadius: 16, textAlign: "left",
          fontFamily: "system-ui, sans-serif", color: "#f0e2c0",
          background: "rgba(16,32,52,0.97)",
          border: "1px solid #e2b25a",
          boxShadow: "0 10px 40px rgba(0,0,0,0.6), 0 0 24px rgba(226,178,90,0.35)",
          animation: "eventPop .45s cubic-bezier(0.2,0.9,0.25,1) both",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <strong style={{ fontSize: "1rem" }}>
            {def?.emoji ?? "🎯"} {isMe ? L(locale, "Bạn", "You") : who?.name ?? "?"}
          </strong>
          <button
            onClick={onDone}
            aria-label={L(locale, "Đóng", "Close")}
            style={{ width: "auto", background: "none", border: "none", color: "#f0e2c0", fontSize: "1.1rem" }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: "0.95rem", fontWeight: 700, color: "#8fe0a8" }}>
          {L(locale, "hoàn thành", "completed")}: {missionName(locale, reveal.missionId)}
        </div>

        <div style={{ marginTop: 8, fontSize: "0.85rem", opacity: 0.82, lineHeight: 1.55 }}>
          {missionDesc(locale, reveal.missionId)}
        </div>

        <div style={{ marginTop: 12, fontSize: "0.9rem", fontWeight: 700 }}>
          {L(locale, "Thưởng", "Reward")}: {paid || L(locale, "không có gì", "nothing")}
        </div>

        {reveal.converted && (
          // Nói ra, chứ không âm thầm xoá công người chơi đã bỏ ra: nhiệm vụ tôn trọng luật
          // event thay vì trở thành lỗ hổng luật đầu tiên trong game, nhưng vẫn trả một cái gì.
          <div style={{ marginTop: 8, fontSize: "0.8rem", color: "#ffd08a", lineHeight: 1.5 }}>
            {L(
              locale,
              "Đang có sự kiện cấm hồi máu, nên phần thưởng máu được quy đổi thành bài.",
              "An event is blocking healing, so the life reward was converted into cards.",
            )}
          </div>
        )}
      </div>
    </>
  );
}
