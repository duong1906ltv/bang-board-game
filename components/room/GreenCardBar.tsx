"use client";

import { PlayerView } from "@/lib/types";
import { CARD_DEF_BY_ID } from "@/lib/cards";
import { PlayingCard } from "@/components/PlayingCard";
import { L, useLocale } from "@/lib/i18n";

// Lá green đang nằm trước mặt bạn và đã chín. Một thanh riêng thay vì bấm thẳng lên bàn
// 3D: một lá green nằm lẫn giữa hàng trang bị, và "cái nào bấm được" là thứ người chơi
// không đoán được từ hình ảnh — server đã trả lời rồi thì hiện đúng câu trả lời đó.
//
// Lá chưa chín KHÔNG hiện ở đây. Chúng vẫn nằm trên bàn 3D, chỉ là chưa bấm được.
export function GreenCardBar({
  view,
  active,
  onPress,
}: {
  view: PlayerView;
  active: string | null;
  onPress: (cardId: string) => void;
}) {
  const locale = useLocale();
  const ready = view.you.equipment.filter((c) => view.you.usableGreenIds.includes(c.id));
  if (ready.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 12,
        bottom: 132,
        zIndex: 57,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 6,
      }}
    >
      <span
        style={{
          fontSize: "0.72rem",
          fontWeight: 700,
          color: "#a8d8a0",
          textShadow: "0 1px 3px #000",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {L(locale, "Dùng được lượt này", "Ready this turn")}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        {ready.map((c) => (
          <button
            key={c.id}
            onClick={() => onPress(c.id)}
            title={CARD_DEF_BY_ID[c.defId]?.effect ?? c.name}
            style={{
              width: "auto",
              padding: 2,
              background: active === c.id ? "rgba(20,110,50,0.92)" : "none",
              border: active === c.id ? "1px solid #33d17a" : "1px solid transparent",
              borderRadius: 8,
            }}
          >
            <PlayingCard card={c} size="sm" />
          </button>
        ))}
      </div>
    </div>
  );
}
