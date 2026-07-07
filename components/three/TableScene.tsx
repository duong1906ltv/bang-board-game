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

// A low-poly seated cowboy: torso + head + hat. Radially symmetric, so no facing
// needed. Shoulders/head poke above the table so it reads as "someone sitting".
function Avatar({ position, color, dead, sheriff }: { position: [number, number, number]; color: string; dead?: boolean; sheriff?: boolean }) {
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
      {/* Sheriff badge: a gold star pinned on top of the hat */}
      {sheriff && <SheriffStar radius={0.1} y={0.95} color="#f5c518" />}
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
                {CARD_ICON[c.defId] ?? "🔵"}
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
            <Avatar position={[ax, 0, az]} color={AVATAR_COLORS[i % AVATAR_COLORS.length]} dead={!p.alive} sheriff={p.role === "sheriff"} />
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
  const cardRef = useRef<THREE.Group>(null);
  const blastRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const cy = 0.3 + felt * 0.5; // stage height above the felt

  useEffect(() => {
    if (!check) return;
    const key = check.card?.id ?? `${check.name}-${check.kind}-${check.outcome}`;
    if (key === lastKey.current) return; // already showed this reveal
    lastKey.current = key;
    t.current = 0;
    setActive({ card: check.card, blast: check.kind === "dynamite" && check.outcome === "blast", kind: check.kind, outcome: check.outcome, name: check.name });
  }, [check]);

  const DUR = 1.8;
  useFrame((_, dt) => {
    if (!active) return;
    t.current += dt;
    const p = Math.min(t.current / DUR, 1);

    // Card: rise + turn face-up over the first 0.4s, hold, fade over the last 0.25.
    const rise = Math.min(t.current / 0.4, 1);
    const er = 1 - Math.pow(1 - rise, 3);
    if (cardRef.current) {
      cardRef.current.position.set(0, 0.3 + er * (cy - 0.3), 0);
      cardRef.current.rotation.y = (1 - er) * Math.PI * 1.5;
      cardRef.current.scale.setScalar(0.8 + er * 1.3);
      const op = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
      cardRef.current.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m) {
          m.transparent = true;
          m.opacity = op;
        }
      });
    }

    // Blast: an expanding, fading fireball + a flash of light, after the reveal.
    if (active.blast) {
      const bp = (t.current - 0.4) / (DUR - 0.4);
      const eb = 1 - Math.pow(1 - Math.min(Math.max(bp, 0), 1), 2);
      if (blastRef.current) {
        blastRef.current.visible = bp > 0 && bp < 1;
        blastRef.current.scale.setScalar(0.2 + eb * felt * 1.7);
        (blastRef.current.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 0.85 * (1 - eb));
      }
      if (lightRef.current) lightRef.current.intensity = Math.max(0, 45 * (1 - bp * 1.3));
    }

    if (p >= 1) {
      if (lightRef.current) lightRef.current.intensity = 0;
      setActive(null);
    }
  });

  if (!active) return null;
  return (
    <group>
      {active.card && (
        <group ref={cardRef}>
          <CardMesh card={active.card} rotation={[0, 0, 0]} />
        </group>
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
      {/* result text is announced by the DOM marquee in the room HUD */}
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
      <ambientLight intensity={0.85} color="#fff2dc" />
      <hemisphereLight args={["#fff0d0", "#4a3420", 0.7]} />
      <directionalLight position={[3, 6, 4]} intensity={0.8} color="#fff3e0" />
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
      <CheckFx check={view.checks.length ? view.checks[view.checks.length - 1] : null} felt={felt} />
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
