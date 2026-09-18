"use client";

// Phòng chờ: cái bàn đang đầy dần, ba luật bàn, và nút bắt đầu.
//
// File này chỉ lắp ráp. Ghế nằm ở lobby/SeatGrid.tsx, mỗi luật là một lobby/RuleRow.tsx —
// trước đây cả ba phần nằm chung một file 160 dòng với ba đoạn văn dài luôn mở, và đoạn
// văn chiếm nhiều chỗ hơn chính cái bàn.
import Link from "next/link";
import { PlayerView, ROLE_EMOJI, type EventLevel, MAX_PLAYERS, MIN_PLAYERS } from "@/lib/types";
import { L, useLocale, roleLabel, eventLevelLabel, missionsOnLabel, dodgeCityOnLabel } from "@/lib/i18n";
import { SeatGrid } from "./lobby/SeatGrid";
import { RuleRow } from "./lobby/RuleRow";

export function Lobby({
  view,
  onStart,
  onAddBot,
  onRemoveBot,
  onSetEventLevel,
  onSetMissionsOn,
  onSetDodgeCityOn,
}: {
  view: PlayerView;
  onStart: () => void;
  onAddBot: () => void;
  onRemoveBot: () => void;
  onSetEventLevel: (level: EventLevel) => void;
  onSetMissionsOn: (on: boolean) => void;
  onSetDodgeCityOn: (on: boolean) => void;
}) {
  const locale = useLocale();
  const n = view.players.length;
  const canStart = view.you.canStart && n >= MIN_PLAYERS && n <= MAX_PLAYERS;
  const host = view.you.isHost;

  return (
    <div className="card wide lobby-card">
      <h2 className="section-title">{L(locale, "Bàn chờ", "The table")}</h2>
      <p className="muted">
        {n < MIN_PLAYERS
          ? L(locale, `${n}/${MAX_PLAYERS} người · cần tối thiểu ${MIN_PLAYERS} để bắt đầu`, `${n}/${MAX_PLAYERS} players · need at least ${MIN_PLAYERS} to start`)
          : L(locale, `${n}/${MAX_PLAYERS} người · đủ để bắt đầu`, `${n}/${MAX_PLAYERS} players · ready to start`)}
      </p>

      <SeatGrid players={view.players} youId={view.you.id} isHost={host} onAddBot={onAddBot} onRemoveBot={onRemoveBot} />

      {view.roleSetup.length > 0 && (
        <>
          <label style={{ marginTop: 14 }}>{L(locale, `Phân bố vai với ${n} người`, `Roles for ${n} players`)}</label>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {view.roleSetup.map((r) => (
              <span key={r.role} className="badge">
                {ROLE_EMOJI[r.role]} {roleLabel(locale, r.role)} ×{r.count}
              </span>
            ))}
          </div>
        </>
      )}

      <label style={{ marginTop: 16 }}>{L(locale, "Luật bàn", "Table rules")}</label>
      <div className="rule-block">
        {/* Đứng trước hai luật kia: nó quyết định bộ bài, chúng chỉ phủ lên trên. */}
        <RuleRow
          label={L(locale, "Bộ mở rộng", "Expansion")}
          state={dodgeCityOnLabel(locale, view.dodgeCityOn)}
          on={view.dodgeCityOn}
          canEdit={host}
          onToggle={() => onSetDodgeCityOn(!view.dodgeCityOn)}
          description={L(
            locale,
            "Trộn thêm 40 lá của bộ mở rộng Dodge City vào nọc: dày hơn, nhiều Bang! và Beer hơn, thêm Riparo và Binocolo để giấu mình hoặc nhìn xa. Chỉ đổi được ở bàn chờ — nọc chia đúng một lần lúc bắt đầu ván.",
            "Shuffle Dodge City's 40 extra cards into the deck: a thicker pile, more Bang!s and Beers, plus Hideout and Binocular for hiding or seeing farther. Lobby only — the deck is dealt once, when the game starts."
          )}
        />
        {/* Sự kiện: lớp luật nhà phủ lên luật gốc. Chủ bàn chọn, người khác chỉ xem. */}
        <RuleRow
          label={L(locale, "Sự kiện ngẫu nhiên", "Random events")}
          state={eventLevelLabel(locale, view.eventLevel)}
          on={view.eventLevel === "on"}
          canEdit={host}
          onToggle={() => onSetEventLevel(view.eventLevel === "on" ? "off" : "on")}
          description={L(
            locale,
            "Đầu MỖI VÒNG — đúng lúc tới lượt Cảnh Sát Trưởng — bàn nhận 2–4 sự kiện cùng lúc, áp cho TẤT CẢ mọi người cho tới hết vòng: cấm bắn, bão cát, mưa bài, đảo chiều… Có hiệu lực ngay từ vòng đầu. Các sự kiện xung đột nhau không bao giờ ra cùng nhau, và không sự kiện nào lặp lại trong một ván.",
            "EVERY round — as play returns to the Sheriff — the table draws 2–4 events at once, all applying to EVERYONE until the round ends: no shooting, sandstorm, card rain, reversed order… Live from the very first round. Conflicting events are never drawn together, and no event repeats within a game."
          )}
        />
        {/* Nhiệm vụ phụ. Luật bàn như sự kiện — phải chốt TRƯỚC khi chia bài, nên nó ở đây
            chứ không ở SettingsMenu (nơi chứa những thứ mỗi người tự chọn cho máy mình). */}
        <RuleRow
          label={L(locale, "Nhiệm vụ phụ", "Side missions")}
          state={missionsOnLabel(locale, view.missionsOn)}
          on={view.missionsOn}
          canEdit={host}
          onToggle={() => onSetMissionsOn(!view.missionsOn)}
          description={L(
            locale,
            "Mỗi người nhận MỘT nhiệm vụ bí mật, chỉ mình thấy. Mọi nhiệm vụ đều đòi hy sinh thật — chịu trúng đòn khi đang có Missed! trong tay, bỏ trọn một lượt, từ chối uống Beer khi đang thiếu máu… Làm xong thì được thưởng bài và cả bàn biết bạn đã làm gì.",
            "Everyone gets ONE secret mission, visible only to them. Every mission asks for a real sacrifice — taking a hit while holding a Missed!, spending a whole turn on nothing, refusing a Beer while wounded… Finish it and you draw cards, and the table learns what you did."
          )}
        />
      </div>

      <Link href="/luat" className="quiet-link">
        {L(locale, "Xem toàn bộ lá bài và nhân vật", "Browse every card and character")}
      </Link>

      <div style={{ height: 14 }} />
      {view.you.canStart ? (
        <button onClick={onStart} disabled={!canStart}>
          {n < MIN_PLAYERS ? L(locale, `Cần thêm ${MIN_PLAYERS - n} người`, `Need ${MIN_PLAYERS - n} more`) : L(locale, "Bắt đầu ván", "Start game")}
        </button>
      ) : (
        <p className="muted">{L(locale, "Đang chờ chủ bàn bắt đầu…", "Waiting for the host to start…")}</p>
      )}
    </div>
  );
}
