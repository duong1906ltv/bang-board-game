"use client";

// First-person 3D table for Bang!. Reads the SAME PlayerView the 2D room uses,
// so the game logic / socket layer is untouched — this is purely a render layer.
// The camera sits at "your" seat looking across a round table; your hand is
// fanned in front of you, opponents are arranged around the far arc.
import { useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Html, Environment } from "@react-three/drei";
import { CardMesh } from "./CardMesh";
import type { Card } from "@/lib/cards";
import type { PlayerView, PlayerPublic } from "@/lib/types";
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
  const roomW = felt * 6.5;
  const roomH = 7;
  const floorY = -1.55;
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
      {/* WANTED posters on the back wall */}
      {[-1.4, 1.4].map((x, i) => (
        <mesh key={i} position={[x, floorY + 2.4, -wall + 0.02]}>
          <planeGeometry args={[1, 1.4]} />
          <meshStandardMaterial map={posterTex} roughness={1} />
        </mesh>
      ))}
      {/* sheriff star painted on the felt (large, subtle, behind the piles) */}
      <SheriffStar radius={felt * 0.42} y={0.04} color="#b8912f" opacity={0.4} />
      {/* hanging lamp over the table */}
      <group position={[0, 2.7, 0]}>
        <mesh position={[0, 0.75, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 1.5, 8]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        <mesh castShadow>
          <coneGeometry args={[0.5, 0.42, 24, 1, true]} />
          <meshStandardMaterial color="#4a3418" side={THREE.DoubleSide} emissive="#ffcf8f" emissiveIntensity={0.5} roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.16, 0]}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshStandardMaterial color="#fff2d0" emissive="#ffe6b0" emissiveIntensity={2.4} />
        </mesh>
        <pointLight position={[0, -0.15, 0]} color="#ffe0b0" intensity={24} distance={felt * 6} decay={2} />
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
  const arc = Math.min(1.15, 0.55 + 0.11 * nOpp) * Math.PI; // arc span, widens with count
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

function Nameplate({ p }: { p: PlayerPublic }) {
  return (
    <Html center distanceFactor={6} style={{ pointerEvents: "none" }}>
      <div
        style={{
          whiteSpace: "nowrap",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#fff",
          textShadow: "0 1px 3px #000",
          transform: "translateY(-46px)",
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
            position={[off, 0.02 + i * 0.002, 0]}
            rotation={[-Math.PI / 2 + 0.35, 0, off * 0.3]}
          />
        );
      })}
    </group>
  );
}

// Distinct shirt colors so seated players read apart.
const AVATAR_COLORS = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085", "#c39bd3"];

// A low-poly seated cowboy: torso + head + hat. Radially symmetric, so no facing
// needed. Shoulders/head poke above the table so it reads as "someone sitting".
function Avatar({ position, color, dead }: { position: [number, number, number]; color: string; dead?: boolean }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.26, 0.62, 20]} />
        <meshStandardMaterial color={dead ? "#4a4a4a" : color} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.7, 0]} castShadow>
        <sphereGeometry args={[0.15, 24, 24]} />
        <meshStandardMaterial color={dead ? "#7a7a7a" : "#e8c39a"} roughness={0.6} />
      </mesh>
      {/* cowboy hat: brim + crown */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.27, 0.27, 0.02, 24]} />
        <meshStandardMaterial color="#6b4a24" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.86, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.16, 0.14, 24]} />
        <meshStandardMaterial color="#5a3a1c" roughness={0.85} />
      </mesh>
    </group>
  );
}

// Blue "in play" cards (guns, Barrel, Scope, Jail…) laid face-up on the felt in
// front of a seat, upright toward the camera so the whole table can read them.
function FeltCards({ cards, ang, radius }: { cards: Card[]; ang: number; radius: number }) {
  if (!cards.length) return null;
  const cx = radius * Math.cos(ang);
  const cz = radius * Math.sin(ang);
  const tx = -Math.sin(ang);
  const tz = Math.cos(ang);
  const gap = 0.32;
  return (
    <group>
      {cards.map((c, i) => {
        const o = (i - (cards.length - 1) / 2) * gap;
        return (
          <CardMesh key={c.id} card={c} scale={0.42} position={[cx + tx * o, 0.07, cz + tz * o]} rotation={[-Math.PI / 2, 0, 0]} />
        );
      })}
    </group>
  );
}

function Opponents({ players, youSeat, ring, felt, arc }: { players: PlayerPublic[]; youSeat: number; ring: number; felt: number; arc: number }) {
  const others = players.filter((p) => p.seat !== youSeat);
  const seatR = felt + 0.2; // avatars just beyond the felt edge
  return (
    <>
      {others.map((p, i) => {
        // Spread across the far arc (centered straight ahead, away from the camera).
        const t = others.length === 1 ? 0.5 : i / (others.length - 1);
        const ang = 1.5 * Math.PI - arc / 2 + arc * t;
        const x = ring * Math.cos(ang);
        const z = ring * Math.sin(ang);
        return (
          <group key={p.id}>
            <group position={[x, 0.05, z]} rotation={[0, -ang - Math.PI / 2, 0]}>
              <OpponentHand count={p.handCount} />
              <Nameplate p={p} />
            </group>
            <Avatar
              position={[seatR * Math.cos(ang), 0, seatR * Math.sin(ang)]}
              color={AVATAR_COLORS[i % AVATAR_COLORS.length]}
              dead={!p.alive}
            />
            <FeltCards cards={p.equipment} ang={ang} radius={ring * 0.64} />
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

function Scene({ view }: { view: PlayerView }) {
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
      <ambientLight intensity={0.85} color="#fff2dc" />
      <hemisphereLight args={["#fff0d0", "#4a3420", 0.7]} />
      <directionalLight position={[3, 6, 4]} intensity={0.8} color="#fff3e0" />
      <Environment preset="warehouse" />
      <Saloon felt={felt} />
      <Table felt={felt} />
      <CenterPiles deckCount={view.deckCount} discardCount={view.discardCount} topDiscard={view.topDiscard} />
      <Opponents players={view.players} youSeat={view.you.seat} ring={ring} felt={felt} arc={arc} />
      {/* your own in-play cards, on the near edge of the felt */}
      <FeltCards cards={view.you.equipment} ang={Math.PI / 2} radius={ring * 0.72} />
    </>
  );
}

export default function TableScene({ view }: { view: PlayerView }) {
  return (
    <div style={{ width: "100%", height: "100%", background: "#141210" }}>
      <Canvas shadows dpr={[1, 2]}>
        <Scene view={view} />
      </Canvas>
    </div>
  );
}
