"use client";

import type { LobbySummary, MySeat } from "@/lib/types";
import { L, useLocale } from "@/lib/i18n";
import { AVATAR_COLORS } from "@/lib/seat-colors";

// The home page's room browser, display only: it holds no state and talks to no
// socket, so the page above it stays the single place that knows how to get in.

// Màu chip lấy từ tên, KHÔNG phải màu áo trong ván. Chỗ ngồi được xáo lại mỗi ván
// (xem xáo chỗ ngồi trong startGame), nên không thể hứa trước ai mặc áo gì. Đây thuần
// tuý là để nhiều người trong một hàng đọc ra là nhiều người — dùng chung bảng màu của
// bàn chơi vì bảng đó đã đo ΔE cho tách bạch, không phải để khớp với ai.
function chipColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const initial = (name: string) => (name.trim()[0] ?? "?").toUpperCase();

// Thanh dọc bên trái hàng: sáng dần theo độ đầy của bàn, nên liếc qua là biết bàn nào
// sắp khởi hành. Ba nấc thôi — chuyển màu liên tục chỉ tạo ra bảy sắc thái nâu không ai
// phân biệt được.
function railColor(taken: number, max: number): string {
  const r = taken / max;
  if (r >= 0.75) return "var(--moon)";
  if (r >= 0.4) return "var(--accent)";
  return "var(--accent2)";
}

// Bốn chip là hết chỗ trên hàng hẹp; người thứ năm trở đi gộp thành "+N".
const MAX_CHIPS = 4;

function Chips({ names }: { names: string[] }) {
  const shown = names.slice(0, MAX_CHIPS);
  const rest = names.length - shown.length;
  return (
    <span className="chips">
      {shown.map((n, i) => (
        <span key={`${n}-${i}`} className="chip" style={{ background: chipColor(n) }} title={n}>
          {initial(n)}
        </span>
      ))}
      {rest > 0 && <span className="chip rest">+{rest}</span>}
    </span>
  );
}

// Ghế vẽ thành viên đạn: đầy là đạn đã lên ổ (người đã ngồi), rỗng là ổ trống.
// Tám chấm tròn giống hệt nhau thì chỉ là tám chấm — cùng một thông tin nhưng không
// mang theo chút nào cái không khí của bàn. Vẽ bằng SVG chứ không phải CSS shape vì ở
// 12px thì bo góc CSS nhoè, còn path thì vẫn sắc.
const BULLET = "M1 13.4 V5 C1 2.6 2.3 0.8 4 0.8 C5.7 0.8 7 2.6 7 5 V13.4 Z";

function Seats({ taken, max }: { taken: number; max: number }) {
  return (
    <span className="seats" aria-label={`${taken}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} className={`seat${i < taken ? " taken" : ""}`} viewBox="0 0 8 14" aria-hidden="true">
          <path d={BULLET} />
        </svg>
      ))}
    </span>
  );
}

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
          <ul className="players lobby" style={{ marginTop: 0 }}>
            {seats.map((s) => (
              <li key={s.code}>
                <span className="lobby-who">
                  <span className="lobby-line">
                    <span className="lobby-names">{s.name}</span>
                  </span>
                  <span className="lobby-line">
                    <span className="lobby-code">{s.code}</span>
                    <span className="muted">{L(locale, `${s.players} người`, `${s.players} players`)}</span>
                  </span>
                </span>
                <button className="ghost" onClick={() => onResume(s)} disabled={busy}>
                  {L(locale, "Quay lại", "Rejoin")}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <label>{L(locale, "Bàn đang mở", "Tables open")}</label>
      {lobbies.length === 0 ? (
        <p className="muted" style={{ margin: "0 0 14px" }}>
          {L(
            locale,
            "Chưa ai mở bàn. Mở trước rồi rủ người vào.",
            "Nobody has opened a table yet. Start one and call your friends in."
          )}
        </p>
      ) : (
        <ul className="players lobby" style={{ marginTop: 0 }}>
          {lobbies.map((l) => (
            <li
              key={l.code}
              style={{ "--rail": railColor(l.players.length, l.max) } as React.CSSProperties}
            >
              {/* minWidth:0 xuyên suốt để tên dài bị cắt bằng "…" thay vì đẩy nút ra khỏi thẻ */}
              <span className="lobby-who">
                <span className="lobby-line">
                  <Chips names={l.players} />
                  <span className="lobby-names">
                    {l.players.join(", ")}
                    {l.bots > 0 && (
                      <span className="muted"> · {L(locale, `${l.bots} máy`, `${l.bots} bots`)}</span>
                    )}
                  </span>
                </span>
                <span className="lobby-line">
                  {/* People, not occupied seats: a bot gives its chair up to a human
                      (see addPlayer), so this is exactly how many can still walk in. */}
                  <Seats taken={l.players.length} max={l.max} />
                  <span className="lobby-code">{l.code}</span>
                </span>
              </span>
              <button onClick={() => onJoin(l.code)} disabled={busy}>
                {L(locale, "Vào", "Join")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
