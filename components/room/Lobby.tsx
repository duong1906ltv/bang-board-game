"use client";

import { PlayerView, ROLE_EMOJI, type EventLevel, MAX_PLAYERS, MIN_PLAYERS } from "@/lib/types";
import { L, useLocale, roleLabel, eventLevelLabel, missionsOnLabel } from "@/lib/i18n";

export function Lobby({
  view,
  onStart,
  onAddBot,
  onRemoveBot,
  onSetEventLevel,
  onSetMissionsOn,
}: {
  view: PlayerView;
  onStart: () => void;
  onAddBot: () => void;
  onRemoveBot: () => void;
  onSetEventLevel: (level: EventLevel) => void;
  onSetMissionsOn: (on: boolean) => void;
}) {
  const locale = useLocale();
  const n = view.players.length;
  const botCount = view.players.filter((p) => p.isBot).length;
  const canStart = view.you.canStart && n >= MIN_PLAYERS && n <= MAX_PLAYERS;

  return (
    <div className="card wide" style={{ marginTop: 16 }}>
      <h2 className="section-title">{L(locale, "Phòng chờ", "Lobby")}</h2>
      <p className="muted">
        {L(locale, `${n}/${MAX_PLAYERS} người · cần tối thiểu ${MIN_PLAYERS} để bắt đầu`, `${n}/${MAX_PLAYERS} players · need at least ${MIN_PLAYERS} to start`)}
      </p>

      <ul className="players">
        {view.players.map((p) => (
          <li key={p.id}>
            <span>
              <span className={`dot ${p.connected ? "on" : "off"}`} />
              {p.name}
              {p.id === view.you.id && <span className="muted"> {L(locale, "(bạn)", "(you)")}</span>}
            </span>
            {p.isBot ? (
              <span className="badge">AI 🤖</span>
            ) : (
              p.isHost && <span className="badge">{L(locale, "Chủ phòng ⭐", "Host ⭐")}</span>
            )}
          </li>
        ))}
      </ul>

      {view.roleSetup.length > 0 && (
        <>
          <label style={{ marginTop: 8 }}>{L(locale, `Phân bố vai với ${n} người`, `Roles for ${n} players`)}</label>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {view.roleSetup.map((r) => (
              <span key={r.role} className="badge">
                {ROLE_EMOJI[r.role]} {roleLabel(locale, r.role)} ×{r.count}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Random events: the house layer on top of the base rules. Host picks the
          density; everyone else just sees what the room is set to. */}
      <label style={{ marginTop: 12 }}>{L(locale, "Sự kiện ngẫu nhiên", "Random events")}</label>
      {view.you.isHost ? (
        <button
          className={view.eventLevel === "on" ? "" : "ghost"}
          style={{ width: "auto", padding: "8px 18px", fontSize: "0.9rem", alignSelf: "flex-start" }}
          onClick={() => onSetEventLevel(view.eventLevel === "on" ? "off" : "on")}
        >
          🎲 {view.eventLevel === "on" ? L(locale, "Sự kiện: BẬT", "Events: ON") : L(locale, "Sự kiện: TẮT", "Events: OFF")}
        </button>
      ) : (
        <span className="badge" style={{ alignSelf: "flex-start" }}>
          🎲 {eventLevelLabel(locale, view.eventLevel)}
        </span>
      )}
      <p className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
        {L(
          locale,
          "Đầu MỖI VÒNG — đúng lúc tới lượt Cảnh Sát Trưởng — bàn nhận 2–4 sự kiện cùng lúc, áp cho TẤT CẢ mọi người cho tới hết vòng: cấm bắn, bão cát, mưa bài, đảo chiều… Có hiệu lực ngay từ vòng đầu. Các sự kiện xung đột nhau không bao giờ ra cùng nhau, và không sự kiện nào lặp lại trong một ván.",
          "EVERY round — as play returns to the Sheriff — the table draws 2–4 events at once, all applying to EVERYONE until the round ends: no shooting, sandstorm, card rain, reversed order… Live from the very first round. Conflicting events are never drawn together, and no event repeats within a game."
        )}
      </p>

      {/* Nhiệm vụ phụ. Luật phòng như sự kiện — phải chốt TRƯỚC khi chia bài, nên nó ở đây chứ
          không ở SettingsMenu (nơi chứa những thứ mỗi người tự chọn cho máy mình). */}
      <label style={{ marginTop: 12 }}>{L(locale, "Nhiệm vụ phụ", "Side missions")}</label>
      {view.you.isHost ? (
        <button
          className={view.missionsOn ? "" : "ghost"}
          style={{ width: "auto", padding: "8px 18px", fontSize: "0.9rem", alignSelf: "flex-start" }}
          onClick={() => onSetMissionsOn(!view.missionsOn)}
        >
          🎯 {missionsOnLabel(locale, view.missionsOn)}
        </button>
      ) : (
        <span className="badge" style={{ alignSelf: "flex-start" }}>
          🎯 {missionsOnLabel(locale, view.missionsOn)}
        </span>
      )}
      <p className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
        {L(
          locale,
          "Mỗi người nhận MỘT nhiệm vụ bí mật, chỉ mình thấy. Mọi nhiệm vụ đều đòi hy sinh thật — chịu trúng đòn khi đang có Missed! trong tay, bỏ trọn một lượt, từ chối uống Beer khi đang thiếu máu… Làm xong thì được thưởng bài và cả bàn biết bạn đã làm gì.",
          "Everyone gets ONE secret mission, visible only to them. Every mission asks for a real sacrifice — taking a hit while holding a Missed!, spending a whole turn on nothing, refusing a Beer while wounded… Finish it and you draw cards, and the table learns what you did."
        )}
      </p>

      {view.you.isHost && (
        <>
          <label style={{ marginTop: 12 }}>{L(locale, "Thêm AI để test", "Add AI for testing")}</label>
          <div className="row" style={{ gap: 8 }}>
            <button className="ghost" onClick={onAddBot} disabled={n >= MAX_PLAYERS}>
              {L(locale, "+ Thêm bot 🤖", "+ Add bot 🤖")}
            </button>
            <button className="ghost" onClick={onRemoveBot} disabled={botCount === 0}>
              {L(locale, "− Bớt bot", "− Remove bot")}
            </button>
          </div>
        </>
      )}

      <div style={{ height: 16 }} />
      {view.you.canStart ? (
        <button onClick={onStart} disabled={!canStart}>
          {n < MIN_PLAYERS ? L(locale, `Cần thêm ${MIN_PLAYERS - n} người`, `Need ${MIN_PLAYERS - n} more`) : L(locale, "Bắt đầu ván", "Start game")}
        </button>
      ) : (
        <p className="muted">{L(locale, "Đang chờ chủ phòng bắt đầu…", "Waiting for the host to start…")}</p>
      )}
    </div>
  );
}
