// Textures the table builds for itself: canvas-drawn art generated at runtime — no
// image downloads.
import * as THREE from "three";

// Repeating wooden-plank texture drawn on a canvas (no external asset needed).
export function plankTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#6e4a28";
  ctx.fillRect(0, 0, 128, 128);
  const ph = 32;
  for (let y = 0; y < 128; y += ph) {
    const alt = (y / ph) % 2 === 0;
    ctx.fillStyle = alt ? "#7a5330" : "#623f22";
    ctx.fillRect(0, y, 128, ph - 2);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + ph - 1);
    ctx.lineTo(128, y + ph - 1);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}



// A carved wooden "SALOON" sign board for the back wall.
export function signTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 150;
  const ctx = c.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(c);
  // wood board with horizontal plank seams
  ctx.fillStyle = "#4a2f16";
  ctx.fillRect(0, 0, 512, 150);
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 3;
  for (let y = 50; y < 150; y += 50) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
  }
  // gilt border + engraved title
  ctx.strokeStyle = "#caa24a";
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, 488, 126);
  ctx.fillStyle = "#f0d68a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 84px Georgia, serif";
  ctx.fillText("SALOON", 256, 80);
  return new THREE.CanvasTexture(c);
}

// ── procedural wall / floor decor (self-contained, no external assets) ────────
// Each piece is built in its local frame facing +z; when
// mounted on a side wall the parent <group> is rotated so +z points into the room.


// The felt surface, drawn on a canvas instead of being a flat colour. A single
// `meshStandardMaterial color` read as plastic clip-art; this bakes in the fibre
// noise, a darkened rim, the inner ring and the sheriff star so the whole surface
// is one texture (no extra ring mesh, no decal plane fighting for z).
export function feltTexture(): THREE.Texture {
  const S = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const mid = S / 2;

  // base: lit toward the middle (under the lamp), falling off to the rim
  const grad = g.createRadialGradient(mid, mid * 0.9, S * 0.05, mid, mid, mid);
  grad.addColorStop(0, "#2f7d47");
  grad.addColorStop(0.55, "#246438");
  grad.addColorStop(1, "#173f24");
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);

  // felt fibre: short strokes at random angles, half light and half dark, so the
  // surface breaks up under the lamp instead of reading as a solid sheet
  for (let i = 0; i < 24000; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const a = Math.random() * Math.PI;
    const len = 1.5 + Math.random() * 3;
    g.strokeStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.045)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }

  // sheriff star, worn into the felt rather than painted on top
  g.save();
  g.translate(mid, mid);
  g.beginPath();
  const spikes = 5;
  const R = S * 0.2;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? R : R * 0.42;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.closePath();
  g.fillStyle = "rgba(190,150,70,0.13)";
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.16)";
  g.lineWidth = 3;
  g.stroke();
  g.restore();

  // faint betting ring
  g.beginPath();
  g.arc(mid, mid, S * 0.32, 0, Math.PI * 2);
  g.strokeStyle = "rgba(0,0,0,0.18)";
  g.lineWidth = 5;
  g.stroke();

  // darkened outer edge so the rim doesn't glow brighter than the middle
  const rim = g.createRadialGradient(mid, mid, mid * 0.82, mid, mid, mid);
  rim.addColorStop(0, "rgba(0,0,0,0)");
  rim.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = rim;
  g.fillRect(0, 0, S, S);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}


// Wall boards. The floor's planks run in one direction and repeat 6x6 across a square
// the size of the room; a wall needs its own copy because it repeats over a different
// shape and must not share the floor's texture object — a Texture carries its own
// `repeat`, so setting one would move the other.
//
// Darker than the floor on purpose. A room lit from a single lamp over the table reads
// as deeper when the vertical surfaces fall away faster than the horizontal one, and
// boards that match the floor exactly make the corners disappear into a single tone.
export function wallTexture(repeatX: number, repeatY: number): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#4b3018";
  g.fillRect(0, 0, 128, 128);
  const bw = 21.33; // six boards across the tile
  for (let x = 0; x < 128; x += bw) {
    const t = ((x / bw) * 37) % 5; // deterministic per-board tint, no Math.random
    g.fillStyle = ["#553719", "#4a2f16", "#5c3c1d", "#452b14", "#503318"][Math.floor(t)];
    g.fillRect(x, 0, bw - 1.5, 128);
    g.strokeStyle = "rgba(0,0,0,0.45)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x + bw - 0.75, 0);
    g.lineTo(x + bw - 0.75, 128);
    g.stroke();
  }
  // A couple of horizontal nail lines, so the boards read as fixed to something.
  g.fillStyle = "rgba(0,0,0,0.22)";
  g.fillRect(0, 30, 128, 2);
  g.fillRect(0, 98, 128, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
