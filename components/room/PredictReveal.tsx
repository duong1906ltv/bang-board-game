"use client";

import type { PlayerView, PredictReveal as Reveal } from "@/lib/types";
import { NO_SHOT, playsBucket } from "@/lib/predictions";
import { L, useLocale, playsBucketLabel } from "@/lib/i18n";

// The verdict on the turn that just ended. Shown only to somebody who actually staked a
// guess on it (see useTableFeedback) — the results are public information, but a modal at
// everybody every turn would punish the players who chose not to join in.
//
// Deliberately NOT routed through the action log: six players staking two questions each
// is up to twelve verdicts a turn, which would push every shot, death and event out of a
// 40-entry log inside three turns. It rides its own field with its own seq instead.
export function PredictReveal({
  reveal,
  view,
  onDone,
}: {
  reveal: Reveal;
  view: PlayerView;
  onDone: () => void;
}) {
  const locale = useLocale();
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? "?";
  const target = name(reveal.targetId);
  const voided = reveal.results.some((r) => r.voided);

  const said = (kind: string, value: string) =>
    kind === "plays"
      ? playsBucketLabel(locale, value)
      : value === NO_SHOT
        ? L(locale, "không bắn ai", "nobody")
        : name(value);

  const mine = reveal.results.filter((r) => r.byId === view.you.id);
  const net = voided ? 0 : mine.reduce((n, r) => n + (r.correct ? 1 : -1), 0);

  return (
    <>
      <div onClick={onDone} style={{ position: "fixed", inset: 0, zIndex: 1139, background: "rgba(0,0,0,0.28)" }} />
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed", left: "50%", top: "18%", transform: "translateX(-50%)",
          zIndex: 1140, width: "min(440px, 92vw)", maxHeight: "70%", overflowY: "auto",
          padding: "16px 18px", borderRadius: 16, textAlign: "left",
          fontFamily: "system-ui, sans-serif", color: "#f0e2c0",
          background: "rgba(16,32,52,0.97)",
          border: "1px solid #5b9bd5",
          boxShadow: "0 10px 40px rgba(0,0,0,0.6), 0 0 24px rgba(91,155,213,0.35)",
          animation: "eventPop .45s cubic-bezier(0.2,0.9,0.25,1) both",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <strong style={{ fontSize: "1rem" }}>🔮 {target}</strong>
          <button
            onClick={onDone}
            aria-label={L(locale, "Đóng", "Close")}
            style={{ width: "auto", background: "none", border: "none", color: "#f0e2c0", fontSize: "1.1rem" }}
          >
            ✕
          </button>
        </div>

        {voided ? (
          // The seat was skipped — a corpse that failed its flip, a death at upkeep — so the
          // turn never happened and nothing could be judged fairly.
          <div style={{ marginTop: 10, fontSize: "0.9rem", opacity: 0.85 }}>
            {L(
              locale,
              "Lượt đó không diễn ra, nên dự đoán bị huỷ — không được cũng không mất gì.",
              "That turn never happened, so the stakes were thrown away — neither paid nor charged."
            )}
          </div>
        ) : (
          <>
            <div style={{ marginTop: 8, fontSize: "0.86rem", opacity: 0.8 }}>
              {L(locale, "Thực tế", "What happened")}:{" "}
              <strong style={{ color: "#8fe0a8" }}>
                {reveal.outcome.shotIds.length === 0
                  ? L(locale, "không bắn ai", "shot nobody")
                  : L(locale, `bắn ${reveal.outcome.shotIds.map(name).join(", ")}`,
                       `shot ${reveal.outcome.shotIds.map(name).join(", ")}`)}
                {" · "}
                {playsBucketLabel(locale, playsBucket(reveal.outcome.plays))}
              </strong>
            </div>

            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 5 }}>
              {reveal.results.map((r, i) => (
                <div
                  key={`${r.byId}-${r.kind}-${i}`}
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: r.byId === view.you.id ? 700 : 400,
                    opacity: r.byId === view.you.id ? 1 : 0.72,
                  }}
                >
                  <span style={{ color: r.correct ? "#8fe0a8" : "#ffb0b0" }}>{r.correct ? "✓" : "✗"}</span>{" "}
                  {r.byId === view.you.id ? L(locale, "Bạn", "You") : name(r.byId)}
                  {" — "}
                  {r.kind === "shoot" ? L(locale, "bắn", "shoots") : L(locale, "đánh", "plays")}{" "}
                  {said(r.kind, r.value)}
                </div>
              ))}
            </div>

            {mine.length > 0 && (
              <div style={{ marginTop: 12, fontSize: "0.95rem", fontWeight: 700 }}>
                {net > 0
                  ? L(locale, `Bạn được ${net} lá`, `You drew ${net}`)
                  : net < 0
                    ? L(locale, `Bạn mất ${-net} lá`, `You lost ${-net}`)
                    : L(locale, "Hoà — không được không mất", "Even — nothing gained, nothing lost")}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
