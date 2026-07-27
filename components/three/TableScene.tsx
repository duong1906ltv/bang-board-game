"use client";

// First-person 3D table for Bang!. Reads the SAME PlayerView the 2D room uses,
// so the game logic / socket layer is untouched — this is purely a render layer.
// The camera sits at "your" seat looking across a round table; your hand is
// fanned in front of you, opponents are arranged around the far arc.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Html } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { CardMesh } from "./CardMesh";
import { PlayingCard } from "@/components/PlayingCard";
import { CARD_DEF_BY_ID, CARD_ICON, type Card } from "@/lib/cards";
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

// Western saloon shell: plank floor, warm wood walls, wall decor, a bar, a
// piano, and a few barrels in the background. Sizes scale with the table.
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

// The felt surface, drawn on a canvas instead of being a flat colour. A single
// `meshStandardMaterial color` read as plastic clip-art; this bakes in the fibre
// noise, a darkened rim, the inner ring and the sheriff star so the whole surface
// is one texture (no extra ring mesh, no decal plane fighting for z).
function feltTexture(): THREE.Texture {
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

function Table({ felt }: { felt: number }) {
  const bodyR = felt + 0.12;
  const felTex = useMemo(() => feltTexture(), []);
  useEffect(() => () => felTex.dispose(), [felTex]);
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
        <circleGeometry args={[felt, 96]} />
        <meshStandardMaterial map={felTex} roughness={0.98} />
      </mesh>
      {/* padded leather rim around the felt */}
      <mesh position={[0, 0.028, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[felt * 0.965, felt, 96]} />
        <meshStandardMaterial color="#4a2c14" roughness={0.6} />
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

// ─── Webcam WANTED posters ───────────────────────────────────────────────────
//
// Where the seats sit relative to the camera decides everything here. With the
// camera pitched ~35° down and a 55° vertical fov, the top of frame at the BACK
// wall lands at y≈1.41 while avatar heads reach ~0.8 — a clear band barely half a
// unit tall, and the middle of it is screened by the figures themselves. The SIDE
// walls are closer to the camera (horizontal distance ~9.2 vs 12.3), so their top
// of frame is higher (y≈1.80), and no avatar ever reaches out to x=±wall to block
// them. So the outermost slots go on the side walls, where posters are both
// biggest and never occluded, and the middle ones fill the back wall.
const POSTER_W = 1.15;
const POSTER_H = 1.5;

// One slot: a wall position plus the yaw that turns the poster to face inward.
interface PosterSlot {
  pos: [number, number, number];
  rotY: number;
}

// Slots ordered LEFT → RIGHT as seen on screen, so slot order can be matched to
// the on-screen order of the seats and the eye can pair a poster with a person.
function posterSlots(felt: number, wall: number, floorY: number, n: number): PosterSlot[] {
  const sideY = floorY + 2.05; // side walls have headroom; sit them higher
  const backY = floorY + 1.62;
  const left: PosterSlot = { pos: [-wall + 0.06, sideY, -felt * 0.15], rotY: Math.PI / 2 };
  const right: PosterSlot = { pos: [wall - 0.06, sideY, -felt * 0.15], rotY: -Math.PI / 2 };
  const leftB: PosterSlot = { pos: [-wall + 0.06, sideY, felt * 0.95], rotY: Math.PI / 2 };
  const rightB: PosterSlot = { pos: [wall - 0.06, sideY, felt * 0.95], rotY: -Math.PI / 2 };
  // Back-wall slots spread evenly, skipping the middle where the Ronaldo poster
  // and the SALOON sign already hang.
  const backCount = Math.max(0, n - 4);
  const back: PosterSlot[] = Array.from({ length: backCount }, (_, i) => {
    const t = backCount === 1 ? 0.5 : i / (backCount - 1);
    return { pos: [(t * 2 - 1) * wall * 0.55, backY, -wall + 0.06] as [number, number, number], rotY: 0 };
  });
  // left-most first: near-left side wall, far-left side wall, back row, then right
  return [leftB, left, ...back, right, rightB].slice(0, n);
}

// A framed poster carrying one player's live webcam, with their name on a plaque
// beneath it. Flat and wall-mounted, so it faces the camera without billboarding
// and its 4:3 feed needs no square crop.
function WantedPoster({
  slot,
  stream,
  name,
  isTurn,
}: {
  slot: PosterSlot;
  stream: MediaStream;
  name: string;
  isTurn: boolean;
}) {
  const tex = useStreamTexture(stream);
  const frame = isTurn ? "#e0a955" : "#6b4a24";
  return (
    <group position={slot.pos} rotation={[0, slot.rotY, 0]}>
      {/* backing board */}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[POSTER_W + 0.14, POSTER_H + 0.42]} />
        <meshStandardMaterial color="#e8d5a8" roughness={1} />
      </mesh>
      {/* WANTED header */}
      <mesh position={[0, POSTER_H / 2 + 0.13, 0]}>
        <planeGeometry args={[POSTER_W, 0.2]} />
        <meshBasicMaterial map={wantedHeaderTex()} transparent toneMapped={false} />
      </mesh>
      {/* the live feed */}
      {tex && (
        <mesh>
          <planeGeometry args={[POSTER_W, POSTER_H]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}
      {/* frame rails around the photo — lit up while it's this player's turn */}
      {[
        [0, POSTER_H / 2, POSTER_W + 0.06, 0.05],
        [0, -POSTER_H / 2, POSTER_W + 0.06, 0.05],
      ].map(([x, y, w, h], i) => (
        <mesh key={`h${i}`} position={[x, y, 0.01]}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial color={frame} roughness={0.85} />
        </mesh>
      ))}
      {[-POSTER_W / 2, POSTER_W / 2].map((x, i) => (
        <mesh key={`v${i}`} position={[x, 0, 0.01]}>
          <planeGeometry args={[0.05, POSTER_H + 0.05]} />
          <meshStandardMaterial color={frame} roughness={0.85} />
        </mesh>
      ))}
      {/* name plaque under the photo */}
      <Html
        center
        position={[0, -POSTER_H / 2 - 0.17, 0.03]}
        distanceFactor={7}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            whiteSpace: "nowrap",
            fontFamily: "Georgia, serif",
            fontWeight: 700,
            fontSize: 17,
            letterSpacing: 0.5,
            color: "#2f1f0c",
            textTransform: "uppercase",
            userSelect: "none",
          }}
        >
          {name}
        </div>
      </Html>
    </group>
  );
}

// "WANTED" strip above each photo. Cached: one texture shared by every poster.
let wantedHeaderCache: THREE.Texture | null = null;
function wantedHeaderTex(): THREE.Texture {
  if (wantedHeaderCache) return wantedHeaderCache;
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 320, 64);
  g.fillStyle = "#2f1f0c";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "bold 44px Georgia, serif";
  g.fillText("WANTED", 160, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  wantedHeaderCache = t;
  return t;
}

// Hang one poster per player who has their camera on.
//
// Slots are assigned by SEAT, not by "index among those currently on camera" —
// otherwise every join or leave would shuffle the posters to different walls and
// you could never learn whose is whose. A player who is off camera just leaves
// their slot empty, which reads correctly: they are not on cam.
function WantedPosters({
  players,
  youSeat,
  youId,
  youName,
  feeds,
  felt,
}: {
  players: PlayerPublic[];
  youSeat: number;
  youId: string;
  youName: string;
  feeds?: Map<string, MediaStream>;
  felt: number;
}) {
  if (!feeds || feeds.size === 0) return null;
  const wall = (felt * 6.5) / 2 - 0.05;
  const n = players.length;
  // Same ordering the seats use: the player after you first, so the sequence
  // matches how the avatars read left-to-right across the arc. You are not on the
  // arc (you are the camera), so your slot goes on the near-left wall — the one
  // closest to where you sit.
  const others = players
    .filter((p) => p.seat !== youSeat)
    .sort((a, b) => ((a.seat - youSeat + n) % n) - ((b.seat - youSeat + n) % n));
  const you = players.find((p) => p.seat === youSeat);
  const ordered = [
    { id: youId, name: youName, isTurn: !!you?.isTurn },
    ...others.map((p) => ({ id: p.id, name: p.name, isTurn: p.isTurn })),
  ];
  const slots = posterSlots(felt, wall, FLOOR_Y, ordered.length);
  return (
    <>
      {ordered.map((p, i) => {
        const stream = feeds.get(p.id);
        if (!stream || !slots[i]) return null;
        return (
          <WantedPoster key={p.id} slot={slots[i]} stream={stream} name={p.name} isTurn={p.isTurn} />
        );
      })}
    </>
  );
}

// The hanging oil lamp over the table: the scene's key light. It is the one thing
// bright enough to trip Bloom's threshold, and being a point light directly above
// the felt it also gives every figure a shadow that anchors it to the table.
function TableLamp({ felt }: { felt: number }) {
  const y = 2.55;
  return (
    <group position={[0, y, 0]}>
      {/* chain up to the ceiling */}
      <mesh position={[0, 0.75, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 1.5, 6]} />
        <meshStandardMaterial color="#2b2b2e" metalness={0.6} roughness={0.5} />
      </mesh>
      {/* tin shade */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <coneGeometry args={[0.46, 0.3, 24, 1, true]} />
        <meshStandardMaterial color="#3a2a18" roughness={0.7} metalness={0.35} side={THREE.DoubleSide} />
      </mesh>
      {/* the flame globe — emissive so Bloom blooms it */}
      <mesh position={[0, -0.05, 0]}>
        <sphereGeometry args={[0.14, 18, 18]} />
        <meshStandardMaterial color="#fff6d8" emissive="#ffc873" emissiveIntensity={3.4} toneMapped={false} />
      </mesh>
      {/* Key light. `decay={1.4}` rather than a physical 2 so the far seats stay
          lit instead of falling away into the dark. */}
      <pointLight
        position={[0, -0.05, 0]}
        color="#ffd79a"
        intensity={26}
        distance={felt * 5}
        decay={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0012}
      />
    </group>
  );
}

function Nameplate({ p, position, onClick }: { p: PlayerPublic; position?: [number, number, number]; onClick?: () => void }) {
  return (
    <Html center position={position} distanceFactor={6} style={{ pointerEvents: onClick ? "auto" : "none" }}>
      <div
        onClick={onClick}
        title={onClick ? "Xem thông tin" : undefined}
        /* A solid plaque, not bare white text. Floating unbacked text read as
           unanchored and collided illegibly with the wall posters behind it. */
        style={{
          whiteSpace: "nowrap",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#f4e9d6",
          cursor: onClick ? "pointer" : "default",
          userSelect: "none",
          padding: "5px 11px 6px",
          borderRadius: 9,
          background: "rgba(24,18,12,0.82)",
          border: `1px solid ${p.isTurn ? "#e0a955" : "rgba(120,95,60,0.75)"}`,
          boxShadow: p.isTurn
            ? "0 0 0 2px rgba(224,169,85,0.25), 0 3px 10px rgba(0,0,0,0.5)"
            : "0 3px 10px rgba(0,0,0,0.5)",
          backdropFilter: "blur(2px)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
          {p.isTurn ? "▶ " : ""}
          {p.role ? ROLE_EMOJI[p.role] + " " : ""}
          {p.name}
        </div>
        <div style={{ fontSize: 12, letterSpacing: -1, marginTop: 1 }}>
          {"❤️".repeat(Math.max(0, p.hp))}
          <span style={{ opacity: 0.3 }}>{"🤍".repeat(Math.max(0, p.maxHp - p.hp))}</span>
        </div>
        {p.character && (
          <div style={{ fontSize: 10, opacity: 0.75, marginTop: 1 }}>{p.character.name}</div>
        )}
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
// Turn a live MediaStream into a texture we can paint on a mesh.
//
// The stream is already being decoded by VideoChat's own <video> tiles, but a
// THREE.VideoTexture needs an element of its own. Two things are load-bearing:
//  - `muted`: the audio is already playing through VideoChat's tile, and an
//    unmuted element here would double every voice (and block autoplay).
//  - the element must live in the document: iOS/Safari refuses to decode a
//    detached <video>, which would leave the face plate permanently black.
function useStreamTexture(stream: MediaStream | null | undefined): THREE.VideoTexture | null {
  const [tex, setTex] = useState<THREE.VideoTexture | null>(null);
  useEffect(() => {
    if (!stream) {
      setTex(null);
      return;
    }
    const el = document.createElement("video");
    el.srcObject = stream;
    el.muted = true;
    el.playsInline = true;
    el.autoplay = true;
    el.style.cssText =
      "position:fixed;left:-10px;top:-10px;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    el.play().catch(() => {});

    const t = new THREE.VideoTexture(el);
    t.colorSpace = THREE.SRGBColorSpace;
    // Centre-crop to a square: the plate is round, so a raw 4:3 frame would
    // squash the face sideways. Recomputed once the real resolution is known.
    const crop = () => {
      const w = el.videoWidth;
      const h = el.videoHeight;
      if (!w || !h) return;
      if (w > h) {
        t.repeat.set(h / w, 1);
        t.offset.set((1 - h / w) / 2, 0);
      } else {
        t.repeat.set(1, w / h);
        t.offset.set(0, (1 - w / h) / 2);
      }
    };
    el.addEventListener("loadedmetadata", crop);
    crop();
    setTex(t);

    return () => {
      el.removeEventListener("loadedmetadata", crop);
      t.dispose();
      el.pause();
      el.srcObject = null;
      el.remove();
      setTex(null);
    };
  }, [stream]);
  return tex;
}

function Avatar({ position, color, dead, sheriff, ang = 0 }: { position: [number, number, number]; color: string; dead?: boolean; sheriff?: boolean; ang?: number }) {
  const shoulderY = 0.42; // torso top, just above the table rim (y=0)
  // Torso stops just under the table rim and a barrel carries it down to the floor.
  // It used to be one cone running the whole way from the shoulders to FLOOR_Y —
  // 1.97 tall under a 0.30 head, so it read as a traffic cone, not a person. The
  // old code assumed the table edge hid its lower half, but seats sit at
  // felt + 0.45, well outside the table body, so the entire cone was on show.
  const hipY = -0.5;
  const bodyH = shoulderY - hipY;
  // Faces are NOT on the heads. A head sized to fit seven seats around a table is
  // ~35px tall on screen, and a face needs 70-100px to read — the two demands are
  // irreconcilable, and every fix (2x head, moved hat, billboarded disc) was a
  // patch on that same mismatch. The webcams live on the wall posters instead,
  // where they are rectangular, face-on, and free of body proportions.
  const headR = 0.15;
  const headY = shoulderY + headR + 0.05; // sits just clear of the shoulders
  const brimY = headY + 0.1;
  const shirt = dead ? "#4a4a4a" : color;
  const skin = dead ? "#7a7a7a" : "#e8c39a";
  const shoulderR = 0.25;
  return (
    // Rotated so local +z points at the table centre: the arms have to reach
    // inward, which a radially symmetric cone never had to care about.
    <group position={position} rotation={[0, -ang - Math.PI / 2, 0]}>
      {/* the stool: a saloon barrel, so the figure sits on something instead of
          tapering into thin air above the floor */}
      <group position={[0, (FLOOR_Y + hipY) / 2 + 0.02, 0]}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.3, 0.27, hipY - FLOOR_Y - 0.04, 16]} />
          <meshStandardMaterial color="#6b4626" roughness={0.9} />
        </mesh>
        {[-0.22, 0.22].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <torusGeometry args={[0.295, 0.022, 6, 20]} />
            <meshStandardMaterial color="#4a4a4f" metalness={0.5} roughness={0.55} />
          </mesh>
        ))}
      </group>
      {/* torso */}
      <mesh position={[0, hipY + bodyH / 2, 0]} castShadow>
        <cylinderGeometry args={[shoulderR * 0.8, shoulderR * 1.08, bodyH, 20]} />
        <meshStandardMaterial color={shirt} roughness={0.8} />
      </mesh>
      {/* shoulders + arms reaching in to the table edge — the silhouette cue that
          turns a column into someone seated at a table */}
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <mesh position={[sx * shoulderR * 0.78, shoulderY - 0.04, 0]} castShadow>
            <sphereGeometry args={[shoulderR * 0.42, 14, 14]} />
            <meshStandardMaterial color={shirt} roughness={0.8} />
          </mesh>
          <mesh
            position={[sx * shoulderR * 0.8, shoulderY - 0.12, 0.2]}
            rotation={[1.16, 0, sx * 0.12]}
            castShadow
          >
            <cylinderGeometry args={[shoulderR * 0.3, shoulderR * 0.26, 0.5, 12]} />
            <meshStandardMaterial color={shirt} roughness={0.8} />
          </mesh>
          {/* hand resting on the felt */}
          <mesh position={[sx * shoulderR * 0.86, shoulderY - 0.28, 0.44]} castShadow>
            <sphereGeometry args={[shoulderR * 0.25, 12, 12]} />
            <meshStandardMaterial color={skin} roughness={0.7} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, headY, 0]} castShadow>
        <sphereGeometry args={[headR, 24, 24]} />
        <meshStandardMaterial color={skin} roughness={0.6} />
      </mesh>
      {/* cowboy hat: brim + crown */}
      <group position={[0, brimY, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.27, 0.27, 0.02, 24]} />
          <meshStandardMaterial color="#6b4a24" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.06, 0]} castShadow>
          <cylinderGeometry args={[0.13, 0.16, 0.14, 24]} />
          <meshStandardMaterial color="#5a3a1c" roughness={0.85} />
        </mesh>
        {/* Sheriff badge: a gold star pinned on top of the hat */}
        {sheriff && <SheriffStar radius={0.1} y={0.15} color="#f5c518" />}
      </group>
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
                {/* Guns: 🎯 + range (same style as the header range badge) — avoids
                    the green water-pistol 🔫 emoji and the dark, hard-to-see rifle art. */}
                {def?.kind === "gun" ? "🎯" : (CARD_ICON[c.defId] ?? "🔵")}
                {suffix && <span style={{ fontSize: 10, fontWeight: 800, marginLeft: 2 }}>{suffix}</span>}
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
  const seatR = felt + 0.45; // avatars out past the felt so bodies don't cover it
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
              <Avatar position={[ax, 0, az]} color={AVATAR_COLORS[i % AVATAR_COLORS.length]} dead={false} sheriff={p.role === "sheriff"} ang={ang} />
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

function Scene({ view, targetIds, onPickTarget, onInspect, onInspectPlayer, pickCardMode, onPickCard, fx, feeds }: { view: PlayerView; targetIds?: string[]; onPickTarget?: (id: string) => void; onInspect?: (c: Card) => void; onInspectPlayer?: (p: PlayerPublic) => void; pickCardMode?: boolean; onPickCard?: (ownerId: string, cardId: string) => void; fx?: boolean; feeds?: Map<string, MediaStream> }) {
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
      {/* Lighting: one warm lamp over the table doing the real work, everything
          else just lifting the shadows off black.
          Before, ambient 1.05 + hemisphere 0.85 + directional 1.0 + a "warehouse"
          environment lit every surface almost equally, and the directional light
          never had castShadow — so nothing cast a shadow and the whole table read
          as flat decals. It also left no bright spot for Bloom to catch and no
          dark corner for the Vignette to deepen, which is why neither effect was
          doing anything visible. */}
      <ambientLight intensity={0.26} color="#ffeccd" />
      <hemisphereLight args={["#ffe8c0", "#2a1c10", 0.22]} />
      <directionalLight
        position={[3.5, 7, 4]}
        intensity={0.45}
        color="#fff3e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-camera-left={-felt * 2.4}
        shadow-camera-right={felt * 2.4}
        shadow-camera-top={felt * 2.4}
        shadow-camera-bottom={-felt * 2.4}
        shadow-bias={-0.0006}
      />
      <TableLamp felt={felt} />
      <Saloon felt={felt} />
      <Table felt={felt} />
      <CenterPiles deckCount={view.deckCount} discardCount={view.discardCount} topDiscard={view.topDiscard} />
      <Opponents players={view.players} youSeat={view.you.seat} ring={ring} felt={felt} arc={arc} targetIds={targetIds} onPickTarget={onPickTarget} onInspect={onInspect} onInspectPlayer={onInspectPlayer} pickCardMode={pickCardMode} onPickCard={onPickCard} />
      {/* live webcams, hung on the walls as WANTED posters */}
      <WantedPosters players={view.players} youSeat={view.you.seat} youId={view.you.id} youName={view.you.name} feeds={feeds} felt={felt} />
      {/* your own in-play cards, on the near edge of the felt */}
      <FeltCards cards={view.you.equipment} ang={Math.PI / 2} radius={ring * 0.72} onInspect={onInspect} />
      {/* cards drawn into your hand fly out of the deck toward you */}
      <FlyingCards hand={view.you.hand} felt={felt} camY={camY} camZ={camZ} />
      {/* Draw!-check reveal (any kind) over the table centre */}
      <CheckFx check={view.checks.at(-1) ?? null} felt={felt} />
      {/* Cinematic pass: the lamp globe blooms, the corners fall away. Threshold
          dropped from 0.78 to 0.58 — under the old flat lighting nothing in frame
          was bright enough to cross 0.78, so Bloom rendered no visible glow at all.
          Skipped entirely when the player turns effects off (weak devices). */}
      {fx && (
        <EffectComposer>
          <Bloom intensity={0.75} luminanceThreshold={0.58} luminanceSmoothing={0.25} mipmapBlur />
          <Vignette offset={0.22} darkness={0.68} eskil={false} />
        </EffectComposer>
      )}
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
  fx = true,
  feeds,
}: {
  view: PlayerView;
  targetIds?: string[];
  onPickTarget?: (id: string) => void;
  onInspect?: (c: Card) => void;
  onInspectPlayer?: (p: PlayerPublic) => void;
  pickCardMode?: boolean;
  onPickCard?: (ownerId: string, cardId: string) => void;
  fx?: boolean; // hiệu ứng nâng cao (bloom / vignette) — tắt được cho máy yếu
  feeds?: Map<string, MediaStream>; // playerId -> webcam, vẽ lên đầu từng nhân vật
}) {
  return (
    <div style={{ width: "100%", height: "100%", background: "#141210" }}>
      {/* dpr thấp hơn khi tắt hiệu ứng: đỡ tải cho máy yếu */}
      <Canvas shadows dpr={fx ? [1, 2] : [1, 1.5]}>
        <Scene view={view} targetIds={targetIds} onPickTarget={onPickTarget} onInspect={onInspect} onInspectPlayer={onInspectPlayer} pickCardMode={pickCardMode} onPickCard={onPickCard} fx={fx} feeds={feeds} />
      </Canvas>
    </div>
  );
}
