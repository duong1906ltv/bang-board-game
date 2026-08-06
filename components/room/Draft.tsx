"use client";

import { PlayerView, ROLE_EMOJI } from "@/lib/types";
import { L, useLocale, roleLabel } from "@/lib/i18n";
import { CharacterFace } from "./CharacterFace";

// Fixed set of floating gold "dust motes" for the draft backdrop — fixed (not
// random) so they don't re-scatter on every render.
const DRAFT_DUST = [
  { x: 6, s: 5, dur: 11, delay: 0, o: 0.5 }, { x: 15, s: 3, dur: 14, delay: 3, o: 0.35 },
  { x: 24, s: 6, dur: 9, delay: 1.5, o: 0.6 }, { x: 33, s: 4, dur: 13, delay: 5, o: 0.4 },
  { x: 45, s: 3, dur: 16, delay: 2, o: 0.3 }, { x: 54, s: 5, dur: 10, delay: 4, o: 0.5 },
  { x: 63, s: 4, dur: 12, delay: 0.5, o: 0.45 }, { x: 72, s: 6, dur: 8, delay: 6, o: 0.55 },
  { x: 81, s: 3, dur: 15, delay: 2.5, o: 0.35 }, { x: 90, s: 5, dur: 11, delay: 4.5, o: 0.5 },
  { x: 39, s: 3, dur: 17, delay: 7, o: 0.3 }, { x: 96, s: 4, dur: 13, delay: 1, o: 0.4 },
];

export function Draft({ view, onPick }: { view: PlayerView; onPick: (id: string) => void }) {
  const locale = useLocale();
  const draft = view.draft!;

  const locked = draft.youPicked;

  return (
    <div className="card draft-card" style={{ marginTop: 16 }}>
      <div className="draft-dust" aria-hidden>
        {DRAFT_DUST.map((d, i) => (
          <span
            key={i}
            style={{ left: `${d.x}%`, width: d.s, height: d.s, opacity: d.o, animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s` }}
          />
        ))}
      </div>
      <div className="draft-head">
        <h2 className="section-title draft-title">{L(locale, "Chọn nhân vật", "Pick your character")}</h2>
        <p className="muted draft-sub">
          {L(locale, "Chọn 1 trong 2 — người này theo bạn suốt ván. Cứ thong thả, không giới hạn thời gian.", "Choose 1 of 2 — this hero is yours for the whole game. Take your time, no limit.")}
        </p>
        {view.you.role && (
          <div className="draft-role">
            <span className="draft-role-emoji">{ROLE_EMOJI[view.you.role]}</span>
            <span className="draft-role-text">
              <span className="draft-role-label">{L(locale, "Vai của bạn", "Your role")}</span>
              <strong>{roleLabel(locale, view.you.role)}</strong>
            </span>
          </div>
        )}
      </div>

      <div className="draft-stage">
        {draft.choices.map((c, i) => {
          const picked = draft.yourPick?.id === c.id;
          const cls = ["draft-pick", locked && "draft-locked", locked && !picked && "draft-dimmed", picked && "draft-chosen"]
            .filter(Boolean)
            .join(" ");
          return [
            i > 0 ? <div key={`vs-${i}`} className="draft-vs">{L(locale, "hoặc", "or")}</div> : null,
            <div key={c.id} className={cls} style={{ animationDelay: `${i * 0.1}s` }} onClick={() => !locked && onPick(c.id)}>
              <div className="draft-face">
                <CharacterFace c={c} />
              </div>
              {picked ? (
                <div className="badge draft-badge">{L(locale, "Đã chọn ✓", "Picked ✓")}</div>
              ) : (
                !locked && <div className="draft-cta">{L(locale, "Chọn", "Choose")}</div>
              )}
            </div>,
          ];
        })}
      </div>

      <div className="draft-foot">
        <div className="draft-progress" title={`${draft.pickedCount}/${draft.totalCount}`}>
          {Array.from({ length: draft.totalCount }, (_, i) => (
            <span key={i} className={`draft-dot ${i < draft.pickedCount ? "on" : ""}`} />
          ))}
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {locked
            ? L(locale, `Đã khóa · đang chờ ${draft.waitingFor.length} người`, `Locked · waiting for ${draft.waitingFor.length}`)
            : L(locale, "Đến lượt bạn quyết định", "Your call")}
          {" · "}
          {draft.pickedCount}/{draft.totalCount}
        </p>
      </div>
    </div>
  );
}
