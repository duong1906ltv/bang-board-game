"use client";

import { useState } from "react";
import { PlayerView } from "@/lib/types";
import { type Card } from "@/lib/cards";
import { PlayingCard } from "@/components/PlayingCard";
import { L, useLocale, formatPending, checkText, actionLabel } from "@/lib/i18n";
import { CardModal } from "./CardModal";
import { PENDING_EMOJI, CHECK_ICON } from "./constants";

export function ReactionPanel({
  view,
  onRespond,
  onChoose,
}: {
  view: PlayerView;
  onRespond: (type: "missed" | "beer" | "bang" | "pass", cardId?: string) => void;
  onChoose: (cardId: string) => void;
}) {
  const locale = useLocale();
  const p = view.pending!;
  const you = view.you;

  const [open, setOpen] = useState(true);
  // A store/kit card the player tapped to read before committing. Picking used to
  // fire on the first tap off a thumbnail with no effect text anywhere, so choosing
  // from a General Store meant either knowing all 21 cards by their art or guessing.
  const [preview, setPreview] = useState<Card | null>(null);

  const doAction = (a: "missed" | "beer" | "bang" | "pass") => {
    if (a === "pass") return onRespond("pass");
    // Some characters may play one card as another (Calamity Janet swaps
    // Bang!/Missed!) — fall back to the swapped card so the reaction is still
    // possible without the literal card in hand.
    const swap = you.character?.effect.useAs;
    const alt =
      swap && swap.includes(a)
        ? swap[0] === a
          ? swap[1]
          : swap[0]
        : null;
    const card = you.hand.find((c) => c.defId === a) ?? (alt ? you.hand.find((c) => c.defId === alt) : undefined);
    onRespond(a, card?.id);
  };

  // Minimized: a small chip so you can look at your hand / other cards, then reopen.
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          top: "50%",
          left: 12,
          transform: "translateY(-50%)",
          // See PendingNote: urgency ordering, above the event banner.
          zIndex: 1180,
          width: 150,
          padding: "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          alignItems: "flex-start",
          textAlign: "left",
          lineHeight: 1.35,
          background: "var(--accent2)",
          boxShadow: "0 4px 16px rgba(0,0,0,.5)",
        }}
      >
        <span>{PENDING_EMOJI[p.kind]} {formatPending(locale, p, you.name)}</span>
        <span style={{ textDecoration: "underline" }}>{L(locale, "Phản ứng", "Respond")}</span>
      </button>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ color: "var(--accent)", position: "relative" }}>
        <button
          className="ghost"
          onClick={() => setOpen(false)}
          style={{ position: "absolute", top: 8, right: 8, width: "auto", padding: "4px 10px", fontSize: "0.8rem" }}
          title={L(locale, "Thu nhỏ để xem bài", "Minimize to view cards")}
        >
          {L(locale, "Xem bài ▾", "View cards ▾")}
        </button>
        <div className="modal-emoji">{PENDING_EMOJI[p.kind]}</div>
        <p className="modal-ability">{formatPending(locale, p, you.name)}</p>
        {p.kind === "bang" && (
          <p className="muted">
            {L(locale, `Cần ${(p.missedNeeded ?? 1) - (p.missedPlayed ?? 0)} Missed! để né`, `Need ${(p.missedNeeded ?? 1) - (p.missedPlayed ?? 0)} Missed! to dodge`)}
          </p>
        )}
        {p.kind === "multi" && p.waiting && p.waiting.length > 0 && (
          <p className="muted">{L(locale, "Đang chờ", "Waiting for")}: {p.waiting.join(", ")}</p>
        )}

        {/* Dynamite / Jail reveal: the actual card, big enough to read, with what it
            means underneath. Held here until dismissed — this is the only moment the
            player learns whether their turn survived. */}
        {p.kind === "check" && (
          <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap", margin: "4px 0 12px" }}>
            {(p.checks ?? []).map((c, i) => {
              const t = checkText(locale, c.kind, c.outcome);
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  {c.card && <PlayingCard card={c.card} size="sm" />}
                  <span style={{ fontWeight: 700 }}>{CHECK_ICON[c.kind] ?? "🎴"} {t.kind}</span>
                  <span className="muted">{t.outcome}</span>
                </div>
              );
            })}
          </div>
        )}

        {(p.kind === "store" || p.kind === "kit") && (
          <>
            <div className="card-row" style={{ justifyContent: "center" }}>
              {(p.storeCards ?? []).map((c) => (
                <PlayingCard
                  key={c.id}
                  card={c}
                  size="sm"
                  // Tapping opens the card full-size with its effect text; the pick
                  // itself is confirmed from there. Onlookers may read the cards too —
                  // they are face-up on the table — they just get no pick button.
                  onClick={() => setPreview(c)}
                  dimmed={!p.youMustRespond}
                />
              ))}
            </div>
            {/* Re-read from the live list: a card you were still reading about can be
                taken by whoever picks before you, and offering "take this" for a card
                that has already left the table is a rejection waiting to happen. */}
            {preview && (p.storeCards ?? []).some((c) => c.id === preview.id) && (
              <CardModal
                card={preview}
                showEffect
                onClose={() => setPreview(null)}
                actions={
                  p.youMustRespond
                    ? [
                        { label: L(locale, "Chọn lá này", "Take this card"), onClick: () => { setPreview(null); onChoose(preview.id); } },
                        { label: L(locale, "Đóng", "Close"), onClick: () => setPreview(null), ghost: true },
                      ]
                    : undefined
                }
              />
            )}
          </>
        )}

        {p.actions.map((a, i) => (
          <div key={a}>
            {i > 0 && <div style={{ height: 8 }} />}
            <button className={a === "pass" ? "ghost" : ""} onClick={() => doAction(a)}>
              {actionLabel(locale, a)}
            </button>
          </div>
        ))}

        {!p.youMustRespond && p.kind !== "store" && (
          <p className="muted" style={{ marginTop: 10 }}>{L(locale, "Đang chờ người khác…", "Waiting for others…")}</p>
        )}
      </div>
    </div>
  );
}
