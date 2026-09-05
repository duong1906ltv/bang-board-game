"use client";

import { AbilityKind, PlayerView } from "@/lib/types";
import { L, useLocale } from "@/lib/i18n";

// Năng lực nào cần bao nhiêu lá và có phải ngắm ai không. Chỉ là hình thức — việc "bấm
// được chưa" do server trả lời qua `you.abilities`, client không tự suy lại.
export const ABILITY_SPEC: Record<
  AbilityKind,
  { need: number; aims: boolean; label: [string, string]; picking: [string, string] }
> = {
  "burn-two-to-heal": {
    need: 2,
    aims: false,
    label: ["🩹 Bỏ 2 lá → +1 máu", "🩹 Discard 2 → +1 life"],
    picking: ["Chạm 2 lá để bỏ", "Tap 2 cards to discard"],
  },
  "lose-life-to-draw": {
    need: 0,
    aims: false,
    label: ["🩸 Trả 1 máu → rút 2 lá", "🩸 Lose 1 life → draw 2"],
    picking: ["", ""],
  },
  "burn-two-to-shoot": {
    need: 2,
    aims: true,
    label: ["🔫 Bỏ 2 lá → bắn 1 Bang!", "🔫 Discard 2 → fire a Bang!"],
    picking: ["Chạm 2 lá để bỏ", "Tap 2 cards to discard"],
  },
  "burn-blue-to-draw": {
    need: 1,
    aims: false,
    label: ["🔵 Bỏ 1 lá xanh → rút 2 lá", "🔵 Discard a blue card → draw 2"],
    picking: ["Chạm 1 lá xanh", "Tap one blue card"],
  },
};

// Xếp chồng lên nhau ở góc trái, ngay trên tay bài. Doc Holyday và José Delgado có thể
// cùng sáng một lúc — không nhân vật nào mang hai năng lực, nhưng bàn thì có nhiều người
// và bố cục không được giả định là chỉ có một nút.
export function AbilityBar({
  view,
  active,
  picked,
  onPress,
}: {
  view: PlayerView;
  active: AbilityKind | null;
  picked: number;
  onPress: (kind: AbilityKind) => void;
}) {
  const locale = useLocale();
  const kinds = view.you.abilities;
  if (kinds.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        bottom: 132,
        zIndex: 57,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: "flex-start",
      }}
    >
      {kinds.map((kind) => {
        const spec = ABILITY_SPEC[kind];
        const on = active === kind;
        return (
          <button
            key={kind}
            onClick={() => onPress(kind)}
            style={{
              width: "auto",
              padding: "8px 12px",
              fontSize: "0.82rem",
              fontWeight: 700,
              borderRadius: 10,
              border: `1px solid ${on ? "#33d17a" : "rgba(240,226,192,0.5)"}`,
              background: on ? "rgba(20,110,50,0.92)" : "rgba(20,18,16,0.88)",
              color: "#f0e2c0",
            }}
          >
            {on
              ? `${L(locale, spec.picking[0], spec.picking[1])} (${picked}/${spec.need}) · ${L(locale, "Hủy", "Cancel")}`
              : L(locale, spec.label[0], spec.label[1])}
          </button>
        );
      })}
    </div>
  );
}
