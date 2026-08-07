"use client";

import { PlayerView } from "@/lib/types";
import { L, useLocale } from "@/lib/i18n";

// The draw phase panel. There is no "draw" button any more: both of the sources you
// can reach for are ON the table and pulse when they are available — the deck for
// everybody, and each raidable hand for Jesse Jones. All that is left down here is the
// sentence telling you so.
//
// Pedro Ramirez keeps a button, and not out of inconsistency: his second source is the
// top of the DISCARD pile, which sits inches from the draw pile and is the same shape
// and size. Two pulsing rings that close together read as one choice with a wobble in
// it, not two. Jesse's hands are across the table from each other, so they do not have
// that problem.
export function DrawControls({
  you,
  onDraw,
}: {
  you: PlayerView["you"];
  onDraw: (source?: "deck" | "discard" | "player", targetId?: string) => void;
}) {
  const locale = useLocale();
  const mode = you.character?.effect.drawMode ?? "";
  return (
    <>
      <div
        style={{
          fontSize: "0.82rem",
          lineHeight: 1.4,
          textAlign: "center",
          color: "#ffcf8f",
          fontWeight: 600,
        }}
      >
        🂠{" "}
        {mode === "jesse" || mode === "pedro"
          ? L(locale, "Bấm vào bộ bài giữa bàn để rút 2 lá thường", "Click the deck in the middle to draw 2 normally")
          : L(locale, "Bấm vào bộ bài giữa bàn để rút 2 lá", "Click the deck in the middle to draw 2")}
        {mode === "jesse" && (
          <div style={{ marginTop: 4, fontWeight: 500, opacity: 0.9 }}>
            {L(
              locale,
              "…hoặc bấm vào chỗ bài của người đang sáng viền để rút 1 lá từ tay họ",
              "…or click a highlighted player's cards to draw 1 from their hand"
            )}
          </div>
        )}
      </div>
      {mode === "pedro" && (
        <button className="ghost" onClick={() => onDraw("discard")}>
          {L(locale, "Rút lá bỏ trên cùng + 1", "Take top discard + 1")}
        </button>
      )}
    </>
  );
}
