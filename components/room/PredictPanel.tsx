"use client";

import { useState } from "react";
import type { PlayerView } from "@/lib/types";
import { NO_SHOT, PLAYS_BUCKETS, type PredictionKind } from "@/lib/predictions";
import { L, useLocale, predictBlockText, playsBucketLabel } from "@/lib/i18n";

// Stake a quiet guess on what the NEXT player will do. Deliberately PASSIVE: a chance to
// predict opens on every single turn, 40-60 times a game, so anything that popped itself
// open or nagged would stop being a game and start being a notification. It sits in the
// corner as one collapsed chip; ignoring it forever is a legitimate way to play and costs
// nothing, which is why there is no counter and no reminder.
export function PredictPanel({
  view,
  onPredict,
}: {
  view: PlayerView;
  onPredict: (targetId: string, kind: PredictionKind, value: string) => void;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  const nextId = view.nextPlayerId;
  const next = view.players.find((p) => p.id === nextId);
  if (!next || view.phase !== "playing") return null;

  const staked = view.you.myPredictions.filter((p) => p.targetId === next.id);
  const stakedKinds = new Set(staked.map((p) => p.kind));
  const blocked = predictBlockText(locale, view.you.predictBlockReason);
  // Who they could plausibly shoot: everyone alive but themselves. Range is not filtered
  // out on purpose — reading whether somebody will buy a gun to reach you is part of it.
  const victims = view.players.filter((p) => p.alive && p.id !== next.id);

  const chip = (
    <button
      onClick={() => setOpen(true)}
      title={L(locale, "Đoán lượt tới", "Predict the next turn")}
      style={{
        width: "auto", padding: "3px 9px", fontSize: "0.82rem", fontWeight: 700,
        borderRadius: 8, color: "#f0e2c0", fontFamily: "system-ui, sans-serif",
        background: "rgba(16,32,52,0.92)",
        border: `1px solid ${staked.length ? "rgba(120,220,150,0.8)" : "rgba(91,155,213,0.7)"}`,
        display: "flex", alignItems: "center", gap: 5,
      }}
    >
      <span style={{ fontSize: "0.95rem" }}>🔮</span>
      <span style={{ opacity: 0.8, fontWeight: 600 }}>
        {staked.length > 0 ? `${staked.length}/2` : next.name}
      </span>
    </button>
  );

  if (!open) return chip;

  const row = (kind: PredictionKind, label: string, options: { value: string; text: string }[]) => {
    const mine = staked.find((p) => p.kind === kind);
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: "0.82rem", opacity: 0.8, marginBottom: 6 }}>{label}</div>
        {mine ? (
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#8fe0a8" }}>
            ✓ {options.find((o) => o.value === mine.value)?.text ?? mine.value}
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {options.map((o) => (
              <button
                key={o.value}
                disabled={!!blocked}
                onClick={() => onPredict(next.id, kind, o.value)}
                style={{
                  width: "auto", padding: "4px 10px", fontSize: "0.82rem", borderRadius: 8,
                  color: blocked ? "#8b8b8b" : "#f0e2c0",
                  background: "rgba(10,22,38,0.9)",
                  border: "1px solid rgba(91,155,213,0.55)",
                  cursor: blocked ? "not-allowed" : "pointer",
                }}
              >
                {o.text}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {chip}
      <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1129 }} />
      <div
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed", left: "50%", top: "20%", transform: "translateX(-50%)",
          zIndex: 1130, width: "min(420px, 92vw)", maxHeight: "68%", overflowY: "auto",
          padding: "16px 18px", borderRadius: 14, textAlign: "left",
          fontFamily: "system-ui, sans-serif", color: "#f0e2c0",
          background: "rgba(16,32,52,0.97)",
          border: "1px solid #5b9bd5",
          boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <strong style={{ fontSize: "1rem" }}>
            🔮 {L(locale, "Lượt tới", "Up next")}: {next.name}
          </strong>
          <button
            onClick={() => setOpen(false)}
            aria-label={L(locale, "Đóng", "Close")}
            style={{ width: "auto", background: "none", border: "none", color: "#f0e2c0", fontSize: "1.1rem" }}
          >
            ✕
          </button>
        </div>

        <div style={{ fontSize: "0.78rem", opacity: 0.72, marginTop: 6, lineHeight: 1.5 }}>
          {L(
            locale,
            "Đúng mỗi câu +1 lá, sai mỗi câu −1 lá. Không đoán thì không mất gì.",
            "Each hit pays a card, each miss costs one. Staking nothing costs nothing."
          )}
          <br />
          {/* Said out loud because it is genuinely surprising: Gatling and Indians! aim at
              nobody, so a turn spent on one makes "nobody" the right answer. Somebody who
              met this rule only after losing a card would read it as a bug. */}
          {L(
            locale,
            '"Bắn" là lá Bang! nhắm vào một người. Gatling/Indians không tính — chỉ đánh Gatling thì "không bắn ai" là ĐÚNG.',
            'A "shot" is a Bang! aimed at someone. Gatling/Indians do not count — a turn spent on Gatling makes "nobody" correct.'
          )}
        </div>

        {blocked && (
          <div style={{ marginTop: 10, fontSize: "0.8rem", color: "#ffb0b0" }}>{blocked}</div>
        )}

        {row(
          "shoot",
          L(locale, "Họ sẽ bắn ai?", "Who will they shoot?"),
          [
            { value: NO_SHOT, text: L(locale, "Không bắn ai", "Nobody") },
            ...victims.map((p) => ({ value: p.id, text: p.name })),
          ]
        )}
        {row(
          "plays",
          L(locale, "Họ sẽ đánh mấy lá?", "How many cards will they play?"),
          PLAYS_BUCKETS.map((b) => ({ value: b, text: playsBucketLabel(locale, b) }))
        )}

        {stakedKinds.size === 2 && (
          <div style={{ marginTop: 12, fontSize: "0.8rem", opacity: 0.7 }}>
            {L(locale, "Chờ hết lượt của họ để biết kết quả.", "Wait out their turn for the verdict.")}
          </div>
        )}
      </div>
    </>
  );
}
