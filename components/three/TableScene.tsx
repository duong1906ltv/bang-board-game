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
  const ring = 1.5 + 0.14 * nOpp; // radius of the opponent circle
  const felt = ring + 0.55; // felt top radius
  const arc = Math.min(1.15, 0.55 + 0.11 * nOpp) * Math.PI; // arc span, widens with count
  // Low, close camera so the felt fills the full width of the screen (first-person feel).
  const camY = 0.85 + 0.09 * nOpp;
  const camZ = ring + 0.85;
  const handZ = ring - 0.1;
  const fov = 74;
  return { ring, felt, arc, camY, camZ, handZ, fov };
}

function Table({ felt }: { felt: number }) {
  return (
    <group>
      {/* felt top */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[felt, 64]} />
        <meshStandardMaterial color="#1f6b3a" roughness={0.9} />
      </mesh>
      {/* rim */}
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[felt + 0.05, felt + 0.05, 0.12, 64]} />
        <meshStandardMaterial color="#5a3312" roughness={0.7} />
      </mesh>
      {/* floor */}
      <mesh position={[0, -0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#2a2622" roughness={1} />
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

function YourHand({ view, handZ }: { view: PlayerView; handZ: number }) {
  const hand = view.you.hand;
  const n = hand.length;
  return (
    <group position={[0, 0.55, handZ]} rotation={[-0.75, 0, 0]}>
      {hand.map((card, i) => {
        const off = (i - (n - 1) / 2) * 0.42;
        return (
          <CardMesh
            key={card.id}
            card={card}
            scale={0.8}
            position={[off, -Math.abs(off) * 0.12, i * 0.01]}
            rotation={[0, 0, -off * 0.12]}
            onClick={() => console.log("clicked", card.name)}
          />
        );
      })}
    </group>
  );
}

function Scene({ view }: { view: PlayerView }) {
  const nOpp = Math.max(1, view.players.length - 1);
  const { ring, felt, arc, camY, camZ, handZ, fov } = layout(nOpp);
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, camY, camZ]} fov={fov} />
      <OrbitControls
        target={[0, 0.15, 0]}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={1.5}
        maxDistance={camZ + 4}
        enablePan={false}
      />
      <ambientLight intensity={0.6} />
      <spotLight position={[0, felt + 3, 1]} angle={0.7} penumbra={0.5} intensity={2.4} castShadow />
      <Environment preset="warehouse" />
      <Table felt={felt} />
      <Opponents players={view.players} youSeat={view.you.seat} ring={ring} arc={arc} />
      <YourHand view={view} handZ={handZ} />
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
