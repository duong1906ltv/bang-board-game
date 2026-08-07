"use client";

// A single Bang! card rendered as a 3D plane. The face is drawn onto a 2D
// canvas, so the layout matches the CSS card face exactly, reusing the
// same per-card emoji icon + kind colors as the 2D <PlayingCard>. Face-down
// cards show a simple card-back pattern.
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  Card,
  CARD_DEF_BY_ID,
  CARD_ICON,
  SUIT_SYMBOL,
  cardArtFillsPanel,
  cardArtSources,
  rankLabel,
} from "@/lib/cards";

// Poker-ish aspect ratio, in world units.
export const CARD_W = 0.63;
export const CARD_H = 0.88;

// Must match --pc-accent in globals.css (.pc-brown/.pc-blue/.pc-gun): the same
// card is drawn in CSS while in hand and on canvas once on the table, and a
// mismatch reads as two different cards.
const KIND_BORDER: Record<string, string> = {
  brown: "#a06a2c",
  blue: "#3b82f6",
  gun: "#8a8f98",
};

const EMOJI_FONT = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', system-ui, sans-serif";

// `detail` is for a card the player actually READS — in practice the top of the
// discard pile, which is face-up in the middle of the table and is the one card
// anybody leans in on. It buys two things at once:
//   - the effect text, in the band the art gives up (196px of art down to 140)
//   - twice the pixels, because 16px type on a 256-wide canvas turns to mush once
//     the card fills a third of the screen at the near zoom stop
// Everything else stays plain: a gun lying on the felt is 0.29 units across and read
// by its silhouette and the icon badge over it, so text there would be a smudge and
// twenty of these canvases would cost ~40MB of texture for nothing.
function drawFace(card: Card, detail: boolean): THREE.CanvasTexture {
  const W = 256;
  const H = 358;
  // Draw in one fixed coordinate system whatever the resolution: scale the context
  // instead of the numbers, so the layout below is written once.
  const S = detail ? 2 : 1;
  const c = document.createElement("canvas");
  c.width = W * S;
  c.height = H * S;
  const ctx = c.getContext("2d")!;
  ctx.scale(S, S);
  const def = CARD_DEF_BY_ID[card.defId];
  const red = card.suit === "hearts" || card.suit === "diamonds";

  // Card body — same construction as the 2D PlayingCard: a wooden frame with a
  // screw in each corner holding an aged-parchment insert ringed by the kind
  // colour.
  const wood = ctx.createLinearGradient(0, 0, W, H);
  wood.addColorStop(0, "#8a5c2c");
  wood.addColorStop(0.55, "#55381a");
  wood.addColorStop(1, "#6b471f");
  ctx.fillStyle = wood;
  roundRect(ctx, 2, 2, W - 4, H - 4, 22);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#33200e";
  roundRect(ctx, 2, 2, W - 4, H - 4, 22);
  ctx.stroke();
  for (const [sx, sy] of [[16, 16], [W - 16, 16], [16, H - 16], [W - 16, H - 16]]) {
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#3a2410";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, sy, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = "#e8d6ae";
    ctx.fill();
  }

  const parch = ctx.createLinearGradient(0, PARCH_Y, 0, H - PARCH_Y);
  parch.addColorStop(0, "#f7ebcf");
  parch.addColorStop(0.65, "#ecdcb4");
  parch.addColorStop(1, "#dfcb9f");
  ctx.fillStyle = parch;
  roundRect(ctx, PARCH_X, PARCH_Y, W - PARCH_X * 2, H - PARCH_Y * 2, 9);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = KIND_BORDER[def?.kind ?? "brown"];
  roundRect(ctx, PARCH_X, PARCH_Y, W - PARCH_X * 2, H - PARCH_Y * 2, 9);
  ctx.stroke();

  // Name at the top, engraved serif to match the 2D face.
  ctx.fillStyle = "#46290d";
  ctx.font = "bold 29px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(card.name.toUpperCase(), W / 2, PARCH_Y + 12, W - PARCH_X * 2 - 16);
  ctx.strokeStyle = "rgba(112,76,32,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PARCH_X + 8, PARCH_Y + 48);
  ctx.lineTo(W - PARCH_X - 8, PARCH_Y + 48);
  ctx.stroke();

  // Rank + suit — only at the bottom-left (like the real card).
  ctx.fillStyle = red ? "#c0392b" : "#1c2733";
  ctx.font = "bold 32px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`, PARCH_X + 10, H - PARCH_Y - 10);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;

  // Center art: the SAME sources the 2D <PlayingCard> uses so a card looks
  // identical in hand and on the table — illustration first, then our vector
  // art, then the emoji icon. Images decode async, so draw when ready and flag
  // the texture for re-upload.
  const boxX = PARCH_X + 8, boxY = PARCH_Y + 56;
  const boxW = W - (PARCH_X + 8) * 2, boxH = detail ? 140 : 196;
  ctx.fillStyle = "#e7d6b0";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(74,48,22,0.45)";
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  // Effect text, in the band the shrunken art panel gives up. Drawn once here rather
  // than inside the art callbacks: it sits BELOW the panel, which is clipped, so the
  // async illustration can never land on top of it.
  //
  // Auto-fit instead of one fixed size — the shortest effect is 10 characters and the
  // longest 89, so no single size serves both. Largest that fits whole wins, and the
  // smallest clamps with an ellipsis so a longer string added later still cannot run
  // into the rank.
  if (detail && def?.effect) {
    const top = boxY + boxH + 8;
    const band = H - PARCH_Y - 44 - top; // stop clear of the rank + suit below
    ctx.fillStyle = "#5b4123";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const sizes = [16, 15, 14, 13, 12, 11];
    for (const [i, size] of sizes.entries()) {
      ctx.font = `${size}px system-ui, sans-serif`;
      const lh = Math.round(size * 1.18);
      const max = Math.max(1, Math.floor(band / lh));
      const lines = wrapText(ctx, def.effect, boxW);
      if (lines.length > max && i < sizes.length - 1) continue;
      lines.slice(0, max).forEach((ln, j) => {
        const cut = lines.length > max && j === max - 1;
        ctx.fillText(cut ? `${ln}…` : ln, W / 2, top + j * lh);
      });
      break;
    }
  }

  // Range token over the art, bottom-right — same marker as the 2D face. Drawn
  // after the art each time, so it survives the async image draw below.
  const drawRange = () => {
    if (def?.range == null) return;
    const r = 19, cx = boxX + boxW - r - 4, cy = boxY + boxH - r - 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#f6ecd2";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#3a2410";
    ctx.stroke();
    ctx.fillStyle = "#2f1c08";
    ctx.font = "bold 24px Georgia, 'Times New Roman', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(def.range), cx, cy + 1);
  };

  const drawEmoji = () => {
    ctx.font = `110px ${EMOJI_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#2a2114";
    ctx.fillText(CARD_ICON[card.defId] ?? "🂠", W / 2, boxY + boxH / 2);
    drawRange();
    tex.needsUpdate = true;
  };

  const sources = cardArtSources(card.defId);
  const tryFrom = (i: number) => {
    if (i >= sources.length) return drawEmoji();
    const src = sources[i];
    const img = new Image();
    img.onload = () => {
      // Pre-padded illustrations fill the panel (only padding is cropped);
      // vector art is letterboxed.
      const scale = cardArtFillsPanel(src)
        ? Math.max(boxW / img.width, boxH / img.height)
        : Math.min(boxW / img.width, boxH / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(boxX, boxY, boxW, boxH);
      ctx.clip();
      ctx.drawImage(img, boxX + (boxW - dw) / 2, boxY + (boxH - dh) / 2, dw, dh);
      ctx.restore();
      drawRange();
      tex.needsUpdate = true;
    };
    img.onerror = () => tryFrom(i + 1);
    img.src = src;
  };
  tryFrom(0);
  return tex;
}

// Wooden-frame inset: where the parchment insert starts on the 256×358 face.
const PARCH_X = 20;
const PARCH_Y = 20;

// The back has no inputs, so one texture serves every face-down card: a full table
// renders ~40 of them (each opponent's hand plus the deck stack) and a texture per
// copy is that many canvases and GPU uploads for one identical image.
let sharedBack: THREE.CanvasTexture | null = null;

function cardBack(): THREE.CanvasTexture {
  if (!sharedBack) sharedBack = drawBack();
  return sharedBack;
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
  ctx.font = `90px ${EMOJI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🤠", 128, 179);
  return new THREE.CanvasTexture(c);
}

// Greedy word wrap against the real font metrics. The effect strings are Vietnamese
// prose of very uneven length, and a characters-per-line rule mis-measures them badly
// — accents and the narrow digits in "Draw! ra [2–9] Bích" both throw it off.
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
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
  detail,
}: {
  card?: Card;
  faceDown?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  onClick?: () => void;
  scale?: number;
  // Draw the full readable face — effect text, at twice the resolution. For a card
  // the player reads rather than identifies; see drawFace.
  detail?: boolean;
}) {
  // Memo by VALUE (defId/suit/rank), not by the `card` object reference: every
  // socket `view` update produces fresh card objects with identical values, so
  // keying on the object would rebuild the CanvasTexture on every broadcast.
  const texture = useMemo(
    () => (faceDown || !card ? cardBack() : drawFace(card, !!detail)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card?.defId, card?.suit, card?.rank, faceDown, detail]
  );
  // CanvasTexture holds a GPU allocation that r3f does not free for us: dispose
  // the previous one whenever it changes or the mesh unmounts. Never the shared
  // back texture — every other face-down card is still using it.
  useEffect(
    () => () => {
      if (texture !== sharedBack) texture.dispose();
    },
    [texture]
  );
  return (
    <mesh position={position} rotation={rotation} scale={scale} onClick={onClick}>
      <planeGeometry args={[CARD_W, CARD_H]} />
      <meshStandardMaterial map={texture} roughness={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}
