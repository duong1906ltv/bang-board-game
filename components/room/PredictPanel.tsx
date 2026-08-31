"use client";

import { useEffect, useState } from "react";
import type { PlayerView } from "@/lib/types";
import { PLAYS_BUCKETS } from "@/lib/predictions";
import { L, useLocale, predictBlockText, playsBucketLabel } from "@/lib/i18n";

// Stake a quiet guess on how many cards the player now taking their turn will play.
//
// Deliberately PASSIVE: a chance to stake opens on every single turn, 40-60 times a game, so
// anything that popped itself open or nagged would stop being a game and start being a
// notification. It sits in the corner as one collapsed chip; ignoring it forever is a
// legitimate way to play and costs nothing.
//
// The countdown lives INSIDE the open panel and nowhere else. A clock ticking on the table
// is exactly the nagging this feature is built to avoid — and a window you cannot see is
// also the honest presentation, because the decision it wants is "do I have a read", not
// "how many seconds are left". The chip still turns purple while a stake is possible, which
// says a window is open without putting a timer on the screen.
export function PredictPanel({
  view,
  onPredict,
  onCancelPredict,
}: {
  view: PlayerView;
  onPredict: (subjectId: string, value: string) => void;
  onCancelPredict: (subjectId: string) => void;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  // Which bucket is highlighted but NOT yet staked. A tap selects; only Xác nhận stakes —
  // the same rule the hand follows for cards that cannot be aimed, and for the same reason:
  // the buttons are small, the action moves cards, and there has to be a moment to look.
  const [picked, setPicked] = useState<string | null>(null);

  // Defaulted for the same reason as predictFeed in useTableFeedback: a tab open across a
  // server restart is fed a view built by code that never had these fields.
  const subjectId = view.predictSubjectId ?? null;
  const msFromServer = view.predictMsLeft ?? 0;

  // The countdown runs on a LOCAL deadline seeded from the server's remaining-ms, re-seeded
  // every time a view lands. That way a browser clock that disagrees with the server's by
  // seconds still counts down truthfully, and the server stays the only judge of a late
  // press. One interval, only while the panel is open — no timer runs on a closed chip.
  const [deadline, setDeadline] = useState(() => Date.now() + msFromServer);
  const [, tick] = useState(0);
  useEffect(() => setDeadline(Date.now() + msFromServer), [msFromServer]);
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [open]);
  const msLeft = Math.max(0, deadline - Date.now());

  const subject = view.players.find((p) => p.id === subjectId) ?? null;
  const staked = (view.you.myPredictions ?? []).find((p) => p.targetId === subject?.id) ?? null;
  // The local clock is counted in as well as the server's reason, and it is allowed to say no
  // on its own. Between two view pushes nothing arrives to update predictBlockReason, so a
  // window that ran out mid-thought would still look open — and the reason has to be SPOKEN,
  // never a silent grey: the last prediction bug was a panel with every button dead and
  // nothing on screen saying why, and it survived because nobody could tell it from a style.
  const blocked =
    predictBlockText(locale, view.you.predictBlockReason) ||
    (msLeft <= 0 ? predictBlockText(locale, "predict-window-closed") : "");
  const canStake = !!subject && !blocked && !staked;
  // Cancelling is the window's privilege, not the stake's: once the clock runs out the guess
  // is final. Otherwise "confirm" would mean nothing — you could stake a bucket, watch a
  // card go down, and swap to the one that just became true.
  const canCancel = !!staked && msLeft > 0;

  // A tap on a bucket only selects, so the pick has to be dropped when it stops being
  // actionable: the turn moved on, somebody staked from another tab, the clock ran out.
  // Both of these sit ABOVE the early return — every hook in this component has to run on
  // every render or React loses track of which state belongs to which call.
  useEffect(() => {
    if (!canStake) setPicked(null);
  }, [canStake]);
  useEffect(() => setPicked(null), [subject?.id]);

  if (!subject || view.phase !== "playing") return null;

  const ready = canStake;
  const chip = (
    <button
      onClick={() => setOpen(true)}
      title={L(locale, "Đoán số lá người đang chơi sẽ đánh", "Guess how many cards the current player plays")}
      style={{
        width: "auto", padding: "3px 9px", fontSize: "0.82rem", fontWeight: 700,
        borderRadius: 8, color: "#f0e2c0", fontFamily: "system-ui, sans-serif",
        background: ready ? "rgba(40,28,64,0.95)" : "rgba(16,32,52,0.92)",
        border: `1px solid ${
          staked ? "rgba(120,220,150,0.85)" : ready ? "rgba(186,140,255,0.9)" : "rgba(91,155,213,0.55)"
        }`,
        display: "flex", alignItems: "center", gap: 5,
        opacity: blocked && !staked ? 0.6 : 1,
      }}
    >
      <span style={{ fontSize: "0.95rem" }}>🔮</span>
      <span style={{ fontWeight: 700 }}>{L(locale, "Đoán", "Guess")}</span>
      <span style={{ opacity: 0.75, fontWeight: 600 }}>
        {staked ? playsBucketLabel(locale, staked.value) : `· ${subject.name}`}
      </span>
    </button>
  );

  if (!open) return chip;

  const secs = Math.ceil(msLeft / 1000);
  // Colour, not just a number: the last five seconds are the ones worth reacting to, and a
  // plain countdown reads as decoration until it is already gone.
  const clockColor = msLeft <= 0 ? "#ffb0b0" : secs <= 5 ? "#ffd08a" : "#8fe0a8";

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
            🔮 {L(locale, "Đang chơi", "Playing now")}: {subject.name}
          </strong>
          <button
            onClick={() => setOpen(false)}
            aria-label={L(locale, "Đóng", "Close")}
            style={{ width: "auto", background: "none", border: "none", color: "#f0e2c0", fontSize: "1.1rem" }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: "0.78rem", opacity: 0.72 }}>
            {L(locale, "Còn", "Time")}
          </span>
          <strong style={{ fontSize: "1.15rem", color: clockColor, fontVariantNumeric: "tabular-nums" }}>
            {msLeft > 0 ? `${secs}s` : L(locale, "hết giờ", "closed")}
          </strong>
        </div>

        <div style={{ fontSize: "0.78rem", opacity: 0.72, marginTop: 8, lineHeight: 1.5 }}>
          {L(
            locale,
            "Đoán đúng +1 lá, sai −1 lá. Không đoán thì không mất gì. Cửa sổ đặt hẹp lại mỗi khi có người chết.",
            "A hit pays a card, a miss costs one. Staking nothing costs nothing. The window narrows each time somebody dies."
          )}
        </div>

        {blocked && !staked && (
          <div style={{ marginTop: 10, fontSize: "0.8rem", color: "#ffb0b0" }}>{blocked}</div>
        )}

        <div style={{ marginTop: 14, fontSize: "0.82rem", opacity: 0.8, marginBottom: 6 }}>
          {L(locale, "Họ sẽ đánh mấy lá trong lượt này?", "How many cards will they play this turn?")}
        </div>

        {staked ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#8fe0a8" }}>
              ✓ {playsBucketLabel(locale, staked.value)}
            </span>
            {canCancel ? (
              <button
                onClick={() => onCancelPredict(subject.id)}
                style={{
                  width: "auto", padding: "4px 12px", fontSize: "0.8rem", borderRadius: 8,
                  color: "#f0e2c0", background: "rgba(10,22,38,0.9)",
                  border: "1px solid rgba(226,120,120,0.7)",
                }}
              >
                {L(locale, "Huỷ đoán", "Take it back")}
              </button>
            ) : (
              <span style={{ fontSize: "0.78rem", opacity: 0.66 }}>
                {L(locale, "đã chốt — chờ hết lượt của họ", "locked in — wait out their turn")}
              </span>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PLAYS_BUCKETS.map((b) => {
                const on = picked === b;
                return (
                  <button
                    key={b}
                    disabled={!canStake}
                    onClick={() => setPicked(b)}
                    style={{
                      width: "auto", padding: "5px 12px", fontSize: "0.85rem", borderRadius: 8,
                      fontWeight: on ? 700 : 500,
                      color: !canStake ? "#8b8b8b" : "#f0e2c0",
                      background: on ? "rgba(60,40,96,0.95)" : "rgba(10,22,38,0.9)",
                      border: `1px solid ${on ? "rgba(186,140,255,0.95)" : "rgba(91,155,213,0.55)"}`,
                      cursor: !canStake ? "not-allowed" : "pointer",
                    }}
                  >
                    {playsBucketLabel(locale, b)}
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
              <button
                disabled={!canStake || !picked}
                onClick={() => picked && onPredict(subject.id, picked)}
                style={{
                  width: "auto", padding: "8px 18px", fontSize: "0.88rem", fontWeight: 700,
                  borderRadius: 10,
                  color: canStake && picked ? "#14202f" : "#8b8b8b",
                  background: canStake && picked ? "#e2b25a" : "rgba(10,22,38,0.9)",
                  border: "1px solid rgba(226,178,90,0.8)",
                  cursor: canStake && picked ? "pointer" : "not-allowed",
                }}
              >
                {L(locale, "Xác nhận", "Confirm")}
              </button>
              <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                {L(locale, "chốt rồi vẫn huỷ được khi còn giờ", "you can take it back while the clock runs")}
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
