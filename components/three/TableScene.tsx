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

function Table() {
  return (
    <group>
      {/* felt top */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.75, 64]} />
        <meshStandardMaterial color="#1f6b3a" roughness={0.9} />
      </mesh>
      {/* rim */}
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[1.8, 1.8, 0.12, 64]} />
        <meshStandardMaterial color="#5a3312" roughness={0.7} />
      </mesh>
      {/* floor */}
      <mesh position={[0, -0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 30]} />
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

function Opponents({ players, youSeat }: { players: PlayerPublic[]; youSeat: number }) {
  const others = players.filter((p) => p.seat !== youSeat);
  const R = 1.35;
  return (
    <>
      {others.map((p, i) => {
        // Spread across the far arc (behind the table, away from the camera).
        const t = others.length === 1 ? 0.5 : i / (others.length - 1);
        const ang = Math.PI * (1.15 + 0.7 * t); // ~207° → ~333°
        const x = R * Math.cos(ang);
        const z = R * Math.sin(ang);
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

function YourHand({ view }: { view: PlayerView }) {
  const hand = view.you.hand;
  const n = hand.length;
  return (
    <group position={[0, 0.55, 1.65]} rotation={[-0.75, 0, 0]}>
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
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 1.45, 2.75]} fov={55} />
      <OrbitControls
        target={[0, 0.15, 0]}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={1.5}
        maxDistance={5}
        enablePan={false}
      />
      <ambientLight intensity={0.6} />
      <spotLight position={[0, 4, 1]} angle={0.6} penumbra={0.5} intensity={2.2} castShadow />
      <Environment preset="warehouse" />
      <Table />
      <Opponents players={view.players} youSeat={view.you.seat} />
      <YourHand view={view} />
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
