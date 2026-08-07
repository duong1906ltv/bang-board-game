"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { type Card } from "@/lib/cards";
import { PlayingCard } from "@/components/PlayingCard";

// A card in your own hand. A tap acts on it; a press-and-hold reads it.
//
// This replaced a drag: up to play, sideways to discard. The drag existed to make a
// stray touch harmless, back when a tap did nothing — but it charged every single play
// of the game a deliberate gesture to buy that, and the cards are 104px on a phone. The
// safety came back in a better place: the only irreversible tap left is a play, and the
// discard that ends a turn now selects rather than throws, so the tap that used to spend
// three cards one at a time is a confirm button that spends them together or not at all.
//
// Reading the card had the tap before, so it needs the other gesture now. A hold is the
// right one for it: it is the gesture you make when you are unsure, which is exactly when
// you want to read.
const TAP_MAX = 10; // movement over this is a scroll or a slip, not a tap
const HOLD_MS = 420;

export function HandCard({
  card,
  canInteract,
  selected,
  entering,
  onTap,
  onInspect,
}: {
  card: Card;
  canInteract: boolean;
  selected?: boolean;
  entering?: boolean;
  onTap: () => void;
  onInspect: () => void;
}) {
  const [held, setHeld] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set by the hold timer so the pointerup that ends a hold does not also count as a tap
  // and play the card the player was only trying to read.
  const consumed = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHeld(false);
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    start.current = { x: e.clientX, y: e.clientY };
    consumed.current = false;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setHeld(true);
    timer.current = setTimeout(() => {
      consumed.current = true;
      setHeld(false);
      onInspect();
    }, HOLD_MS);
  };

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const d = Math.abs(e.clientX - start.current.x) + Math.abs(e.clientY - start.current.y);
    if (d > TAP_MAX) {
      start.current = null;
      clear();
    }
  };

  const up = () => {
    const began = start.current;
    start.current = null;
    clear();
    if (began && !consumed.current && canInteract) onTap();
  };

  return (
    <div
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => { start.current = null; clear(); }}
      onContextMenu={(e) => e.preventDefault()} /* a long press on mobile opens this otherwise */
      style={{
        touchAction: "none",
        userSelect: "none",
        cursor: canInteract ? "pointer" : "default",
        // Sinking while held is the only feedback that a hold is in progress and the tap
        // has not fired yet — without it the delay before the card opens reads as lag.
        transform: held ? "translateY(3px) scale(0.97)" : selected ? "translateY(-14px)" : undefined,
        transition: "transform .16s ease",
        animation: entering ? "drawIn 0.5s cubic-bezier(0.2,0.85,0.25,1) both" : undefined,
        borderRadius: 10,
        position: "relative",
      }}
    >
      <PlayingCard card={card} selected={selected} />
    </div>
  );
}
