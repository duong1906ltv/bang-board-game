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
import { FELT_CARD_GAP } from "./Cards";
import { DISCARD_X, FELT_Y, SEAT_GAP } from "./geometry";

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

// --- where a gun lies on the cloth ---
//
// The world half of the old restGun, lifted out of Avatars.tsx so there is ONE copy of
// this arithmetic. It is read twice: by the standalone gun on the felt (FeltGun.tsx), and
// — if the cowboy bodies are ever switched back on — by the held gun, which takes these
// world values and converts them into the hand bone it is parented to.

// Where a gun waits when nobody is aiming it: beside the cards in play, on its owner's
// right, within reach. Out from the seat by SEAT_GAP — the gap between a chair and the
// felt rim — and this much again onto the cloth, which lands it just outside the row of
// cards (those sit at 0.72-0.92 of the inner ring, about 0.37 further in).
const GUN_REST_IN = 0.3;
// And one card-slot to the owner's right, so it sits beside that row rather than on the
// line of it. Not much more, either: shifting a gun sideways spends the clearance to
// the next player's gun, which at a seven-seat table is only 2.16 across.
const GUN_REST_RIGHT = FELT_CARD_GAP * 1.5;
// The middle of the table is taken. DISCARD_X is the further of the two piles from the
// centre and a 0.72-scale card's half-diagonal is 0.39, so nothing may reach inside this.
const PILE_CLEAR = DISCARD_X + 0.39;
// And the felt runs out at its rim, so stop a finger short of it.
const GUN_REST_EDGE = 0.05;

const UP = new THREE.Vector3(0, 1, 0);
const SPIN = new THREE.Quaternion();

export interface FeltGunPlacement {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: number;
}

export function feltGunPlacement(
  spec: GunSpec,
  seat: [number, number, number],
  face: number
): FeltGunPlacement {
  const scale = spec.heldLen / spec.modelLen; // the gun's size in world units
  const felt = Math.hypot(seat[0], seat[2]) - SEAT_GAP; // the seat is SEAT_GAP past the rim
  // Measured from the middle of the table, not straight out from the seat: sitting
  // GUN_REST_RIGHT off to one side puts every end of the gun on a longer diagonal than the
  // seat's own line, which is enough on its own to hang a Winchester over the rim.
  const edge = felt - GUN_REST_EDGE;
  // ALWAYS lengthwise, muzzle towards the middle — the way the cards in play point, so the
  // gun reads as part of that row rather than laid over it.
  //
  // A long gun used to swing round and lie ACROSS instead, because lengthwise it does not
  // fit: laid that way it spends the table's RADIUS, and the clear strip between the centre
  // piles and the rim is 1.73 wide at seven seats and 1.33 at four, against a Winchester's
  // 1.91. So something has to give, and lying across was the wrong thing to give up — one
  // gun square to every other gun on the cloth reads as a mistake rather than as a rifle.
  //
  // What gives instead: the muzzle stops at PILE_CLEAR and the BUTT is allowed past the rim.
  // A rifle butt overhanging a table edge is a thing that happens; a muzzle lying over the
  // discard pile is not. Only the Winchester is long enough to reach that clamp, and there
  // is exactly one in the deck.
  const side = GUN_REST_RIGHT;
  // Muzzle at PILE_CLEAR means a radial reach of sqrt(PILE_CLEAR² - side²), since the gun
  // sits `side` off the seat's own line; the gun's centre is half a gun further out again.
  const clear = Math.sqrt(Math.max(0, PILE_CLEAR ** 2 - side ** 2)) + spec.heldLen / 2;
  // Otherwise sit just inside the rim, and never closer in than GUN_REST_IN so a short gun
  // still comes out far enough to be beside the cards rather than under the seat.
  const rim = felt - Math.sqrt(edge ** 2 - side ** 2) + spec.heldLen / 2;
  const out = SEAT_GAP + Math.min(felt - clear, Math.max(GUN_REST_IN, rim));
  // A figure looks down its own +z, so turned by `face` its forward is (sin, cos) and its
  // right is (-cos, sin).
  const position = new THREE.Vector3(
    seat[0] + Math.sin(face) * out - Math.cos(face) * GUN_REST_RIGHT,
    FELT_Y + spec.drop * scale,
    seat[2] + Math.cos(face) * out + Math.sin(face) * GUN_REST_RIGHT
  );
  // feltQuat leaves the barrel along +x; the quarter turn off `face` swings it onto the
  // seat's own forward, which is what puts every gun on the table parallel to the row of
  // cards in front of its owner.
  const quaternion = feltQuat(spec)
    .clone()
    .premultiply(SPIN.setFromAxisAngle(UP, face - Math.PI / 2));
  return { position, quaternion, scale };
}
