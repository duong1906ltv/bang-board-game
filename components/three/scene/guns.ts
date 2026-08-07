// Every gun in the scene, in one table. Each is the SAME object waiting on the cloth and
// held in a fist, so one set of measurements has to serve both.
//
// All the vectors are in each model's own units and axes, read off the meshes with a
// script — the files do not agree on which way is forward or which way is up. The two
// grips that were placed by hand and checked on screen (revolver, shotgun) were carried
// to the other four as FRACTIONS of the bounding box — so far back from the muzzle, so
// far up from the bottom. A grip is a position along a gun, and only that reading
// survives the jump to a file with a different scale and different axes.
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

export interface GunSpec {
  url: string;
  modelLen: number; // bbox along the barrel axis
  drop: number; // origin to lowest point ONCE ROLLED ONTO ITS SIDE — see feltQuat
  heldLen: number; // and in a hand
  barrel: [number, number, number]; // the way the muzzle points
  up: [number, number, number]; // and which way is the top of the gun
  grip: [number, number, number]; // where the firing hand wraps it
  fore?: [number, number, number]; // and the supporting hand, on anything too long for one
}

// One model per card, and the held length grows with the card's range — that is the cue
// a player reads across a table, so it is the one the sizes serve. Absolute size is set
// against the fist holding the gun (the revolver is 2.9x its length) rather than against
// metres, because the figure is stylised: its forearm alone measures 40cm at body scale,
// and working from that asks for an 82cm revolver.
//
// Period-plausible where a CC0 model allowed it — the Schofield really was a top-break,
// the Winchester really was a lever action — and silhouette-first where it did not.

// The gun of a player holding no weapon card: the plainest revolver in the set, because
// it is what most of the table is carrying most of the time.
const COLT: GunSpec = {
  url: "/models/revolver.glb",
  modelLen: 1.982,
  drop: 0.147,
  heldLen: 0.44,
  barrel: [1, 0, 0],
  up: [0, 1, 0],
  grip: [0.185, -0.14, 0],
};

// range 1 — same reach as the free Colt, so length cannot tell them apart and the
// SHAPE has to: an old cap-and-ball pistol, hammer out in the open, no cylinder, belled
// muzzle, curved butt. Not a Volcanic (no CC0 model has that lever-action pistol) but
// unmistakably not the gun everyone else started with, which is the distinction the
// table actually needs — its one card in ten is worth spotting.
const VOLCANIC: GunSpec = {
  url: "/models/pistol-flint.glb",
  modelLen: 1.244,
  drop: 0.167,
  heldLen: 0.44,
  barrel: [1, 0, 0],
  up: [0, 1, 0],
  grip: [0.05, -0.144, 0],
};

// range 2
const SCHOFIELD: GunSpec = {
  url: "/models/revolver-break.glb",
  modelLen: 0.635,
  drop: 0.041,
  heldLen: 0.49,
  barrel: [0, 0, -1],
  up: [-1, 0, 0], // the grip rises towards +x, so the top of the gun is -x
  grip: [0.138, 0, 0.08],
};

// range 3
const REMINGTON: GunSpec = {
  url: "/models/revolver-long.glb",
  modelLen: 1.901,
  drop: 0.147,
  heldLen: 0.55,
  barrel: [1, 0, 0],
  up: [0, 1, 0],
  grip: [0.226, -0.072, 0],
};

// range 4. Anything this long is past what one arm can hold up, so it and the Winchester
// take the two-handed aim, the off hand out on the fore-end.
const CARABINE: GunSpec = {
  url: "/models/shotgun.glb",
  modelLen: 2.073,
  drop: 0.077,
  heldLen: 1.45,
  barrel: [0, 0, -1],
  up: [-1, 0, 0], // the stock drops towards +x, so the top of the gun is -x
  grip: [0.12, 0.03, 0.36], // the wrist of the stock, behind the receiver
  fore: [0.03, 0.03, -0.15], // and the front of the receiver, where the off hand sits
};

// range 5. A Winchester 1873 is 125cm — 3.9 revolvers — which lands it at 82% of a
// seated figure's height.
const WINCHESTER: GunSpec = {
  url: "/models/rifle-lever.glb",
  modelLen: 2.19,
  drop: 0.029,
  heldLen: 1.91,
  barrel: [0, 0, -1],
  up: [-1, 0, 0],
  grip: [0.11, 0, 0.464],
  fore: [0.02, 0, -0.075],
};

const BY_DEF: Record<string, GunSpec> = {
  volcanic: VOLCANIC,
  schofield: SCHOFIELD,
  remington: REMINGTON,
  "rev-carabine": CARABINE,
  winchester: WINCHESTER,
};

export const gunModel = (defId: string): GunSpec | undefined => BY_DEF[defId];

// Fetched up front, every one, because the cowboy holding a gun calls useGLTF on the url
// of whatever he is carrying: equipping a weapon changes that url, and an unloaded file
// suspends him mid-game — which tears down his skeleton and his animation mixer, and he
// comes back standing. Two models could be waved through; six cannot.
if (typeof window !== "undefined") for (const g of new Set([COLT, ...Object.values(BY_DEF)])) useGLTF.preload(g.url);

// Lying on the cloth: barrel along +x, and fallen onto its side.
//
// The quarter turn at the end is the whole point. Barrel horizontal with the sights up
// is not a gun lying down — it is a gun BALANCED on the bottom of its grip, which is
// what this used to produce and what it looked like. Rolled a further 90 degrees about
// its own barrel it comes to rest on a side plate, sights pointing sideways, and its
// height drops from the gun's full 0.89 to its 0.29 thickness.
//
// Everything before that is solved from the two measured vectors rather than written per
// model, because no two files agree on which axis is the barrel or which way is up.
const B = new THREE.Vector3(), U = new THREE.Vector3(), S = new THREE.Vector3();
const BASIS = new THREE.Matrix4();
const ROLL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const flat = new Map<string, THREE.Quaternion>();
export function feltQuat(spec: GunSpec): THREE.Quaternion {
  const hit = flat.get(spec.url);
  if (hit) return hit;
  B.fromArray(spec.barrel);
  U.fromArray(spec.up);
  // (barrel, up, barrel x up) is right-handed like (x, y, z), so the rotation taking
  // one frame to the other is just the transpose of the model's own basis.
  BASIS.makeBasis(B, U, S.crossVectors(B, U)).transpose();
  const q = new THREE.Quaternion().setFromRotationMatrix(BASIS).premultiply(ROLL);
  flat.set(spec.url, q);
  return q;
}

// TEMPORARY, for looking at the two holds without waiting for the cards to come up:
// every seat gets armed, alternating a Winchester (range 5, the two-handed rifle) and a
// Schofield (range 2, a revolver). Switch it on either way:
//
//   ?guns on the room URL          — but that reloads the page, which makes the client
//                                    rejoin the room, and a rejoin can fail on its own
//   __guns = true in the console   — takes effect on the next broadcast, no reload, so
//                                    it cannot cost you the room you are sitting in
//
// Render only: the engine deals no such cards, so ranges and card art stay honest. The
// gun on the cloth does NOT — it is the held weapon, which is exactly what this fakes.
// Delete this and its call below to remove it.
let fromUrl: boolean | null = null;
function forcedGuns(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as typeof window & { __guns?: boolean };
  if (w.__guns !== undefined) return w.__guns;
  if (fromUrl === null) fromUrl = new URLSearchParams(window.location.search).has("guns");
  return fromUrl;
}

// What this player is holding. Nobody is unarmed in Bang! — with no weapon card in
// play you are carrying the Colt .45 the rules give you for free.
export function heldGun(equipment: { defId: string }[], seat = 0): GunSpec {
  for (const c of equipment) {
    const g = BY_DEF[c.defId];
    if (g) return g;
  }
  if (forcedGuns()) return seat % 2 === 0 ? WINCHESTER : SCHOFIELD;
  return COLT;
}
