"use client";

import { PlayerView } from "@/lib/types";
import { L, useLocale } from "@/lib/i18n";

export function DrawControls({
  you,
  onDraw,
  aimJesse,
}: {
  you: PlayerView["you"];
  onDraw: (source?: "deck" | "discard" | "player", targetId?: string) => void;
  aimJesse: () => void;
}) {
  const locale = useLocale();
  // Draw modes that offer a second, non-deck source. The other two modes (Kit
  // Carlson, Black Jack) change what the deck hands over, not where it comes from,
  // so they need no extra button.
  const alt: Partial<Record<string, { label: [string, string]; onClick: () => void }>> = {
    jesse: { label: ["Rút 1 lá từ tay người khác", "Draw 1 from a hand"], onClick: aimJesse },
    pedro: { label: ["Rút lá bỏ trên cùng + 1", "Take top discard + 1"], onClick: () => onDraw("discard") },
  };
  const extra = alt[you.character?.effect.drawMode ?? ""];
  return (
    <>
      <button onClick={() => onDraw()}>
        {extra
          ? L(locale, "Rút 2 lá thường 🂠", "Draw 2 normally 🂠")
          : L(locale, "Rút 2 lá 🂠", "Draw 2 🂠")}
      </button>
      {extra && (
        <>
          <div style={{ height: 8 }} />
          <button className="ghost" onClick={extra.onClick}>
            {L(locale, extra.label[0], extra.label[1])}
          </button>
        </>
      )}
    </>
  );
}
