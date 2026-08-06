"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { type Card } from "@/lib/cards";
import { PlayingCard } from "@/components/PlayingCard";

const DRAG_PLAY = 55;
const DRAG_DISC = 80;
const TAP_MAX = 10; // movement under this = a tap

function dragZone(d: { dx: number; dy: number } | null, canDiscard: boolean): "play" | "discard" | null {
  if (!d) return null;
  if (d.dy < -DRAG_PLAY && Math.abs(d.dy) > Math.abs(d.dx)) return "play";
  if (canDiscard && d.dx > DRAG_DISC && Math.abs(d.dx) >= Math.abs(d.dy)) return "discard";
  return null;
}

// A hand card you drag: up plays it; right discards it (only when over the hand
// limit). Anything else snaps back. Reports its drag state so the parent can
// show the drop zones.
export function DragCard({
  card,
  canInteract,
  canDiscard,
  selected,
  entering,
  onPlay,
  onDiscard,
  onDragState,
}: {
  card: Card;
  canInteract: boolean;
  canDiscard: boolean;
  selected?: boolean;
  entering?: boolean;
  onPlay: () => void;
  onDiscard: () => void;
  onDragState?: (d: { dx: number; dy: number } | null) => void;
}) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const zone = dragZone(drag, canDiscard);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canInteract) return;
    start.current = { x: e.clientX, y: e.clientY };
    setDrag({ dx: 0, dy: 0 });
    onDragState?.({ dx: 0, dy: 0 });
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const d = { dx: e.clientX - start.current.x, dy: e.clientY - start.current.y };
    setDrag(d);
    onDragState?.(d);
  };
  const up = () => {
    if (!start.current) return;
    const z = zone;
    const d = drag;
    start.current = null;
    setDrag(null);
    onDragState?.(null);
    if (z === "play") return onPlay();
    if (z === "discard") return onDiscard();
    // A tap (barely moved) also plays — the easy path.
    if (d && Math.abs(d.dx) < TAP_MAX && Math.abs(d.dy) < TAP_MAX) onPlay();
  };
  return (
    <div
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      style={{
        touchAction: "none",
        userSelect: "none",
        cursor: canInteract ? "grab" : "default",
        transform: drag ? `translate(${drag.dx}px, ${drag.dy}px) scale(1.06)` : undefined,
        transition: drag ? "none" : "transform .16s ease",
        animation: entering && !drag ? "drawIn 0.5s cubic-bezier(0.2,0.85,0.25,1) both" : undefined,
        borderRadius: 10,
        position: "relative",
        zIndex: drag ? 60 : undefined,
        boxShadow:
          zone === "play"
            ? "0 0 0 3px #2ecc71, 0 10px 24px rgba(0,0,0,.55)"
            : zone === "discard"
            ? "0 0 0 3px #e74c3c, 0 10px 24px rgba(0,0,0,.55)"
            : undefined,
      }}
    >
      <PlayingCard card={card} selected={selected} />
    </div>
  );
}
