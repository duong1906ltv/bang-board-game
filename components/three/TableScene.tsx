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
import type { PlayerView, PlayerPublic } from "@/lib/types";
import { ROLE_EMOJI } from "@/lib/types";

// Repeating wooden-plank texture drawn on a canvas (no external asset needed).
function plankTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#3a2817";
  ctx.fillRect(0, 0, 128, 128);
  const ph = 32;
  for (let y = 0; y < 128; y += ph) {
    const alt = (y / ph) % 2 === 0;
    ctx.fillStyle = alt ? "#402c19" : "#341f10";
    ctx.fillRect(0, y, 128, ph - 2);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
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
  const roomW = felt * 6.5;
  const roomH = 7;
  const floorY = -1.55;
  const barrelR = felt * 2.3;
  const barrels: [number, number, number][] = [
    [Math.cos(2.1) * barrelR, floorY + 0.45, Math.sin(2.1) * barrelR],
    [Math.cos(3.5) * barrelR, floorY + 0.45, Math.sin(3.5) * barrelR],
    [Math.cos(4.2) * barrelR, floorY + 0.45, Math.sin(4.2) * barrelR],
    [Math.cos(5.4) * barrelR, floorY + 0.45, Math.sin(5.4) * barrelR],
  ];
  return (
    <group>
      {/* room walls + ceiling (we're inside the box) */}
      <mesh position={[0, floorY + roomH / 2, 0]}>
        <boxGeometry args={[roomW, roomH, roomW]} />
        <meshStandardMaterial color="#2a1c11" side={THREE.BackSide} roughness={1} />
      </mesh>
      {/* plank floor just above the box bottom */}
      <mesh position={[0, floorY + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[roomW, roomW]} />
        <meshStandardMaterial map={floorTex} roughness={1} />
      </mesh>
      {/* hanging lamp over the table */}
      <group position={[0, 2.7, 0]}>
        <mesh position={[0, 0.75, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 1.5, 8]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        <mesh castShadow>
          <coneGeometry args={[0.5, 0.42, 24, 1, true]} />
          <meshStandardMaterial color="#3a2a15" side={THREE.DoubleSide} emissive="#ffcf8f" emissiveIntensity={0.35} roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.16, 0]}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshStandardMaterial color="#fff2d0" emissive="#ffe6b0" emissiveIntensity={2.2} />
        </mesh>
        <pointLight position={[0, -0.15, 0]} color="#ffd9a0" intensity={18} distance={felt * 5} decay={2} castShadow />
      </group>
      {barrels.map((p, i) => (
        <Barrel key={i} position={p} />
      ))}
    </group>
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
          </group>
        );
      })}
    </>
  );
}

function Scene({ view }: { view: PlayerView }) {
  const nOpp = Math.max(1, view.players.length - 1);
  const { ring, felt, arc, camY, camZ, fov } = layout(nOpp);
  return (
    <>
      <color attach="background" args={["#1c130c"]} />
      <fog attach="fog" args={["#1c130c", felt * 2.6, felt * 6]} />
      <PerspectiveCamera makeDefault position={[0, camY, camZ]} fov={fov} />
      {/* Fixed camera: keep it aimed at the table, no free orbit/zoom/pan. */}
      <OrbitControls
        target={[0, 0, -felt * 0.12]}
        enableRotate={false}
        enableZoom={false}
        enablePan={false}
      />
      {/* Dim warm ambient; the hanging lamp is the main light. */}
      <ambientLight intensity={0.35} color="#ffe8c8" />
      <Environment preset="warehouse" />
      <Saloon felt={felt} />
      <Table felt={felt} />
      <Opponents players={view.players} youSeat={view.you.seat} ring={ring} felt={felt} arc={arc} />
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
