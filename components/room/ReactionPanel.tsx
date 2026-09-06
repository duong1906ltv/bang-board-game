"use client";

import { useState } from "react";
import { PendingAction, PlayerView } from "@/lib/types";
import { PlayingCard } from "@/components/PlayingCard";
import { L, useLocale, formatPending, checkText, actionLabel } from "@/lib/i18n";
import { PENDING_EMOJI, CHECK_ICON } from "./constants";

export function ReactionPanel({
  view,
  onRespond,
}: {
  view: PlayerView;
  onRespond: (type: PendingAction, cardId?: string) => void;
}) {
  const locale = useLocale();
  const p = view.pending!;
  const you = view.you;

  const [open, setOpen] = useState(true);

  // Lá nào trả lời được cửa này do SERVER quyết và gửi trong p.usableCardIds. Bản cũ tự
  // tìm bằng `defId === a` rồi vá thêm nhánh cho Calamity Janet — và thế là mỗi luật mới
  // (Dodge mang ký hiệu Mancato!, Elena Fuente đỡ bằng lá bất kỳ) lại là một nút bấm được
  // mà không gửi được lá nào.
  const usable = you.hand.filter((c) => (p.usableCardIds ?? []).includes(c.id));
  // Nhiều LOẠI lá trả lời được thì để người chơi chọn: một Dodge đỡ xong còn rút thêm 1
  // lá, chọn hộ họ là chọn mất phần hơn đó.
  const choices = [...new Map(usable.map((c) => [c.defId, c])).values()];

  const doAction = (a: PendingAction, cardId?: string) => {
    if (a === "pass") return onRespond("pass");
    onRespond(a, cardId ?? usable[0]?.id);
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

  // General Store and Kit Carlson are picked from the cards themselves, staged over the
  // table (see TableChoice) — both carry no actions, so there is nothing left for a
  // panel to hold and covering the felt with one would hide what the choice depends on.
  if (p.kind === "store" || p.kind === "kit") return null;

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

        {/* Bỏ 1 lá cho Brawl: chạm lá trên tay ở dưới, hoặc chạm một lá đang bày ra bàn
            ngay đây — người chỉ còn đồ trên bàn cũng phải bỏ được, nếu không cửa này
            không bao giờ đóng. */}
        {p.kind === "toss" && you.equipment.length > 0 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", margin: "4px 0 12px" }}>
            {you.equipment.map((c) => (
              <button
                key={c.id}
                onClick={() => onRespond("toss", c.id)}
                style={{ width: "auto", padding: 0, background: "none", border: "none" }}
                title={c.name}
              >
                <PlayingCard card={c} size="sm" />
              </button>
            ))}
          </div>
        )}
        {p.kind === "toss" && (
          <p className="muted">
            {L(locale, "Chạm 1 lá trên tay để bỏ", "Tap a card in your hand to discard")}
          </p>
        )}

        {/* Hơn một loại lá đỡ được thì hiện cả hai, đừng chọn hộ. */}
        {choices.length > 1 && p.kind !== "toss" && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", margin: "4px 0 12px" }}>
            {choices.map((c) => (
              <button
                key={c.id}
                onClick={() => doAction(p.actions[0], c.id)}
                style={{ width: "auto", padding: 0, background: "none", border: "none" }}
                title={c.name}
              >
                <PlayingCard card={c} size="sm" />
              </button>
            ))}
          </div>
        )}

        {p.actions.filter((a) => a !== "toss").map((a, i) => (
          <div key={a}>
            {i > 0 && <div style={{ height: 8 }} />}
            {/* "Bỏ qua" is the right word when passing is a CHOICE — declining to
                dodge a Bang!. Here there is nothing to decline: the card is going
                whatever you press, and the button only says you have read that. */}
            <button className={a === "pass" && p.kind !== "taken" ? "ghost" : ""} onClick={() => doAction(a)}>
              {p.kind === "taken" && a === "pass" ? "OK" : actionLabel(locale, a)}
            </button>
          </div>
        ))}

        {/* The exception this used to carry — "not for a General Store" — is gone with
            the store itself: an onlooker there is watching the cards out on the table,
            not this panel. */}
        {!p.youMustRespond && (
          <p className="muted" style={{ marginTop: 10 }}>{L(locale, "Đang chờ người khác…", "Waiting for others…")}</p>
        )}
      </div>
    </div>
  );
}
