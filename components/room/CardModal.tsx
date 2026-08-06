"use client";

import { CARD_DEF_BY_ID, type Card } from "@/lib/cards";
import { PlayingCard } from "@/components/PlayingCard";
import { L, useLocale } from "@/lib/i18n";

// One shared popup for showing a card face full-size on a dimmed backdrop. Used
// for inspecting a card (with its effect text) and for play/discard confirmations
// (with action buttons). Click the backdrop to dismiss.
export function CardModal({
  card,
  onClose,
  showEffect,
  actions,
}: {
  card: Card;
  onClose: () => void;
  showEffect?: boolean;
  actions?: { label: string; onClick: () => void; ghost?: boolean }[];
}) {
  const locale = useLocale();
  const buttons = actions ?? [{ label: L(locale, "Đóng", "Close"), onClick: onClose }];
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1150, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div role="dialog" aria-modal="true" aria-label={card.name} onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, maxWidth: 320 }}>
        <div style={{ transform: "scale(1.5)", transformOrigin: "top center", marginBottom: 70 }}>
          <PlayingCard card={card} hideCorner={card.id === "log"} />
        </div>
        {showEffect && (
          <p className="muted" style={{ textAlign: "center", lineHeight: 1.5, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px" }}>
            {CARD_DEF_BY_ID[card.defId]?.effect}
          </p>
        )}
        <div style={{ display: "flex", gap: 12 }}>
          {buttons.map((b, i) => (
            <button key={i} className={b.ghost ? "ghost" : ""} style={{ width: "auto", padding: "12px 24px" }} onClick={b.onClick}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
