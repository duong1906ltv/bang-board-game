"use client";

// First-person 3D table for Bang!. Reads the SAME PlayerView the 2D room uses,
// so the game logic / socket layer is untouched — this is purely a render layer.
// The camera sits at "your" seat looking across a round table; your hand is
// fanned in front of you, opponents are arranged around the far arc.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Html, Environment } from "@react-three/drei";
import { CardMesh } from "./CardMesh";
import { PlayingCard } from "@/components/PlayingCard";
import { CARD_DEF_BY_ID, CARD_ICON, CARD_IMAGE, type Card } from "@/lib/cards";
import type { PlayerView, PlayerPublic, CheckView } from "@/lib/types";
import { ROLE_EMOJI } from "@/lib/types";

// Repeating wooden-plank texture drawn on a canvas (no external asset needed).
function plankTexture() {
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

// A "WANTED" poster texture for the walls.
function posterTexture() {
  const c = document.createElement("canvas");
  c.width = 200;
  c.height = 280;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e8d5a8";
  ctx.fillRect(0, 0, 200, 280);
  ctx.strokeStyle = "#6b4a24";
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 184, 264);
  ctx.fillStyle = "#3a2410";
  ctx.textAlign = "center";
  ctx.font = "bold 42px Georgia, serif";
  ctx.fillText("WANTED", 100, 56);
  ctx.font = "20px Georgia, serif";
  ctx.fillText("DEAD OR ALIVE", 100, 82);
  // silhouette face
  ctx.fillStyle = "#8a6a44";
  ctx.fillRect(50, 100, 100, 100);
  ctx.fillStyle = "#5a4028";
  ctx.beginPath();
  ctx.arc(100, 150, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2410";
  ctx.font = "bold 30px Georgia, serif";
  ctx.fillText("$500", 100, 240);
  return new THREE.CanvasTexture(c);
}

// A playful "Ronaldo" tribute poster (stylised — no real photo). Drawn on canvas
// so it stays self-contained: framed portrait in a #7 jersey with "SIUUU ⚽".
function ronaldoTexture() {
  const c = document.createElement("canvas");
  c.width = 200;
  c.height = 280;
  const ctx = c.getContext("2d")!;
  // parchment + frame
  ctx.fillStyle = "#f0e2c0";
  ctx.fillRect(0, 0, 200, 280);
  ctx.strokeStyle = "#8a5a24";
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 188, 268);
  // title
  ctx.fillStyle = "#7a1f1f";
  ctx.textAlign = "center";
  ctx.font = "bold 30px Georgia, serif";
  ctx.fillText("RONALDO", 100, 40);
  // green pitch backdrop for the portrait
  ctx.fillStyle = "#2f6f38";
  ctx.fillRect(30, 56, 140, 150);
  // head
  ctx.fillStyle = "#e6b48c";
  ctx.beginPath();
  ctx.ellipse(100, 108, 30, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  // hair
  ctx.fillStyle = "#3a2410";
  ctx.beginPath();
  ctx.arc(100, 92, 31, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(69, 84, 62, 12);
  // eyes + big grin
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath(); ctx.arc(90, 106, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(110, 106, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.ellipse(100, 122, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
  // red #7 jersey
  ctx.fillStyle = "#c0392b";
  ctx.beginPath();
  ctx.moveTo(64, 206); ctx.lineTo(74, 150); ctx.lineTo(126, 150); ctx.lineTo(136, 206);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 34px Arial, sans-serif";
  ctx.fillText("7", 100, 190);
  // tagline
  ctx.fillStyle = "#7a1f1f";
  ctx.font = "bold 26px Georgia, serif";
  ctx.fillText("SIUUU! ⚽", 100, 246);
  return new THREE.CanvasTexture(c);
}

// A carved wooden "SALOON" sign board for the back wall.
function signTexture() {
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
// Each piece is built in its local frame facing +z (like the wall posters); when
// mounted on a side wall the parent <group> is rotated so +z points into the room.

const WOOD = "#5a3a1c";
const WOOD_DARK = "#3a2410";
const METAL = "#8a8f96";

// Spoked wagon wheel — the quintessential frontier wall piece.
function WagonWheel({ r = 0.62 }: { r?: number }) {
  const spokes = 8;
  return (
    <group>
      <mesh><torusGeometry args={[r, r * 0.06, 8, 30]} /><meshStandardMaterial color={WOOD} roughness={0.8} /></mesh>
      <mesh><torusGeometry args={[r * 0.62, r * 0.05, 8, 26]} /><meshStandardMaterial color={WOOD} roughness={0.8} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[r * 0.13, r * 0.13, 0.1, 12]} /><meshStandardMaterial color={WOOD_DARK} roughness={0.7} /></mesh>
      {Array.from({ length: spokes }).map((_, i) => (
        <mesh key={i} rotation={[0, 0, (Math.PI / spokes) * i]}>
          <boxGeometry args={[r * 0.045, r * 1.2, 0.03]} />
          <meshStandardMaterial color={WOOD} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// A hung horseshoe (open end pointing down, "for luck").
function Horseshoe({ s = 0.22 }: { s?: number }) {
  return (
    <mesh rotation={[0, 0, Math.PI * 1.28]}>
      <torusGeometry args={[s, s * 0.16, 8, 22, Math.PI * 1.45]} />
      <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.4} />
    </mesh>
  );
}

// A single rifle lying along local +Y (barrel up), for the crossed-rifles trophy.
function Rifle() {
  return (
    <group>
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.022, 0.022, 1.15, 10]} /><meshStandardMaterial color="#2b2b2e" metalness={0.7} roughness={0.35} /></mesh>
      <mesh position={[0, -0.02, 0]}><boxGeometry args={[0.06, 0.36, 0.05]} /><meshStandardMaterial color={WOOD} roughness={0.8} /></mesh>
      <mesh position={[0, -0.46, 0]} rotation={[0, 0, 0.16]}><boxGeometry args={[0.1, 0.42, 0.07]} /><meshStandardMaterial color={WOOD_DARK} roughness={0.8} /></mesh>
    </group>
  );
}

// Two rifles crossed — a fitting emblem for a game of gunfights.
function CrossedRifles() {
  return (
    <group>
      <group rotation={[0, 0, 0.5]}><Rifle /></group>
      <group rotation={[0, 0, -0.5]}><Rifle /></group>
    </group>
  );
}

// A wall-mounted oil lamp that also casts a warm pool of light on a side wall.
function WallSconce({ felt }: { felt: number }) {
  return (
    <group>
      <mesh position={[0, -0.02, 0.06]}><boxGeometry args={[0.1, 0.18, 0.1]} /><meshStandardMaterial color="#1a1a1a" metalness={0.5} roughness={0.6} /></mesh>
      <mesh position={[0, 0.13, 0.08]}><sphereGeometry args={[0.09, 14, 14]} /><meshStandardMaterial color="#fff2d0" emissive="#ffcf8f" emissiveIntensity={2.2} /></mesh>
      <pointLight position={[0, 0.13, 0.35]} color="#ffcf8f" intensity={7} distance={felt * 3} decay={2} />
    </group>
  );
}

// A short liquor bottle (glass body + neck), colour varied by index.
function Bottle({ position, tint }: { position: [number, number, number]; tint: string }) {
  return (
    <group position={position}>
      <mesh><cylinderGeometry args={[0.045, 0.045, 0.2, 10]} /><meshStandardMaterial color={tint} roughness={0.25} metalness={0.1} transparent opacity={0.85} /></mesh>
      <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.018, 0.03, 0.1, 8]} /><meshStandardMaterial color={tint} roughness={0.25} /></mesh>
    </group>
  );
}

// A corner bar: a plank counter with a bottle row plus a wall shelf behind it.
function Bar({ floorY, len = 2.6 }: { floorY: number; len?: number }) {
  const tints = ["#3e6b3a", "#7a4a1c", "#5a7a86", "#6b3030", "#3e6b3a", "#7a4a1c"];
  const bottleZ = Array.from({ length: 6 }).map((_, i) => -len / 2 + 0.3 + (i * (len - 0.6)) / 5);
  return (
    <group position={[0, floorY, 0]}>
      {/* counter body + top */}
      <mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[0.6, 1.0, len]} /><meshStandardMaterial color={WOOD_DARK} roughness={0.85} /></mesh>
      <mesh position={[0, 1.02, 0]}><boxGeometry args={[0.72, 0.06, len + 0.12]} /><meshStandardMaterial color={WOOD} roughness={0.7} /></mesh>
      {/* bottles on the counter */}
      {bottleZ.map((z, i) => (<Bottle key={i} position={[0.05, 1.15, z]} tint={tints[i]} />))}
      {/* back shelf against the wall + its bottles */}
      <mesh position={[-0.42, 1.55, 0]}><boxGeometry args={[0.18, 0.05, len * 0.85]} /><meshStandardMaterial color={WOOD} roughness={0.8} /></mesh>
      {bottleZ.filter((_, i) => i % 2 === 0).map((z, i) => (<Bottle key={i} position={[-0.42, 1.68, z]} tint={tints[(i * 2 + 1) % tints.length]} />))}
    </group>
  );
}

// An upright saloon piano for a back corner.
function Piano({ floorY }: { floorY: number }) {
  const keys = 14;
  return (
    <group position={[0, floorY, 0]}>
      <mesh position={[0, 0.62, 0]} castShadow><boxGeometry args={[1.5, 1.24, 0.5]} /><meshStandardMaterial color={WOOD_DARK} roughness={0.5} metalness={0.1} /></mesh>
      <mesh position={[0, 1.28, 0.02]}><boxGeometry args={[1.6, 0.1, 0.62]} /><meshStandardMaterial color="#2a1a0e" roughness={0.4} /></mesh>
      {/* upper front panel + keyboard shelf */}
      <mesh position={[0, 0.82, 0.27]}><boxGeometry args={[1.3, 0.5, 0.04]} /><meshStandardMaterial color="#221208" roughness={0.5} /></mesh>
      <mesh position={[0, 0.55, 0.3]} rotation={[-0.25, 0, 0]}><boxGeometry args={[1.3, 0.16, 0.06]} /><meshStandardMaterial color="#f2ead6" roughness={0.4} /></mesh>
      {/* a few black keys hinted as dark ticks */}
      {Array.from({ length: keys }).map((_, i) => (
        <mesh key={i} position={[-0.6 + (i * 1.2) / (keys - 1), 0.585, 0.33]} rotation={[-0.25, 0, 0]}>
          <boxGeometry args={[0.04, 0.09, 0.02]} /><meshStandardMaterial color="#1a1a1a" />
        </mesh>
      ))}
      {/* stool */}
      <mesh position={[0, 0.34, 0.75]} castShadow><boxGeometry args={[0.6, 0.08, 0.3]} /><meshStandardMaterial color={WOOD} roughness={0.8} /></mesh>
    </group>
  );
}

// Swinging batwing doors in a wooden frame — the saloon entrance.
function BatwingDoors() {
  return (
    <group>
      {/* frame */}
      <mesh position={[-0.52, 0.95, 0]}><boxGeometry args={[0.12, 1.9, 0.16]} /><meshStandardMaterial color={WOOD} roughness={0.8} /></mesh>
      <mesh position={[0.52, 0.95, 0]}><boxGeometry args={[0.12, 1.9, 0.16]} /><meshStandardMaterial color={WOOD} roughness={0.8} /></mesh>
      <mesh position={[0, 1.92, 0]}><boxGeometry args={[1.2, 0.14, 0.16]} /><meshStandardMaterial color={WOOD} roughness={0.8} /></mesh>
      {/* dark night-time opening behind the doors */}
      <mesh position={[0, 0.95, -0.06]}><planeGeometry args={[0.94, 1.8]} /><meshStandardMaterial color="#1b1206" /></mesh>
      {/* two half-height swinging doors */}
      {[-0.235, 0.235].map((x, i) => (
        <group key={i} position={[x, 0.9, 0.03]}>
          <mesh><boxGeometry args={[0.42, 0.95, 0.05]} /><meshStandardMaterial color="#6b4526" roughness={0.85} /></mesh>
          {[-0.28, 0, 0.28].map((y, j) => (
            <mesh key={j} position={[0, y, 0.03]}><boxGeometry args={[0.38, 0.06, 0.02]} /><meshStandardMaterial color={WOOD_DARK} roughness={0.8} /></mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// Real Ronaldo photo, if present. Drop a file at public/ronaldo.jpg (same-origin,
// no CORS issues) OR set RONALDO_IMG to any CORS-enabled URL. Falls back to the
// canvas poster above when the image is missing or fails to load.
const RONALDO_IMG = "/ronaldo.jpg";
function useImageTexture(url: string) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    let loaded: THREE.Texture | null = null;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (t) => { loaded = t; if (alive) setTex(t); else t.dispose(); },
      undefined,
      () => { if (alive) setTex(null); } // missing/blocked → keep fallback
    );
    return () => { alive = false; loaded?.dispose(); };
  }, [url]);
  return tex;
}

// A simple saguaro cactus (trunk + two arms).
function Cactus({ position }: { position: [number, number, number] }) {
  const mat = <meshStandardMaterial color="#3f7a3a" roughness={0.9} />;
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.7, 0]}>
        <capsuleGeometry args={[0.16, 1.2, 6, 12]} />
        {mat}
      </mesh>
      <mesh castShadow position={[0.28, 0.85, 0]} rotation={[0, 0, -0.5]}>
        <capsuleGeometry args={[0.08, 0.5, 6, 12]} />
        {mat}
      </mesh>
      <mesh castShadow position={[-0.28, 1.05, 0]} rotation={[0, 0, 0.5]}>
        <capsuleGeometry args={[0.08, 0.5, 6, 12]} />
        {mat}
      </mesh>
    </group>
  );
}

// A rustic barrel: body + darker metal hoops. Placed as background props.
function Barrel({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.32, 0.28, 0.9, 20]} />
        <meshStandardMaterial color="#5a3a1c" roughness={0.9} />
      </mesh>
      {[-0.28, 0, 0.28].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <cylinderGeometry args={[0.335, 0.335, 0.06, 20]} />
          <meshStandardMaterial color="#2c1c0e" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// Western saloon shell: plank floor, warm wood walls, a hanging lamp over the
// table, and a few barrels in the background. Sizes scale with the table.
function Saloon({ felt }: { felt: number }) {
  const floorTex = useMemo(plankTexture, []);
  const posterTex = useMemo(posterTexture, []);
  const ronaldoTex = useMemo(ronaldoTexture, []);
  const signTex = useMemo(signTexture, []);
  const ronaldoImg = useImageTexture(RONALDO_IMG); // real photo if available
  // Free the canvas-backed textures when the scene unmounts (r3f doesn't).
  useEffect(
    () => () => [floorTex, posterTex, ronaldoTex, signTex].forEach((t) => t.dispose()),
    [floorTex, posterTex, ronaldoTex, signTex]
  );
  const roomW = felt * 6.5;
  const roomH = 7;
  const floorY = FLOOR_Y;
  const wall = roomW / 2 - 0.05; // inner wall distance from centre
  const barrelR = felt * 2.3;
  const barrels: [number, number, number][] = [
    [Math.cos(2.1) * barrelR, floorY + 0.45, Math.sin(2.1) * barrelR],
    [Math.cos(4.2) * barrelR, floorY + 0.45, Math.sin(4.2) * barrelR],
    [Math.cos(5.4) * barrelR, floorY + 0.45, Math.sin(5.4) * barrelR],
  ];
  return (
    <group>
      {/* room walls + ceiling (we're inside the box) */}
      <mesh position={[0, floorY + roomH / 2, 0]}>
        <boxGeometry args={[roomW, roomH, roomW]} />
        <meshStandardMaterial color="#6b4a2c" side={THREE.BackSide} roughness={1} />
      </mesh>
      {/* plank floor just above the box bottom */}
      <mesh position={[0, floorY + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[roomW, roomW]} />
        <meshStandardMaterial map={floorTex} roughness={1} />
      </mesh>
      {/* WANTED posters spread wide on the back wall, lowered to eye level */}
      {[-wall * 0.62, wall * 0.62].map((x, i) => (
        <mesh key={i} position={[x, floorY + 1.9, -wall + 0.02]}>
          <planeGeometry args={[1, 1.4]} />
          <meshStandardMaterial map={posterTex} roughness={1} />
        </mesh>
      ))}
      {/* Ronaldo poster, centred (real photo if public/ronaldo.jpg exists,
          otherwise the drawn tribute) */}
      <mesh position={[0, floorY + 1.95, -wall + 0.02]}>
        <planeGeometry args={[1.15, 1.6]} />
        <meshStandardMaterial map={ronaldoImg ?? ronaldoTex} roughness={1} />
      </mesh>
      {/* ── wall decor ─────────────────────────────────────────────── */}
      {/* back wall: carved SALOON sign above the posters + lucky horseshoes */}
      <mesh position={[0, floorY + 3.5, -wall + 0.03]}>
        <planeGeometry args={[2.6, 0.76]} />
        <meshStandardMaterial map={signTex} roughness={0.9} />
      </mesh>
      {[-wall * 0.5, wall * 0.5].map((x, i) => (
        <group key={i} position={[x, floorY + 3.25, -wall + 0.06]}>
          <Horseshoe />
        </group>
      ))}
      {/* left wall: wagon wheel + a lamp sconce; batwing entrance toward the front */}
      <group position={[-wall + 0.07, floorY + 2.2, -felt * 0.3]} rotation={[0, Math.PI / 2, 0]}>
        <WagonWheel />
      </group>
      <group position={[-wall + 0.07, floorY + 1.9, felt * 1.15]} rotation={[0, Math.PI / 2, 0]}>
        <WallSconce felt={felt} />
      </group>
      <group position={[-wall + 0.1, floorY, felt * 1.7]} rotation={[0, Math.PI / 2, 0]}>
        <BatwingDoors />
      </group>
      {/* right wall: crossed rifles + a lamp sconce */}
      <group position={[wall - 0.07, floorY + 2.2, -felt * 0.3]} rotation={[0, -Math.PI / 2, 0]}>
        <CrossedRifles />
      </group>
      <group position={[wall - 0.07, floorY + 1.9, felt * 1.15]} rotation={[0, -Math.PI / 2, 0]}>
        <WallSconce felt={felt} />
      </group>
      {/* corners: a bar along the back-left wall, an upright piano back-right */}
      <group position={[-wall + 0.45, 0, -felt * 1.4]}>
        <Bar floorY={floorY} len={felt * 1.5} />
      </group>
      <group position={[felt * 1.8, 0, -wall + 0.45]}>
        <Piano floorY={floorY} />
      </group>

      {/* sheriff star painted on the felt (large, subtle, behind the piles) */}
      <SheriffStar radius={felt * 0.42} y={0.04} color="#b8912f" opacity={0.4} />
      {barrels.map((p, i) => (
        <Barrel key={i} position={p} />
      ))}
      <Cactus position={[Math.cos(3.5) * barrelR, floorY, Math.sin(3.5) * barrelR]} />
      <Cactus position={[Math.cos(0.9) * barrelR * 1.1, floorY, Math.sin(0.9) * barrelR * 1.1]} />
    </group>
  );
}

// A five-pointed sheriff star as a flat emblem (built from ten triangles).
function SheriffStar({ radius, y, color, opacity = 1 }: { radius: number; y: number; color: string; opacity?: number }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    const spikes = 5;
    const inner = radius * 0.42;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? radius : inner;
      const a = (Math.PI / spikes) * i - Math.PI / 2;
      const x = Math.cos(a) * r;
      const yy = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, yy);
      else shape.lineTo(x, yy);
    }
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [radius]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.6} metalness={0.3} />
    </mesh>
  );
}

// Layout scales with the number of opponents so a 7-player table isn't cramped.
function layout(nOpp: number) {
  const ring = 1.4 + 0.13 * nOpp; // radius of the opponent circle
  const felt = ring + 0.5; // felt top radius
  // Arc widens with player count so a full table wraps evenly around the felt
  // instead of bunching on the far side (up to ~270° for 6 opponents).
  const arc = Math.min(1.5, 0.6 + 0.15 * nOpp) * Math.PI;
  // Frame the camera relative to the table size so the whole table reads the same
  // way for any player count: a 3/4 "seated" view, table filling the width.
  const d = felt * 1.95;
  const camY = d * 0.6; // ~37° above horizon
  const camZ = d * 0.8;
  const fov = 55;
  return { ring, felt, arc, camY, camZ, fov };
}

function Table({ felt }: { felt: number }) {
  const bodyR = felt + 0.12;
  const legR = bodyR * 0.72;
  const legs: [number, number][] = [
    [legR, legR],
    [legR, -legR],
    [-legR, legR],
    [-legR, -legR],
  ];
  return (
    <group>
      {/* wooden table body — top surface at y=0 */}
      <mesh position={[0, -0.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[bodyR, bodyR * 0.94, 0.4, 64]} />
        <meshStandardMaterial color="#5a3312" roughness={0.75} />
      </mesh>
      {/* green felt, lifted just above the body top to avoid z-fighting */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[felt, 72]} />
        <meshStandardMaterial color="#1f6b3a" roughness={0.95} />
      </mesh>
      {/* darker felt inner ring for depth */}
      <mesh position={[0, 0.031, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[felt * 0.62, felt * 0.66, 72]} />
        <meshStandardMaterial color="#185c31" roughness={1} />
      </mesh>
      {/* legs */}
      {legs.map(([x, z], i) => (
        <mesh key={i} position={[x, -0.95, z]} castShadow>
          <cylinderGeometry args={[0.1, 0.08, 1.3, 16]} />
          <meshStandardMaterial color="#3f2410" roughness={0.85} />
        </mesh>
      ))}
      {/* wooden floor */}
      <mesh position={[0, -1.55, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#241d18" roughness={1} />
      </mesh>
    </group>
  );
}

function Nameplate({ p, position, onClick }: { p: PlayerPublic; position?: [number, number, number]; onClick?: () => void }) {
  return (
    <Html center position={position} distanceFactor={6} style={{ pointerEvents: onClick ? "auto" : "none" }}>
      <div
        onClick={onClick}
        title={onClick ? "Xem thông tin" : undefined}
        style={{
          whiteSpace: "nowrap",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#fff",
          textShadow: "0 1px 3px #000",
          cursor: onClick ? "pointer" : "default",
          userSelect: "none",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          {p.isTurn ? "▶ " : ""}
          {p.role ? ROLE_EMOJI[p.role] + " " : ""}
          {p.name}
        </div>
        <div style={{ fontSize: 14 }}>
          {"❤️".repeat(Math.max(0, p.hp))}
          <span style={{ opacity: 0.35 }}>{"🤍".repeat(Math.max(0, p.maxHp - p.hp))}</span>
        </div>
        {p.character && <div style={{ fontSize: 11, opacity: 0.85 }}>{p.character.name}</div>}
      </div>
    </Html>
  );
}

// A face-down mini fan showing how many cards an opponent holds.
function OpponentHand({ count }: { count: number }) {
  const n = Math.min(count, 6);
  return (
    <group>
      {Array.from({ length: n }).map((_, i) => {
        const off = (i - (n - 1) / 2) * 0.12;
        return (
          <CardMesh
            key={i}
            faceDown
            scale={0.5}
            /* lie flat, clearly above the felt so no part sinks below and gets clipped */
            position={[off, 0.08 + i * 0.004, -0.1]}
            rotation={[-Math.PI / 2, 0, off * 0.25]}
          />
        );
      })}
    </group>
  );
}

// Distinct shirt colors so seated players read apart.
const AVATAR_COLORS = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085", "#c39bd3"];

// Floor level (matches the Saloon shell). Avatars/tombstones are placed with
// their group origin at the table top (y=0), so the body must reach down to here.
const FLOOR_Y = -1.55;

// A low-poly seated cowboy: torso + head + hat. Radially symmetric, so no facing
// needed. The body reaches from the floor up past the table rim — its lower half
// is hidden behind the table edge, so it reads as "someone sitting at the table"
// instead of floating above the felt.
function Avatar({ position, color, dead, sheriff }: { position: [number, number, number]; color: string; dead?: boolean; sheriff?: boolean }) {
  const shoulderY = 0.42; // torso top, just above the table rim (y=0)
  const bodyH = shoulderY - FLOOR_Y;
  return (
    <group position={position}>
      {/* torso: a tapered column from the floor up to the shoulders */}
      <mesh position={[0, FLOOR_Y + bodyH / 2, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.36, bodyH, 20]} />
        <meshStandardMaterial color={dead ? "#4a4a4a" : color} roughness={0.75} />
      </mesh>
      <mesh position={[0, shoulderY + 0.2, 0]} castShadow>
        <sphereGeometry args={[0.15, 24, 24]} />
        <meshStandardMaterial color={dead ? "#7a7a7a" : "#e8c39a"} roughness={0.6} />
      </mesh>
      {/* cowboy hat: brim + crown */}
      <mesh position={[0, shoulderY + 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.27, 0.27, 0.02, 24]} />
        <meshStandardMaterial color="#6b4a24" roughness={0.85} />
      </mesh>
      <mesh position={[0, shoulderY + 0.36, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.16, 0.14, 24]} />
        <meshStandardMaterial color="#5a3a1c" roughness={0.85} />
      </mesh>
      {/* Sheriff badge: a gold star pinned on top of the hat */}
      {sheriff && <SheriffStar radius={0.1} y={shoulderY + 0.45} color="#f5c518" />}
    </group>
  );
}

// A stone grave marker shown at an eliminated player's seat, with a carved cross.
function Tombstone({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* mound base */}
      <mesh position={[0, 0.05, 0.02]} castShadow receiveShadow>
        <boxGeometry args={[0.46, 0.1, 0.22]} />
        <meshStandardMaterial color="#4f4a45" roughness={1} />
      </mesh>
      {/* slab */}
      <mesh position={[0, 0.34, 0]} castShadow>
        <boxGeometry args={[0.34, 0.5, 0.09]} />
        <meshStandardMaterial color="#8d8880" roughness={0.95} />
      </mesh>
      {/* rounded top */}
      <mesh position={[0, 0.59, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.17, 0.09, 20]} />
        <meshStandardMaterial color="#8d8880" roughness={0.95} />
      </mesh>
      {/* carved cross (R.I.P.) */}
      <mesh position={[0, 0.44, 0.05]}>
        <boxGeometry args={[0.05, 0.22, 0.02]} />
        <meshStandardMaterial color="#5b564f" roughness={1} />
      </mesh>
      <mesh position={[0, 0.5, 0.05]}>
        <boxGeometry args={[0.17, 0.05, 0.02]} />
        <meshStandardMaterial color="#5b564f" roughness={1} />
      </mesh>
    </group>
  );
}

// A large arrow bobbing above whoever's turn it is, pointing down at them.
function TurnArrow({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    if (ref.current) ref.current.position.y = position[1] + Math.abs(Math.sin(t.current * 3)) * 0.28;
  });
  const mat = <meshStandardMaterial color="#ffcf3a" emissive="#ff9500" emissiveIntensity={0.9} roughness={0.4} />;
  return (
    <group ref={ref} position={position}>
      {/* shaft */}
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.32, 16]} />
        {mat}
      </mesh>
      {/* head pointing straight down */}
      <mesh position={[0, -0.02, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.2, 0.3, 20]} />
        {mat}
      </mesh>
    </group>
  );
}

// Blue "in play" cards (guns, Barrel, Scope, Jail…) laid face-up on the felt in
// front of a seat, upright toward the camera so the whole table can read them.
function FeltCards({ cards, ang, radius, onInspect, color, pickable, onPickCard }: { cards: Card[]; ang: number; radius: number; onInspect?: (c: Card) => void; color?: string; pickable?: boolean; onPickCard?: (cardId: string) => void }) {
  if (!cards.length) return null;
  const cx = radius * Math.cos(ang);
  const cz = radius * Math.sin(ang);
  const gap = 0.38;
  // Orient the row so each card's long axis points toward the table centre
  // (portrait, facing the seat) and cards spread tangentially.
  return (
    <group position={[cx, 0, cz]} rotation={[0, Math.PI / 2 - ang, 0]}>
      {cards.map((c, i) => {
        const o = (i - (cards.length - 1) / 2) * gap;
        const def = CARD_DEF_BY_ID[c.defId];
        // Icon only, plus a number for guns / range modifiers (no card name).
        const suffix =
          def?.kind === "gun" && def.range
            ? `${def.range}`
            : c.defId === "scope"
            ? "−1"
            : c.defId === "mustang"
            ? "+1"
            : "";
        return (
          <group key={c.id} position={[o, 0, 0]}>
            <CardMesh card={c} scale={0.46} position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]} />
            {/* a scope over each selectable card so it's easy to pick (Cat Balou / Panic) */}
            {pickable && (
              <Html center position={[0, 0.3, 0]} distanceFactor={7} style={{ pointerEvents: "auto" }} zIndexRange={[46, 36]}>
                <div
                  onClick={() => onPickCard?.(c.id)}
                  title="Chọn lá này"
                  style={{ cursor: "pointer", filter: "drop-shadow(0 0 6px #33d17a)" }}
                >
                  <svg viewBox="0 0 100 100" width={42} height={42}>
                    <circle cx="50" cy="50" r="34" fill="rgba(51,209,122,0.18)" stroke="#33d17a" strokeWidth="8" />
                    <line x1="50" y1="8" x2="50" y2="28" stroke="#33d17a" strokeWidth="8" strokeLinecap="round" />
                    <line x1="50" y1="72" x2="50" y2="92" stroke="#33d17a" strokeWidth="8" strokeLinecap="round" />
                    <line x1="8" y1="50" x2="28" y2="50" stroke="#33d17a" strokeWidth="8" strokeLinecap="round" />
                    <line x1="72" y1="50" x2="92" y2="50" stroke="#33d17a" strokeWidth="8" strokeLinecap="round" />
                    <circle cx="50" cy="50" r="6" fill="#33d17a" />
                  </svg>
                </div>
              </Html>
            )}
            {/* icon badge above the card; tap to see the full card + effect */}
            <Html center position={[0, 0.14, -0.28]} distanceFactor={9} style={{ pointerEvents: "auto" }}>
              <div
                title={pickable ? "Chọn lá này" : def?.effect}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onClick={() => (pickable && onPickCard ? onPickCard(c.id) : onInspect?.(c))}
                style={{
                  whiteSpace: "nowrap",
                  fontFamily: "system-ui, sans-serif",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#fff",
                  background: pickable ? "rgba(20,110,50,0.9)" : "rgba(20,18,16,0.85)",
                  border: `2px solid ${pickable ? "#33d17a" : color ?? "rgba(240,226,192,0.5)"}`,
                  boxShadow: pickable ? "0 0 8px #33d17a" : undefined,
                  padding: "0 5px",
                  borderRadius: 7,
                  textShadow: "0 1px 2px #000",
                  cursor: "pointer",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                }}
              >
                {def?.kind === "gun" && CARD_IMAGE[c.defId] ? (
                  // Guns: show the rifle art (range baked in) instead of the 🔫
                  // emoji, which renders as a green water-pistol on many platforms.
                  <img src={CARD_IMAGE[c.defId]} alt="" width={32} height={26} draggable={false} style={{ display: "block" }} />
                ) : (
                  <>
                    {CARD_ICON[c.defId] ?? "🔵"}
                    {suffix && <span style={{ fontSize: 10, fontWeight: 800, marginLeft: 2 }}>{suffix}</span>}
                  </>
                )}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

// A crosshair "scope" floating over a valid Bang! target. Green = available,
// yellow when hovered. Click to pick this player.
function TargetMarker({ position, onClick }: { position: [number, number, number]; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const col = hover ? "#ffd24a" : "#33d17a";
  return (
    <Html center position={position} distanceFactor={6} style={{ pointerEvents: "auto" }} zIndexRange={[40, 30]}>
      <div
        onClick={onClick}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        style={{ cursor: "pointer", filter: `drop-shadow(0 0 6px ${col})` }}
        title="Bắn mục tiêu này"
      >
        <svg viewBox="0 0 100 100" width={hover ? 66 : 58} height={hover ? 66 : 58}>
          <circle cx="50" cy="50" r="34" fill={hover ? "rgba(255,210,74,0.18)" : "rgba(51,209,122,0.12)"} stroke={col} strokeWidth="7" />
          <line x1="50" y1="6" x2="50" y2="26" stroke={col} strokeWidth="7" strokeLinecap="round" />
          <line x1="50" y1="74" x2="50" y2="94" stroke={col} strokeWidth="7" strokeLinecap="round" />
          <line x1="6" y1="50" x2="26" y2="50" stroke={col} strokeWidth="7" strokeLinecap="round" />
          <line x1="74" y1="50" x2="94" y2="50" stroke={col} strokeWidth="7" strokeLinecap="round" />
          <circle cx="50" cy="50" r="6" fill={col} />
        </svg>
      </div>
    </Html>
  );
}

function Opponents({
  players,
  youSeat,
  ring,
  felt,
  arc,
  targetIds,
  onPickTarget,
  onInspect,
  onInspectPlayer,
  pickCardMode,
  onPickCard,
}: {
  players: PlayerPublic[];
  youSeat: number;
  ring: number;
  felt: number;
  arc: number;
  targetIds?: string[];
  onPickTarget?: (id: string) => void;
  onInspect?: (c: Card) => void;
  onInspectPlayer?: (p: PlayerPublic) => void;
  pickCardMode?: boolean;
  onPickCard?: (ownerId: string, cardId: string) => void;
}) {
  // Order opponents by turn order relative to the viewer (the player right after
  // you first) so the seating reads the same from everyone's perspective.
  const n = players.length;
  const others = players
    .filter((p) => p.seat !== youSeat)
    .sort((a, b) => ((a.seat - youSeat + n) % n) - ((b.seat - youSeat + n) % n));
  const seatR = felt + 0.2; // avatars just beyond the felt edge
  return (
    <>
      {others.map((p, i) => {
        // Spread across the far arc (centered straight ahead, away from the camera).
        const t = others.length === 1 ? 0.5 : i / (others.length - 1);
        const ang = 1.5 * Math.PI - arc / 2 + arc * t;
        const x = ring * Math.cos(ang);
        const z = ring * Math.sin(ang);
        const ax = seatR * Math.cos(ang);
        const az = seatR * Math.sin(ang);
        const targetable = !!targetIds?.includes(p.id);
        return (
          <group key={p.id}>
            <group position={[x, 0.05, z]} rotation={[0, -ang - Math.PI / 2, 0]}>
              <OpponentHand count={p.handCount} />
            </group>
            {p.alive && p.isTurn && <TurnArrow position={[ax, 1.75, az]} />}
            {p.alive ? (
              <Avatar position={[ax, 0, az]} color={AVATAR_COLORS[i % AVATAR_COLORS.length]} dead={false} sheriff={p.role === "sheriff"} />
            ) : (
              <Tombstone position={[ax, FLOOR_Y, az]} />
            )}
            {/* name / hp / character floating above the avatar's head */}
            <Nameplate p={p} position={[ax, 1.35, az]} onClick={onInspectPlayer ? () => onInspectPlayer(p) : undefined} />
            <FeltCards cards={p.equipment} ang={ang} radius={ring * 0.92} onInspect={onInspect} color={AVATAR_COLORS[i % AVATAR_COLORS.length]} pickable={!!pickCardMode && targetable} onPickCard={(cid) => onPickCard?.(p.id, cid)} />
            {targetable && onPickTarget && (
              <TargetMarker position={[ax, 1.6, az]} onClick={() => onPickTarget(p.id)} />
            )}
          </group>
        );
      })}
    </>
  );
}

// Draw pile + discard pile in the middle of the table. The top discarded card
// is shown face-up so the centre reads as an active play area.
function CenterPiles({ deckCount, discardCount, topDiscard }: { deckCount: number; discardCount: number; topDiscard: Card | null }) {
  const stack = Math.min(Math.max(deckCount, 1), 6);
  const label = (text: string) => (
    <Html center position={[0, 0.25, 0.55]} distanceFactor={6} style={{ pointerEvents: "none" }}>
      <div style={{ color: "#f0e2c0", fontWeight: 700, fontSize: 15, textShadow: "0 1px 3px #000", whiteSpace: "nowrap" }}>{text}</div>
    </Html>
  );
  return (
    <group position={[0, 0.05, 0]}>
      <group position={[-0.45, 0, 0]}>
        {Array.from({ length: stack }).map((_, i) => (
          <CardMesh key={i} faceDown scale={0.72} position={[0, i * 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} />
        ))}
        {label(`🂠 ${deckCount}`)}
      </group>
      <group position={[0.45, 0, 0]}>
        {topDiscard ? (
          <CardMesh card={topDiscard} scale={0.72} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0.2]} />
        ) : (
          discardCount > 0 && <CardMesh faceDown scale={0.72} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0.25]} />
        )}
        {label(`🗑️ ${discardCount}`)}
      </group>
    </group>
  );
}

// A single card animating from the draw pile at table centre toward "you" (the
// camera), arcing up and turning face-up along the way — the "rút bài kéo về
// phía mình" effect. Removes itself once it reaches the near edge.
function DrawFlight({
  card,
  delay,
  felt,
  camY,
  camZ,
  onDone,
}: {
  card: Card;
  delay: number;
  felt: number;
  camY: number;
  camZ: number;
  onDone: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const t = useRef(-delay); // stagger multiple cards drawn in the same turn
  const DUR = 0.7;
  // Deck top (matches CenterPiles: group y=0.05 + draw-pile x=-0.45).
  const from = useMemo(() => new THREE.Vector3(-0.45, 0.15, 0), []);
  // Arc apex, lifted high over the felt on the way toward the camera.
  const mid = useMemo(() => new THREE.Vector3(-0.2, felt * 0.9, felt * 0.5), [felt]);
  // Near the camera, low and forward, so it reads as arriving in your hand.
  const to = useMemo(() => new THREE.Vector3(0, camY * 0.42, camZ * 0.72), [camY, camZ]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    t.current += dt;
    if (t.current < 0) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const p = Math.min(t.current / DUR, 1);
    const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
    // Quadratic Bézier from → mid → to.
    const u = 1 - e;
    g.position.set(
      u * u * from.x + 2 * u * e * mid.x + e * e * to.x,
      u * u * from.y + 2 * u * e * mid.y + e * e * to.y,
      u * u * from.z + 2 * u * e * mid.z + e * e * to.z
    );
    // Lie flat on the deck → stand up facing the camera, with a little spin.
    g.rotation.x = -Math.PI / 2 + (Math.PI / 2 - 0.35) * e;
    g.rotation.z = Math.sin(e * Math.PI) * 0.5;
    const s = 0.72 * (0.7 + 0.7 * e);
    g.scale.setScalar(s);
    // Fade out over the last stretch as it "tucks" into the hand.
    const opacity = p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m) {
        m.transparent = true;
        m.opacity = opacity;
      }
    });
    if (p >= 1) onDone();
  });

  return (
    <group ref={group} visible={false}>
      <CardMesh card={card} />
    </group>
  );
}

// Watches your hand and launches a DrawFlight for each newly-added card, so
// drawn cards visibly travel from the deck toward you instead of just popping in.
function FlyingCards({ hand, felt, camY, camZ }: { hand: Card[]; felt: number; camY: number; camZ: number }) {
  const [flights, setFlights] = useState<{ key: string; card: Card; delay: number }[]>([]);
  const prev = useRef<string[]>(hand.map((c) => c.id));
  const primed = useRef(false);

  useEffect(() => {
    const ids = hand.map((c) => c.id);
    if (!primed.current) {
      // Skip the initial mount (entering 3D) so the whole hand doesn't fly in.
      primed.current = true;
      prev.current = ids;
      return;
    }
    const added = hand.filter((c) => !prev.current.includes(c.id));
    prev.current = ids;
    if (added.length) {
      setFlights((f) => [
        ...f,
        ...added.map((c, i) => ({ key: `${c.id}-${i}`, card: c, delay: i * 0.14 })),
      ]);
    }
  }, [hand]);

  const done = (key: string) => setFlights((f) => f.filter((x) => x.key !== key));

  return (
    <>
      {flights.map((fl) => (
        <DrawFlight
          key={fl.key}
          card={fl.card}
          delay={fl.delay}
          felt={felt}
          camY={camY}
          camZ={camZ}
          onDone={() => done(fl.key)}
        />
      ))}
    </>
  );
}

// A dramatic Draw!-check reveal for ANY check (Dynamite / Jail / Barrel /
// Black Jack / Lucky Duke), staged over the centre of the table: the drawn card
// rises and turns face-up with a result label, so players feel the draw. A
// Dynamite blast adds a fireball. Reacts to the newest entry in view.checks.
function CheckFx({ check, felt }: { check: CheckView | null; felt: number }) {
  const [active, setActive] = useState<{ card: Card | null; blast: boolean; kind: string; outcome: string; name: string } | null>(null);
  const lastKey = useRef<string | null>(null);
  const t = useRef(0);
  const divRef = useRef<HTMLDivElement>(null);
  const blastRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const cy = 0.3 + felt * 0.32; // stage height above the felt (lowered toward table centre)

  useEffect(() => {
    if (!check) return;
    const key = check.card?.id ?? `${check.name}-${check.kind}-${check.outcome}`;
    if (key === lastKey.current) return; // already showed this reveal
    lastKey.current = key;
    t.current = 0;
    setActive({ card: check.card, blast: check.kind === "dynamite" && check.outcome === "blast", kind: check.kind, outcome: check.outcome, name: check.name });
  }, [check]);

  const HOLD_END = 4.6; // stay fully visible until here…
  const DUR = 5.0; // …then fade out by 5s (or dismiss early via the Skip button)
  const dismiss = () => {
    if (lightRef.current) lightRef.current.intensity = 0;
    setActive(null);
  };
  useFrame((_, dt) => {
    if (!active) return;
    t.current += dt;

    // Card (HTML PlayingCard): pop in over the first 0.35s, HOLD until HOLD_END,
    // then fade out over the last stretch.
    const rise = Math.min(t.current / 0.35, 1);
    const er = 1 - Math.pow(1 - rise, 3);
    if (divRef.current) {
      const op = t.current < HOLD_END ? 1 : Math.max(0, 1 - (t.current - HOLD_END) / (DUR - HOLD_END));
      divRef.current.style.opacity = String(op);
      divRef.current.style.transform = `scale(${(0.6 + er * 0.4).toFixed(3)})`;
    }

    // Blast: an expanding, fading fireball + a flash of light over a fixed window.
    if (active.blast) {
      const bp = (t.current - 0.4) / 1.4;
      const eb = 1 - Math.pow(1 - Math.min(Math.max(bp, 0), 1), 2);
      if (blastRef.current) {
        blastRef.current.visible = bp > 0 && bp < 1;
        blastRef.current.scale.setScalar(0.2 + eb * felt * 1.7);
        (blastRef.current.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 0.85 * (1 - eb));
      }
      if (lightRef.current) lightRef.current.intensity = Math.max(0, 45 * (1 - bp * 1.3));
    }

    if (t.current >= DUR) dismiss();
  });

  if (!active) return null;
  return (
    <group>
      {active.card && (
        <Html center position={[0, cy, 0]} distanceFactor={9} style={{ pointerEvents: "none" }} zIndexRange={[68, 60]}>
          <div ref={divRef} style={{ transform: "scale(0.6)", willChange: "transform, opacity" }}>
            <PlayingCard card={active.card} />
          </div>
        </Html>
      )}
      {active.blast && (
        <>
          <mesh ref={blastRef} position={[0, cy, 0]} visible={false}>
            <icosahedronGeometry args={[0.5, 2]} />
            <meshStandardMaterial color="#ff8a2a" emissive="#ff4400" emissiveIntensity={2.5} transparent opacity={0.85} />
          </mesh>
          <pointLight ref={lightRef} position={[0, cy, 0]} color="#ff8a2a" intensity={0} distance={felt * 9} decay={2} />
        </>
      )}
      {/* Skip button so players don't have to wait the full 5s. */}
      <Html center position={[0, Math.max(0.5, cy - 1.0), 0]} distanceFactor={7} style={{ pointerEvents: "auto" }} zIndexRange={[70, 60]}>
        <button
          onClick={dismiss}
          style={{
            cursor: "pointer",
            border: "1px solid rgba(240,226,192,0.6)",
            background: "rgba(20,18,16,0.9)",
            color: "#f0e2c0",
            fontFamily: "system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 13,
            padding: "6px 14px",
            borderRadius: 10,
            whiteSpace: "nowrap",
          }}
        >
          Bỏ qua ✕
        </button>
      </Html>
    </group>
  );
}

function Scene({ view, targetIds, onPickTarget, onInspect, onInspectPlayer, pickCardMode, onPickCard }: { view: PlayerView; targetIds?: string[]; onPickTarget?: (id: string) => void; onInspect?: (c: Card) => void; onInspectPlayer?: (p: PlayerPublic) => void; pickCardMode?: boolean; onPickCard?: (ownerId: string, cardId: string) => void }) {
  const nOpp = Math.max(1, view.players.length - 1);
  const { ring, felt, arc, camY, camZ, fov } = layout(nOpp);
  return (
    <>
      <color attach="background" args={["#3a2a1a"]} />
      <fog attach="fog" args={["#3a2a1a", felt * 3, felt * 7]} />
      <PerspectiveCamera makeDefault position={[0, camY, camZ]} fov={fov} />
      {/* Fixed camera: keep it aimed at the table, no free orbit/zoom/pan. */}
      <OrbitControls
        target={[0, 0, -felt * 0.12]}
        enableRotate={false}
        enableZoom={false}
        enablePan={false}
      />
      {/* Bright, warm room lighting. */}
      <ambientLight intensity={1.05} color="#fff2dc" />
      <hemisphereLight args={["#fff0d0", "#4a3420", 0.85]} />
      <directionalLight position={[3, 6, 4]} intensity={1.0} color="#fff3e0" />
      <Environment preset="warehouse" />
      <Saloon felt={felt} />
      <Table felt={felt} />
      <CenterPiles deckCount={view.deckCount} discardCount={view.discardCount} topDiscard={view.topDiscard} />
      <Opponents players={view.players} youSeat={view.you.seat} ring={ring} felt={felt} arc={arc} targetIds={targetIds} onPickTarget={onPickTarget} onInspect={onInspect} onInspectPlayer={onInspectPlayer} pickCardMode={pickCardMode} onPickCard={onPickCard} />
      {/* your own in-play cards, on the near edge of the felt */}
      <FeltCards cards={view.you.equipment} ang={Math.PI / 2} radius={ring * 0.72} onInspect={onInspect} />
      {/* cards drawn into your hand fly out of the deck toward you */}
      <FlyingCards hand={view.you.hand} felt={felt} camY={camY} camZ={camZ} />
      {/* Draw!-check reveal (any kind) over the table centre */}
      <CheckFx check={view.checks.at(-1) ?? null} felt={felt} />
    </>
  );
}

export default function TableScene({
  view,
  targetIds,
  onPickTarget,
  onInspect,
  onInspectPlayer,
  pickCardMode,
  onPickCard,
}: {
  view: PlayerView;
  targetIds?: string[];
  onPickTarget?: (id: string) => void;
  onInspect?: (c: Card) => void;
  onInspectPlayer?: (p: PlayerPublic) => void;
  pickCardMode?: boolean;
  onPickCard?: (ownerId: string, cardId: string) => void;
}) {
  return (
    <div style={{ width: "100%", height: "100%", background: "#141210" }}>
      <Canvas shadows dpr={[1, 2]}>
        <Scene view={view} targetIds={targetIds} onPickTarget={onPickTarget} onInspect={onInspect} onInspectPlayer={onInspectPlayer} pickCardMode={pickCardMode} onPickCard={onPickCard} />
      </Canvas>
    </div>
  );
}
