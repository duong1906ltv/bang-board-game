"use client";

// A pulsing gold ring on the cloth with an invisible plane over it that takes the
// click. It means one thing: reach out and take these cards.
//
// Two places wear it — the draw pile, and another player's hand while Jesse Jones is
// picking whose to raid — and they have to look identical, because they are the same
// gesture and a player should only have to learn it once. Rendered by the parent ONLY
// while the spot is live, so the hover state resets by unmounting.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

export function PickSpot({
  radius,
  thickness = 0.07,
  squash = 1,
  hit,
  ringY,
  hitY = 0.1,
  center = [0, 0],
  ring: ringed = true,
  onPick,
}: {
  radius: number; // inner radius of the ring
  thickness?: number;
  squash?: number; // flattens it across z, for a spread of cards that is not round
  hit: [number, number]; // the invisible plane that actually takes the pointer
  ringY: number; // ring height, in the parent's frame — on the cloth, under the cards
  hitY?: number; // and the plane's, which only has to clear the tallest card
  center?: [number, number]; // x, z of whatever is being ringed
  // Off for a spot that is not a card gesture at all — the discard pile takes a click
  // to move the CAMERA, and wearing the gold ring would promise a card it never deals.
  // What it still wants from here is the pointer cursor and the single flicker-free
  // hit plane, which is the whole reason this is one component.
  ring?: boolean;
  onPick: () => void;
}) {
  const ring = useRef<THREE.MeshStandardMaterial>(null);
  const [hover, setHover] = useState(false);

  // Pulse the RING, never the cards: a stack has to stay a believable pile of paper,
  // and a throbbing card reads as a rendering bug rather than an invitation.
  useFrame((s) => {
    const m = ring.current;
    if (!m) return;
    const pulse = 0.5 + 0.5 * Math.sin(s.clock.elapsedTime * 3.4);
    m.opacity = hover ? 0.95 : 0.4 + 0.35 * pulse;
    m.emissiveIntensity = hover ? 2.6 : 0.8 + 1.1 * pulse;
  });

  // Put the cursor back on the way out. This whole component unmounts the instant the
  // spot stops being offered — which is exactly the moment you click it — and that is
  // usually while the mouse is still sitting on top of it.
  useEffect(() => {
    if (!hover) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hover]);

  return (
    <group position={[center[0], 0, center[1]]}>
      {/* Scaled after the -90° that lays it flat, so the squash is along world z. */}
      {ringed && (
        <mesh position={[0, ringY, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, squash, 1]}>
          <ringGeometry args={[radius, radius + thickness, 56]} />
          <meshStandardMaterial ref={ring} color="#ffcf3a" emissive="#ff9500" transparent depthWrite={false} />
        </mesh>
      )}
      {/* ONE invisible plane takes the pointer, rather than the cards themselves. A
          stack is several coplanar planes, so a single ray hits all of them and r3f
          fires enter/leave for each as the mouse crosses them — the hover flickered.
          `opacity: 0` rather than `visible={false}`, because three.js does not raycast
          invisible objects at all. */}
      <mesh
        position={[0, hitY, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onPick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
      >
        <planeGeometry args={hit} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
