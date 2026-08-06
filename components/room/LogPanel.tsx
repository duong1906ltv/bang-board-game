"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type LogEntry } from "@/lib/types";
import { type Card } from "@/lib/cards";
import { L, useLocale, logText } from "@/lib/i18n";
import { CARD_DEF_BY_NAME } from "./constants";

// The right-docked history panel: your personal feed pinned above the shared log,
// collapsible and drag-resizable. Owns its own open/size state — nothing outside
// reads it, and keeping it here means a socket update can't snap the panel back.
export function LogPanel({
  log,
  inbox,
  youName,
  onInspect,
}: {
  log: LogEntry[];
  inbox: LogEntry[];
  youName: string;
  onInspect: (card: Card) => void;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 240, h: 300 });

  // Newest-first log rows, with the card-name link position resolved. Formatting all
  // 40 entries is not free and this component re-renders on every pointermove while
  // a card is being dragged, so it only re-runs when the log or the language changes.
  const logRows = useMemo(
    () =>
      [...log].reverse().map((e) => {
        const text = logText(locale, e, youName);
        const def = (e.kind === "play" || e.kind === "react") && e.card ? CARD_DEF_BY_NAME[e.card] : undefined;
        return { e, text, def, idx: def && e.card ? text.indexOf(e.card) : -1 };
      }),
    [log, locale, youName]
  );
  // `?? []` is not dead code despite the type: this view comes off a socket, and a tab
  // held open across a server restart gets a payload built before `inbox` existed.
  const inboxRows = useMemo(
    () => [...(inbox ?? [])].reverse().map((e) => ({ e, text: logText(locale, e, youName) })),
    [inbox, locale, youName]
  );

  // Drag the bottom-left grip to resize: the panel grows toward the left and down, so
  // the grip follows the pointer naturally. The teardown is held in a ref so an
  // unmount while the pointer is still down doesn't leave listeners (and a stale
  // setState closure) attached to window.
  const resizeTeardownRef = useRef<(() => void) | null>(null);
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const sw = size.w;
    const sh = size.h;
    const move = (ev: PointerEvent) => {
      setSize({
        w: Math.min(Math.max(sw + (sx - ev.clientX), 160), window.innerWidth * 0.85),
        h: Math.min(Math.max(sh + (ev.clientY - sy), 120), window.innerHeight * 0.85),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      resizeTeardownRef.current = null;
    };
    resizeTeardownRef.current = up;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  useEffect(() => () => resizeTeardownRef.current?.(), []);

  // A card named in the log opens the real card face; `id: "log"` marks it as a
  // stand-in built from the definition rather than a card in play.
  const showLogCard = (def: { id: string; name: string }) =>
    onInspect({ id: "log", defId: def.id, name: def.name, suit: "spades", rank: 1 });

  if (log.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 56,
        right: 12,
        zIndex: 55,
        width: size.w,
        height: open ? size.h : undefined,
        maxWidth: "85vw",
        maxHeight: "85vh",
        background: "rgba(20,18,16,0.82)",
        borderRadius: 10,
        fontFamily: "system-ui, sans-serif",
        color: "#f0e2c0",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ flex: "0 0 auto", padding: "6px 10px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(240,226,192,0.2)" }}
      >
        <span>📜 {L(locale, "Lịch sử", "History")}</span>
        <span>{open ? "▾" : "▸"}</span>
      </div>

      {/* Outside the collapse toggle on purpose: "who is coming after me" decides
          your turn, and it used to be buried among six other players' plays. */}
      {inboxRows.length > 0 && (
        <div style={{ flex: "0 0 auto", padding: "6px 10px", borderBottom: "1px solid rgba(240,226,192,0.2)", background: "rgba(255,120,60,0.14)", display: "flex", flexDirection: "column", gap: 3, fontSize: 12, lineHeight: 1.3, maxHeight: 130, overflowY: "auto" }}>
          <div style={{ fontWeight: 700, fontSize: 11, opacity: 0.85, letterSpacing: 0.3 }}>
            🎯 {L(locale, "Nhắm vào bạn từ lượt trước", "Aimed at you since your last turn")}
          </div>
          {inboxRows.map(({ e, text }) => (
            <div key={e.id} style={{ color: "#ffb782" }}>{text}</div>
          ))}
        </div>
      )}

      <div style={{ flex: "1 1 auto", minHeight: 0, maxHeight: open ? undefined : 118, overflowY: "auto", padding: "6px 10px", display: "flex", flexDirection: "column", gap: 3, fontSize: 12, lineHeight: 1.3 }}>
        {logRows.map(({ e, text, def, idx }) => (
          <div
            key={e.id}
            style={{
              opacity: e.kind === "turn" ? 0.7 : 1,
              // Events get their own colour and weight: they change the rules
              // rather than report a play, so they need to be findable when
              // you scroll back asking "why couldn't I shoot?". Draw! results
              // (Jail, Dynamite) get the same treatment for the same reason —
              // they decide whose turn just vanished, and "did he get out of
              // jail?" is the question people scroll back for most.
              fontWeight: e.kind === "death" || e.kind === "event" || e.kind === "check" ? 700 : 400,
              color: e.kind === "event" ? "#7ec8ff" : e.kind === "check" ? "#ffc46b" : undefined,
            }}
          >
            {idx >= 0 && def && e.card ? (
              <>
                {text.slice(0, idx)}
                <span
                  onClick={() => showLogCard(def)}
                  style={{ color: "#ffd24a", textDecoration: "underline", cursor: "pointer" }}
                >
                  {e.card}
                </span>
                {text.slice(idx + e.card.length)}
              </>
            ) : (
              text
            )}
          </div>
        ))}
      </div>
      <div
        onPointerDown={startResize}
        title={L(locale, "Kéo để đổi kích thước", "Drag to resize")}
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: 18,
          height: 18,
          cursor: "nesw-resize",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "flex-start",
          color: "rgba(240,226,192,0.6)",
          fontSize: 12,
          lineHeight: 1,
          touchAction: "none",
        }}
      >
        ◣
      </div>
    </div>
  );
}
