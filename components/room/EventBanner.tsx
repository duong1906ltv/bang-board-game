"use client";

import { type EventView } from "@/lib/types";
import { L, useLocale, eventName, eventDesc } from "@/lib/i18n";

// Announcement for the batch of events a new round just drew. One panel listing all
// of them, not a queue shown one at a time: they take effect simultaneously, so
// reading them as a group is what tells you what this round actually plays like.
// Dismissed only by the player — X, click outside, or Escape. It used to fade out on
// a timer, which loses the announcement outright for anyone who happened to be
// looking at their hand: these change the rules of the round and are not optional
// reading. The dim backdrop is deliberately light so the table stays legible behind.
export function EventBanner({ evs, onDone }: { evs: EventView[]; onDone: () => void }) {
  const locale = useLocale();
  return (
    <>
      <div
        onClick={onDone}
        style={{ position: "fixed", inset: 0, zIndex: 1119, background: "rgba(0,0,0,0.28)" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed", left: "50%", top: "18%", transform: "translateX(-50%)",
          zIndex: 1120, width: "min(440px, 92vw)",
          padding: "14px 18px", borderRadius: 16, textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "rgba(16,32,52,0.97)",
          border: "1px solid #5b9bd5",
          boxShadow: "0 10px 40px rgba(0,0,0,0.6), 0 0 24px rgba(91,155,213,0.35)",
          animation: "eventPop .45s cubic-bezier(0.2,0.9,0.25,1) both",
        }}
      >
        <button
          onClick={onDone}
          aria-label={L(locale, "Đóng", "Close")}
          title={L(locale, "Đóng", "Close")}
          style={{
            position: "absolute", top: 6, right: 8, width: 28, height: 28, padding: 0,
            lineHeight: 1, fontSize: 16, fontWeight: 700, borderRadius: 8,
            background: "transparent", border: "1px solid rgba(240,226,192,0.35)", color: "#f0e2c0",
          }}
        >
          ✕
        </button>
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", opacity: 0.65, color: "#f0e2c0", paddingInline: 26 }}>
          {L(locale, `Sự kiện của vòng này · ${evs.length}`, `This round's events · ${evs.length}`)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {evs.map((ev) => (
            <div key={ev.seq} style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left" }}>
              <span style={{ fontSize: 26, lineHeight: 1.1, flex: "0 0 auto" }}>{ev.emoji}</span>
              <span>
                <span style={{ display: "block", fontSize: "1rem", fontWeight: 800, color: "#bfe0ff" }}>
                  {eventName(locale, ev.id)}
                </span>
                <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.4, color: "#f0e2c0", opacity: 0.85 }}>
                  {eventDesc(locale, ev.id)}
                </span>
              </span>
            </div>
          ))}
        </div>
        <button
          style={{ width: "auto", padding: "8px 22px", marginTop: 12, fontSize: 13 }}
          onClick={onDone}
        >
          {L(locale, "Đã hiểu", "Got it")}
        </button>
      </div>
    </>
  );
}
