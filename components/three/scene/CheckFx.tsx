"use client";

// The Draw! reveal: a flipped card staged over the middle of the table with its
// result, plus a fireball when Dynamite goes off.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { PlayingCard } from "@/components/PlayingCard";
import type { Card, CheckView } from "@/lib/types";

// A dramatic Draw!-check reveal for ANY check (Dynamite / Jail / Barrel /
// Black Jack / Lucky Duke), staged over the centre of the table: the drawn card
// rises and turns face-up with a result label, so players feel the draw. A
// Dynamite blast adds a fireball. Reacts to the newest entry in view.checks.
export function CheckFx({ check, felt }: { check: CheckView | null; felt: number }) {
  const [active, setActive] = useState<{ card: Card | null; blast: boolean; kind: string; outcome: string; name: string } | null>(null);
  const lastKey = useRef<string | null>(null);
  const t = useRef(0);
  const divRef = useRef<HTMLDivElement>(null);
  const blastRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const cy = 0.3 + felt * 0.32; // stage height above the felt

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
        <Html center position={[0, cy, 0]} distanceFactor={9} style={{ pointerEvents: "none" }} zIndexRange={[80, 70]}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div ref={divRef} style={{ transform: "scale(0.6)", willChange: "transform, opacity" }}>
              <PlayingCard card={active.card} />
            </div>
            {/* Skip button so players don't have to wait the full 5s. Laid out in
                normal flow BELOW the card so it can never overlap it (no 3D
                positioning to drift out of alignment). */}
            <button
              onClick={dismiss}
              style={{
                pointerEvents: "auto",
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
    </group>
  );
}

