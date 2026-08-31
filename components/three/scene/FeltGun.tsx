"use client";

// The gun lying on the cloth beside a seat's cards in play.
//
// It used to be a child of the figure's right hand bone: one object served both holds, and
// parenting it to the hand is what let it stay still while the body under it swivelled to
// aim, leaned in for the deck, or rocked back from a hit. When the cowboy bodies were
// switched off (see COWBOY_BODIES in geometry.ts) that hand went away and every gun on the
// table went with it — seven of them, because heldGun arms an empty-handed player with the
// Colt .45 the rules give away for free.
//
// So it stands on its own here, and off the hand it is STATIC: no per-frame work, no lerp
// towards a rest pose, and none of the two conversions into hand-local space. The arithmetic
// that places it is feltGunPlacement in guns.ts — one copy, shared with the held gun should
// the bodies ever come back.
//
// The gun card itself is still on the felt through FeltCards, range number and all; this is
// the 3D prop next to it, not the game state.

import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { Card } from "@/lib/types";
import { feltGunPlacement, heldGun } from "./guns";

export function FeltGun({
  equipment,
  x,
  z,
  face,
  models,
}: {
  equipment: Card[];
  x: number; // the chair, on the cloth
  z: number;
  face: number; // which way the seat looks, in radians
  models?: boolean;
}) {
  // A module-level singleton per weapon, so this stays a stable dependency even though
  // `equipment` is a fresh array on every broadcast.
  const spec = heldGun(equipment);
  const { scene } = useGLTF(spec.url);
  // Primitives as deps, not a tuple: a fresh [x, 0, z] literal every render would rebuild
  // the Vector3 and Quaternion on every broadcast, and r3f would re-apply both to an object
  // that has not moved.
  const place = useMemo(() => feltGunPlacement(spec, [x, 0, z], face), [spec, x, z, face]);

  // castShadow on every mesh, not left to the default: without it the gun read as hovering
  // over the cloth rather than lying on it. The clone is per-seat because seven seats show
  // the same file and a shared object can only be in one place.
  const gun = useMemo(() => {
    const g = scene.clone(true);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    return g;
  }, [scene]);

  // `models` off means primitives everywhere, and a .glb gun would be the one modelled
  // thing left on an otherwise blocky table.
  if (!models) return null;
  return (
    <primitive
      object={gun}
      position={place.position}
      quaternion={place.quaternion}
      scale={place.scale}
    />
  );
}
