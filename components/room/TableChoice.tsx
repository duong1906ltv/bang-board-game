"use client";

// The face-up cards of a General Store or a Kit Carlson, staged over the middle of the
// table instead of inside a modal.
//
// They were a row of 72px thumbnails in a dialog, each one needing a tap to read and a
// tap to dismiss — a memory test in front of a decision whose whole point is comparing
// the cards. Then they were full-size in that dialog, which fixed the reading and left
// the other half of the problem: the dialog covered the table. Kit Carlson's choice
// depends on what is already in play and on what is in your hand, and both were behind
// the panel.
//
// Out here they are legible AND the table is visible behind them: no panel, no dimmed
// backdrop, just cards over the felt.
//
// It was first built inside the 3D scene, as an <Html> anchored above the table the way
// CheckFx stages its Draw! reveal. That looked right and could not be clicked. The canvas
// sits in a `position: fixed` container at zIndex 40 and every HUD strip in this room is
// 55 or higher, so ANYTHING drawn inside the scene is behind all of them — drei's
// zIndexRange only orders overlays against each other within that one container, and no
// value of it can lift a button over the HUD. Two tries at reordering inside the canvas
// changed nothing, which is the tell.
//
// So it lives out here with the other controls, in the layer where a click lands. What is
// lost is that it no longer slides with the table as the room is orbited; for a decision
// the game is blocked on, staying put in the middle of the screen is no loss.
import { useState } from "react";
import { PlayingCard } from "@/components/PlayingCard";
import { L, formatPending, useLocale } from "@/lib/i18n";
import type { PendingView } from "@/lib/types";

// A <PlayingCard> at its normal size, which is what the numbers below are built on.
const CARD_W = 104;
const CARD_H = 150;
// Blown up, because these three cards ARE the screen while the choice is open — this is
// not a card sitting in a row of other UI. Done with a transform rather than a fourth
// card size in the stylesheet: a transform scales the art, the name, the rank and the
// effect line together and by exactly the same amount, where a new CSS size would need
// every one of those type rules written out again and kept in step by hand.
const BASE = 1.5;
// And bigger again for the one you have brought forward to commit to. Kept at the same
// ~25% step over BASE, so the card you pick out still visibly separates from the others
// however big the row itself is set.
const FOCUS = 1.87;
// Grown downwards from a fixed top edge, so a column's card always starts on the same
// line and only its bottom moves.
const ORIGIN = "top center";
// The card under the cursor lifts and tilts as well as growing — a card being picked up
// off a table does not stay square to it — and lands with a little overshoot, which is
// what makes it feel picked up rather than resized. A click takes it, so this is the only
// warning you get about which one you are about to spend; it is worth being large.
const MARK_LIFT = 10;
const MARK_TILT = 2;
const MARK_EASE = "transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1)";
// Between one card being dealt onto the table and the next.
const DEAL_STAGGER = 0.1;
// Room for the biggest a card can be, kept in every column whether or not the cursor is
// over it — so the row never shifts as the lift follows the mouse along it.
const CARD_AREA = CARD_H * FOCUS;
const COL = Math.ceil(CARD_W * BASE) + 13;
const GAP = 12;
// Three columns is a Kit Carlson in one row; a seven-card General Store wraps. Capped
// against the viewport as well, or a wide row runs off the sides of a narrow screen.
const ROW_MAX = COL * 3 + GAP * 2;

export function TableChoice({
  pending,
  youName,
  onChoose,
}: {
  pending: PendingView | null;
  youName: string;
  onChoose?: (cardId: string) => void;
}) {
  const locale = useLocale();
  // Only for the lift under the cursor. There is no selection to remember: a click takes
  // the card, so nothing is ever held between clicks.
  const [hoverId, setHoverId] = useState<string | null>(null);
  const cards = pending?.storeCards ?? [];
  if (!pending || (pending.kind !== "store" && pending.kind !== "kit") || !cards.length) return null;
  const mine = pending.youMustRespond;
  // How many this decision is for. Kit Carlson keeps one fewer than he is shown, and
  // that stays true as he picks: three cards then two, two then one. A General Store is
  // one card each, in turn order.
  const need = pending.kind === "kit" ? cards.length - 1 : 1;
  // Your own turn to pick needs no name on it — you are looking at your own choice, and
  // "Bạn (Kit Carlson)" is three words of preamble in front of the only line that
  // matters. Onlookers get the full sentence, because for them WHO is the whole point.
  const title = mine
    ? pending.kind === "kit"
      ? L(locale, `Chọn ${need} trong ${cards.length} lá`, `Pick ${need} of ${cards.length}`)
      : L(locale, "Chọn 1 lá", "Take a card")
    : formatPending(locale, pending, youName);
  return (
    // On top of everything the table throws up while a hand is in play: the event banner
    // (1119), the card inspector (1150), the event chips (1160), the pending note (1180)
    // and the red notice (1200). This is a decision the game is BLOCKED on, so nothing
    // that arrives on its own may cover it — that was the whole bug, twice over.
    //
    // Deliberately still under the settings menu (1300) and the briefing (1400): those
    // two are opened by the player, and a player who opens something means it.
    //
    // The container takes no clicks at all — only the cards do — so the table behind it
    // stays draggable and the room can still be orbited while you decide.
    <div
      style={{
        position: "fixed",
        top: 88,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1250,
        pointerEvents: "none",
      }}
    >
      <div style={{ width: `min(92vw, ${ROW_MAX}px)`, textAlign: "center", userSelect: "none", pointerEvents: "auto" }}>
        <div
          style={{
            display: "inline-block",
            marginBottom: 14,
            padding: "5px 14px",
            borderRadius: 10,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 14,
            color: "#f4e9d6",
            background: "rgba(24,18,12,0.86)",
            border: "1px solid rgba(224,169,85,0.7)",
            boxShadow: "0 3px 12px rgba(0,0,0,0.55)",
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: GAP }}>
          {cards.map((c, i) => {
            const on = mine && hoverId === c.id;
            return (
              <div
                key={c.id}
                className="tc-deal"
                // Left-to-right, so the row reads as being dealt out rather than
                // appearing. Only new cards animate: a General Store keeps the same keys
                // for the cards nobody has taken yet, so they sit still while the one
                // that was picked leaves.
                style={{ width: COL, display: "flex", flexDirection: "column", alignItems: "center", animationDelay: `${i * DEAL_STAGGER}s` }}
                onPointerEnter={() => setHoverId(c.id)}
                onPointerLeave={() => setHoverId((h) => (h === c.id ? null : h))}
              >
                {/* Scaled, not resized: a transform does not touch layout, so the card
                    you bring forward grows over the gap beside it instead of pushing the
                    row about while you are trying to compare it. */}
                <div style={{ height: CARD_AREA, display: "flex", justifyContent: "center" }}>
                  <div
                    style={{
                      transform: on
                        ? `scale(${FOCUS}) translateY(${-MARK_LIFT}px) rotate(${i % 2 ? MARK_TILT : -MARK_TILT}deg)`
                        : `scale(${BASE})`,
                      transformOrigin: ORIGIN,
                      transition: MARK_EASE,
                      zIndex: on ? 2 : 1,
                    }}
                  >
                    {/* The card face already carries its own effect text at this size —
                        pc-desc, the same line the inspector shows — so there is nothing
                        to repeat underneath it. */}
                    <PlayingCard
                      card={c}
                      selected={on}
                      dimmed={!mine}
                      onClick={mine && onChoose ? () => onChoose(c.id) : undefined}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
