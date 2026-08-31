"use client";

import type { LobbySummary, MySeat } from "@/lib/types";
import { L, useLocale } from "@/lib/i18n";

// The home page's room browser, display only: it holds no state and talks to no
// socket, so the page above it stays the single place that knows how to get in.
export function RoomList({
  lobbies,
  seats,
  busy,
  onJoin,
  onResume,
}: {
  lobbies: LobbySummary[];
  seats: MySeat[];
  busy: boolean;
  onJoin: (code: string) => void;
  onResume: (seat: MySeat) => void;
}) {
  const locale = useLocale();

  return (
    <>
      {seats.length > 0 && (
        <>
          <label style={{ marginTop: 4 }}>{L(locale, "Bàn của bạn đang chờ", "Your table is waiting")}</label>
          <ul className="players" style={{ marginTop: 0 }}>
            {seats.map((s) => (
              <li key={s.code}>
                <span>
                  <b style={{ fontFamily: "monospace", letterSpacing: 2 }}>{s.code}</b>
                  <span className="muted"> · {L(locale, `${s.players} người`, `${s.players} players`)}</span>
                </span>
                <button className="ghost" style={BTN} onClick={() => onResume(s)} disabled={busy}>
                  {L(locale, "Quay lại", "Rejoin")}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <label>{L(locale, "Phòng đang chờ", "Rooms waiting")}</label>
      {lobbies.length === 0 ? (
        <p className="muted" style={{ margin: "0 0 14px" }}>
          {L(
            locale,
            "Chưa có phòng nào. Tạo một phòng rồi đợi người vào.",
            "No rooms yet. Open one and wait for people to arrive."
          )}
        </p>
      ) : (
        <ul className="players" style={{ marginTop: 0 }}>
          {lobbies.map((l) => (
            <li key={l.code} style={{ gap: 12 }}>
              {/* minWidth:0 so a long list of names truncates instead of shoving the button off the card */}
              <span style={{ minWidth: 0 }}>
                <b style={{ fontFamily: "monospace", letterSpacing: 2 }}>{l.code}</b>
                <span
                  className="muted"
                  style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {l.players.join(", ")}
                  {l.bots > 0 && ` · ${l.bots} 🤖`}
                </span>
              </span>
              <span className="row" style={{ alignItems: "center", flexShrink: 0 }}>
                {/* People, not occupied seats: a bot gives its chair up to a human
                    (see addPlayer), so this is exactly how many can still walk in. */}
                <span className="badge">
                  {l.players.length}/{l.max}
                </span>
                <button style={BTN} onClick={() => onJoin(l.code)} disabled={busy}>
                  {L(locale, "Vào", "Join")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// Every row button is the same size, so the right edge of the list stays a line.
const BTN = { width: 92, padding: "8px 10px", fontSize: 14 } as const;
