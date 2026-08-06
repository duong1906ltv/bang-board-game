"use client";

import { useState } from "react";
import { type EventView } from "@/lib/types";
import { L, useLocale, eventName, eventDesc } from "@/lib/i18n";

// The events currently in force, as ONE control. A round puts 2..4 of them on the
// board and a chip each turned the HUD corner into a wall of text; they are also a
// single fact — "this is what the round plays like" — so they belong in one place.
// Collapsed it shows just the emoji (enough to recognise at a glance) and the turn
// countdown; tapping opens the full list with what each one does.
export function EventChips({ events }: { events: EventView[] }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  if (events.length === 0) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "auto", padding: "3px 9px", fontSize: "0.82rem", fontWeight: 700,
          borderRadius: 8, color: "#f0e2c0", fontFamily: "system-ui, sans-serif",
          background: "rgba(16,32,52,0.92)",
          border: "1px solid rgba(91,155,213,0.7)",
          display: "flex", alignItems: "center", gap: 5,
        }}
        title={L(locale, "Xem sự kiện đang có hiệu lực", "See the events in force")}
      >
        <span style={{ fontSize: "0.95rem", letterSpacing: 1 }}>{events.map((e) => e.emoji).join("")}</span>
        <span style={{ opacity: 0.75, fontWeight: 600 }}>
          {events.length}
        </span>
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 1160, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(400px, 92vw)", maxHeight: "80vh", overflowY: "auto", padding: "20px 22px", borderRadius: 16, background: "var(--panel)", border: "1px solid var(--border)", fontFamily: "system-ui, sans-serif" }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, textAlign: "center" }}>
              {L(locale, "Sự kiện của vòng này", "This round's events")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
              {events.map((ev) => (
                <div key={`${ev.id}-${ev.seq}`} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 26, lineHeight: 1.1, flex: "0 0 auto" }}>{ev.emoji}</span>
                  <span>
                    <span style={{ display: "block", fontWeight: 800, color: "var(--accent)" }}>
                      {eventName(locale, ev.id)}
                    </span>
                    <span className="muted" style={{ display: "block", fontSize: 13, lineHeight: 1.45 }}>
                      {eventDesc(locale, ev.id)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <button style={{ width: "auto", padding: "10px 24px", marginTop: 18, display: "block", marginInline: "auto" }} onClick={() => setOpen(false)}>
              {L(locale, "Đóng", "Close")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
