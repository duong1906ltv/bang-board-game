"use client";

import { PlayerView } from "@/lib/types";
import { L, useLocale, formatPending } from "@/lib/i18n";
import { PENDING_EMOJI } from "./constants";

// A small non-blocking banner for players who aren't the one acting on a pending.
export function PendingNote({ view }: { view: PlayerView }) {
  const locale = useLocale();
  const p = view.pending!;
  return (
    <div
      style={{
        position: "fixed",
        top: 72,
        left: "50%",
        transform: "translateX(-50%)",
        // Above the event banner (1120): a pending is the one thing the whole table
        // is waiting on, so it must outrank an informational announcement. Below it,
        // the banner's click-catcher swallowed the reaction buttons.
        zIndex: 1180,
        background: "rgba(20,18,16,0.92)",
        color: "#f0e2c0",
        padding: "8px 16px",
        borderRadius: 12,
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        maxWidth: "90vw",
        lineHeight: 1.35,
        boxShadow: "0 4px 16px rgba(0,0,0,.5)",
        pointerEvents: "none",
      }}
    >
      <span style={{ fontSize: 18 }}>{PENDING_EMOJI[p.kind]}</span>
      <span>{formatPending(locale, p, view.you.name)}</span>
      {p.kind === "multi" && p.waiting && p.waiting.length > 0 && (
        <span style={{ opacity: 0.7, fontSize: "0.85rem" }}>
          · {L(locale, "chờ", "waiting")}: {p.waiting.join(", ")}
        </span>
      )}
    </div>
  );
}
