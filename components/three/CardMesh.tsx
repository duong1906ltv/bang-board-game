"use client";

// A single Bang! card rendered as a 3D plane. The face is drawn onto a 2D
// canvas (guaranteed to render — no external asset/font loading), reusing the
// same per-card emoji icon + kind colors as the 2D <PlayingCard>. Face-down
// cards show a simple card-back pattern.
import { useMemo } from "react";
import * as THREE from "three";
import { Card, CARD_DEF_BY_ID, CARD_ICON, SUIT_SYMBOL, rankLabel } from "@/lib/cards";

// Poker-ish aspect ratio, in world units.
export const CARD_W = 0.63;
export const CARD_H = 0.88;

const KIND_BORDER: Record<string, string> = {
  brown: "#8a5a2b",
  blue: "#2f6db0",
  gun: "#b0872f",
};

function drawFace(card: Card): THREE.CanvasTexture {
  const W = 256;
  const H = 358;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const def = CARD_DEF_BY_ID[card.defId];
  const red = card.suit === "hearts" || card.suit === "diamonds";

  // Card body.
  ctx.fillStyle = "#fdf9ef";
  roundRect(ctx, 4, 4, W - 8, H - 8, 22);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = KIND_BORDER[def?.kind ?? "brown"];
  roundRect(ctx, 4, 4, W - 8, H - 8, 22);
  ctx.stroke();

  const corner = `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;
  ctx.fillStyle = red ? "#c0392b" : "#1c2733";

  // Corner labels (top-left, bottom-right rotated).
  ctx.font = "bold 34px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(corner, 18, 16);
  ctx.save();
  ctx.translate(W - 18, H - 16);
  ctx.rotate(Math.PI);
  ctx.fillText(corner, 0, 0);
  ctx.restore();

  // Big center icon.
  ctx.font = "120px system-ui, 'Apple Color Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(CARD_ICON[card.defId] ?? "🂠", W / 2, H / 2 - 10);

  // Name.
  ctx.fillStyle = "#3a2a18";
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.fillText(card.name, W / 2, H - 40);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  return tex;
}

function drawBack(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 358;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#7a1f1f";
  roundRect(ctx, 4, 4, 248, 350, 22);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#f2d29b";
  roundRect(ctx, 4, 4, 248, 350, 22);
  ctx.stroke();
  ctx.font = "90px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🤠", 128, 179);
  return new THREE.CanvasTexture(c);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function CardMesh({
  card,
  faceDown,
  position,
  rotation,
  onClick,
  scale = 1,
}: {
  card?: Card;
  faceDown?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  onClick?: () => void;
  scale?: number;
}) {
  const texture = useMemo(
    () => (faceDown || !card ? drawBack() : drawFace(card)),
    [card, faceDown]
  );
  return (
    <mesh position={position} rotation={rotation} scale={scale} onClick={onClick}>
      <planeGeometry args={[CARD_W, CARD_H]} />
      <meshStandardMaterial map={texture} roughness={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}
