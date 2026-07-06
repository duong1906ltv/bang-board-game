"use client";

// First-person 3D table for Bang!. Reads the SAME PlayerView the 2D room uses,
// so the game logic / socket layer is untouched — this is purely a render layer.
// The camera sits at "your" seat looking across a round table; your hand is
// fanned in front of you, opponents are arranged around the far arc.
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Html, Environment } from "@react-three/drei";
import { CardMesh } from "./CardMesh";
import type { PlayerView, PlayerPublic } from "@/lib/types";
import { ROLE_EMOJI } from "@/lib/types";

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

function Opponents({ players, youSeat, ring, arc }: { players: PlayerPublic[]; youSeat: number; ring: number; arc: number }) {
  const others = players.filter((p) => p.seat !== youSeat);
  return (
    <>
      {others.map((p, i) => {
        // Spread across the far arc (centered straight ahead, away from the camera).
        const t = others.length === 1 ? 0.5 : i / (others.length - 1);
        const ang = 1.5 * Math.PI - arc / 2 + arc * t;
        const x = ring * Math.cos(ang);
        const z = ring * Math.sin(ang);
        return (
          <group key={p.id} position={[x, 0.05, z]} rotation={[0, -ang - Math.PI / 2, 0]}>
            <OpponentHand count={p.handCount} />
            <Nameplate p={p} />
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
      <color attach="background" args={["#17120f"]} />
      <fog attach="fog" args={["#17120f", felt * 2.2, felt * 5.5]} />
      <PerspectiveCamera makeDefault position={[0, camY, camZ]} fov={fov} />
      <OrbitControls
        target={[0, 0, -felt * 0.12]}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={felt}
        maxDistance={camZ + 6}
        enablePan={false}
      />
      <ambientLight intensity={0.55} />
      <spotLight position={[0, felt + 3.5, 0.5]} angle={0.8} penumbra={0.6} intensity={2.6} castShadow />
      <Environment preset="warehouse" />
      <Table felt={felt} />
      <Opponents players={view.players} youSeat={view.you.seat} ring={ring} arc={arc} />
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
