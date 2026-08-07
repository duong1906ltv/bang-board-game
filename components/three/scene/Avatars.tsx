"use client";

// The seated players themselves, in two interchangeable looks: primitive blocks, or
// one of seven rigged CC0 bodies holding a revolver. Both put their head at
// AVATAR_HEAD_Y so nameplates, crosshairs and the shot camera work against either.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { AVATAR_HEAD_R, AVATAR_HEAD_Y, AVATAR_SHOULDER_Y, DISCARD_X, FELT_Y, FLOOR_Y, SEAT_GAP } from "./geometry";
import { CARD_H, CARD_W, CardMesh } from "../CardMesh";
import { Chair } from "./Furniture";
import { ModelSlot } from "./ModelSlot";
import { SHOT_DUR } from "./Gunfire";
import { REACH_DUR, REACH_BACK, REACH_GRAB, REACH_OUT } from "./Draw";
import { FELT_CARD_GAP } from "./Cards";
import { feltQuat, heldGun, type GunSpec } from "./guns";
import { personFor } from "./people";
import type { Look } from "@/lib/types";

// Flat star emblem — a Shape, so it sits flush on the hat with no depth.
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
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.6} metalness={0.3} />
    </mesh>
  );
}

function BlockAvatar({ position, color, dead, sheriff, faceAngle, models }: { position: [number, number, number]; color: string; dead?: boolean; sheriff?: boolean; faceAngle: number; models?: boolean }) {
  const shoulderY = AVATAR_SHOULDER_Y;
  // Torso stops just under the table rim and a barrel carries it down to the floor.
  // It used to be one cone running the whole way from the shoulders to FLOOR_Y —
  // 1.97 tall under a 0.30 head, so it read as a traffic cone, not a person. The
  // old code assumed the table edge hid its lower half, but seats sit at
  // felt + 0.45, well outside the table body, so the entire cone was on show.
  const hipY = -0.5;
  const bodyH = shoulderY - hipY;
  // Faces are NOT on the heads. A head sized to fit seven seats around a table is
  // ~35px tall on screen, and a face needs 70-100px to read — the two demands are
  // irreconcilable, and every fix (2x head, moved hat, billboarded disc) was a
  // patch on that same mismatch. Webcams used to go on the wall posters instead;
  // those are gone now, so no face is shown in the scene at all.
  const headR = AVATAR_HEAD_R;
  const headY = AVATAR_HEAD_Y;
  const brimY = headY + 0.1;
  const shirt = dead ? "#4a4a4a" : color;
  const skin = dead ? "#7a7a7a" : "#e8c39a";
  const shoulderR = 0.25;
  return (
    // The figure itself is radially symmetric — the arms are gone — but its chair is
    // not, so `faceAngle` still has to reach the seat below.
    <group position={position}>
      <Chair top={hipY} face={faceAngle} models={models} />
      {/* Torso. Shoulders are suggested by flaring the top of the column, not built
          from parts: the previous shoulder spheres, upper arms and hands did not
          actually join up — the hand floated 0.13 clear of the arm and the arm was
          tilted the wrong way, so instead of an arm you saw four loose balls. At a
          figure this small an arm carries no information worth five extra meshes. */}
      <mesh position={[0, hipY + bodyH / 2, 0]} castShadow>
        <cylinderGeometry args={[shoulderR * 1.12, shoulderR * 0.82, bodyH, 20]} />
        <meshStandardMaterial color={shirt} roughness={0.8} />
      </mesh>
      <mesh position={[0, headY, 0]} castShadow>
        <sphereGeometry args={[headR, 24, 24]} />
        <meshStandardMaterial color={skin} roughness={0.6} />
      </mesh>
      <group position={[0, brimY, 0]}>
        <CowboyHat color={color} sheriff={sheriff} />
      </group>
    </group>
  );
}

// Brim + crown, and a sheriff's star on top. Shared: the block avatar wears it at
// a fixed height, the modelled figure has it parented into its head bone. It also
// carries the player's colour on its band, and it is the only western thing six of
// the seven bodies are wearing.
function CowboyHat({ color, sheriff }: { color: string; sheriff?: boolean }) {
  return (
    <group>
      <mesh castShadow>
        <cylinderGeometry args={[0.27, 0.27, 0.02, 24]} />
        <meshStandardMaterial color="#6b4a24" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.06, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.16, 0.14, 24]} />
        <meshStandardMaterial color="#5a3a1c" roughness={0.85} />
      </mesh>
      {/* hat band in the player's colour */}
      <mesh position={[0, 0.015, 0]}>
        <cylinderGeometry args={[0.165, 0.175, 0.035, 24]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {sheriff && <SheriffStar radius={0.1} y={0.15} color="#f5c518" />}
    </group>
  );
}

// ─── Modelled figure ─────────────────────────────────────────────────────────
// Measured off the .glb by forward-kinematicsing the sitting clip at its settled frame,
// not eyeballed. Every one of these still holds now that there are seven bodies rather
// than one: they share a single skeleton, agreeing to within 0.0015 units — see people.ts.
const MODEL_HIP_Y = 1.102; // hip height in that pose — this is what the stool must meet
const MODEL_HIP_BACK = 0.601; // how far behind the origin the seat sits

// Scale to land the head bone exactly on AVATAR_HEAD_Y. That is the contract the whole
// scene is written against — nameplates, the crosshair, the shot camera's look-at, the
// bullet's hit point, the pivot a dying figure falls about — so it holds per figure, not
// on average: the women's sitting clip settles 0.155 lower, and at this scale that is
// 0.098 of world, two thirds of a head radius. Their crosshair would float over a parting.
//
// The stool has to follow, because the hip does not move with the head: both clips leave
// it at the same place in model units, so a body scaled up to match head height also
// wants its seat that much higher, or it sits through one measured for someone taller.
// The chair scales to whatever top it is given and keeps its feet on the floor, so the
// only visible consequence is saloon furniture that does not quite match.
function fitting(headY: number) {
  const scale = (AVATAR_HEAD_Y - FLOOR_Y) / headY;
  // The block avatar's stool top sits at -0.5, which the modelled figure would sink
  // straight through: with its feet on the floor its hips land here instead.
  return { scale, stoolTop: FLOOR_Y + MODEL_HIP_Y * scale, sitFwd: MODEL_HIP_BACK * scale };
}
const HAT_ON_HEAD = 0.3; // head bone sits at the base of the skull, so lift the hat
// TEMPORARILY OFF. The arm does not come up and the gun does not leave the felt; the
// figure still turns to face whoever it is shooting, and everything else — the camera
// cut, the muzzle flash, the reach for the deck — is untouched.
//
// One switch rather than deleted code, because none of the geometry below is suspect:
// the arm lands where it was measured to land. What is unresolved is WHEN it fires (see
// AIM_DEBUG — the camera aims by world position, the arm by a seat comparison, and the
// two disagree). Flip this back to true to restore the whole gesture.
const ARM_RAISE = false;

// How high the gun arm is carried and how straight it goes. Zero elevation is the arm
// square to the torso — the hand ends up level with its own shoulder joint. Not from a
// clip: the .glb has no aiming animation and the nearest ones leave the elbow at 75-102
// degrees and swung across the body, an arm tucked in rather than an arm pointing.
// Just below square to the torso. Level put the hand at 0.34 and the gun read high;
// past -12 it drops to 0.12, four hundredths off the cards lying on the felt, and gets
// lost in them again.
const AIM_ELEV = (-8 * Math.PI) / 180;
// Of full extension. 0.92 left the elbow at 133 degrees, which reads as a bent arm;
// this straightens it to 151 without locking it out.
const ARM_SLACK = 0.97;
// The male models' gun fist is 0.196 across against a 0.30 head — big enough to swallow
// a revolver, so it is taken in a little. Not a house style: those meshes have a chunkier
// RIGHT hand than left (0.0025 against 0.0017 raw), and this exists to bring the one that
// holds a gun back to the other. The female meshes are already even at 0.0017 both, which
// puts their gun hand 29% under a man's tuned fist before anything is applied — so they
// get no correction at all, and applying this to them would take a small hand and make it
// a doll's. Lives on the spec for that reason; see people.ts.
// The arm comes up over this — and now so does the gun, off the table and into the fist,
// so there is something to see and 0.18 was too quick to read it. Bounded above by the
// camera: a Bang! nobody answers fires as the cut starts, and SHOT_IN is 0.28, so the
// gun has to be in hand before the close shot arrives.
const AIM_IN = 0.24;
const AIM_OUT = 0.3; // and back down over this
// Matched to the camera cut, not chosen: SHOT_DUR is how long the cut spends looking
// at this, so a shorter hold drops the arm on screen.
const AIM_HOLD = SHOT_DUR;
// Firing to gun-back-on-the-cloth, for whoever has to know how long the shooter moves.
// The baked shadow map needs it: it used to reopen for a flat 1.1s, which stopped short
// of the arm coming down and froze a gun's shadow in mid-air, under a gun that was by
// then lying on the table.
export const GUN_STOW_SEC = AIM_HOLD + AIM_OUT;
// A long gun is not held out at arm's length: the butt comes back towards the shoulder,
// so the firing hand sits this far in front of the shoulder joint and the off hand goes
// forward onto the fore-end. Pushed out from 0.3 to straighten that arm, which trades a
// little of the tucked-in look for it.
const RIFLE_TUCK = 0.42;
// How much of the off arm's reach to spend. The fore-end is slid back down the barrel
// if it falls outside this, so a long gun never pulls an arm straight.
const OFF_ARM_SLACK = 0.88;

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

// ─── The hand of cards, carried in the left fist ─────────────────────────────
// Sized against the fist that holds it, the way the guns are: the LEFT fist measures
// 0.167, so a card a shade narrower than that reads as held rather than as a signboard
// being waved. This one is safe across all seven bodies — the left hand is the same size
// on every mesh, and only the right is corrected.
const HELD_CARD_W = 0.14;
// Cards pivot about the bottom edge in the fist, so the fan is ANGULAR — a held hand
// splays, it does not slide sideways. Per-card angle, and the total the fan may open to:
// past ~36 degrees the outer cards lie down towards the table instead of facing the
// owner. Beyond that the spread stops opening and the cards overlap further, the same
// way a real hand closes up as it grows.
const HELD_FAN_STEP = 0.16;
const HELD_FAN_MAX = 0.62;
// Where the fan is carried. This used to sit on the body's centreline, which is the one
// place a LEFT hand cannot go without crossing the chest: forward-kinematicsing the rig
// put the elbow at [0.31, -0.13, -0.10] — out sideways and BEHIND the shoulder — with the
// forearm running diagonally across the fan it was supposed to be presenting. Carried
// under its own shoulder instead (UpperArm.L measures x=0.285), lifted to the collarbone
// and pushed further out. Of the four placements measured, this is the only one no
// camera angle round the table has the torso in front of.
const HOLD_OUT = 0.42;
const HOLD_SIDE = 0.26;
const HOLD_Y = 0.46;
// The fan hangs off the wrist JOINT, because that is where the bone it is parented to
// has its origin. A card stands 0.196 tall and the hand measures 0.180 from wrist to
// fingertip, so left at the joint 92% of every card is buried inside the fist. Slide it
// half a hand along the fingers — bones in this rig run down their own local +Y, so this
// is a plain offset — and the cards come up out of the grip instead of through it.
const HOLD_PUSH = 0.09;
// Which way the elbow hangs while the fan is held. NOT straight down, which is what the
// IK assumes by default: forward-kinematicsing the sitting pose puts this arm's full
// reach at 1.125 and the fan target only 0.504 from the shoulder — 45% of it — so the arm
// has to fold hard, and a down-pole at that fold lands the elbow at y=-0.10, inside the
// figure's own thigh and below the table top. Two meshes in the same space is what threw
// the shards across the screen, and the arm read as wrung out.
//
// Tilted out from the body by this much, the elbow comes to [0.50, -0.03, 0.07] — clear
// of the hip, arm still closed on the chest the way someone actually holds cards. 50°
// pushes it further out to a chicken wing, which is a look rather than a fix.
const ELBOW_OUT = (30 * Math.PI) / 180;
const ELBOW_DOWN_K = Math.cos(ELBOW_OUT);
const ELBOW_OUT_K = Math.sin(ELBOW_OUT);
// How far the fingers close on it. Nothing to measure against — the file has no grip
// clip — but the rig bounds it: ONE bone drives all four fingers, so this is a
// whole-hand close, and much past this the block of fingers passes through the cards it
// is supposed to be holding.
const CURL = (55 * Math.PI) / 180;
const THUMB_CURL = (35 * Math.PI) / 180;

// TEMPORARY — delete with the effect that reads it. Same switch as guns.ts's ?guns.
const AIM_DEBUG = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("aim");

// TEMPORARY — delete once the stray shards are found. Add ?rig to the room URL.
//
// The hat, the gun and the fan of cards all hang off a BONE, and a bone's world scale
// here is ~64x (armature modelled at 100x, figure scaled by ~0.64). Each divides that
// back out, measured off the skeleton rather than written down. So a measurement that
// comes back as 1 instead of ~64 does not fail quietly — it hangs something 64 times too
// big on a bone: a Winchester 28 units long, or a hand of cards 8.9 across, on a table
// whose felt is 2.7. That is exactly the size of the shards crossing the screen, which
// is what this is here to confirm or rule out.
const RIG_DEBUG = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("rig");
const rigLog = (seat: number, what: string, ws: number, scale: number) => {
  if (!RIG_DEBUG) return;
  const bad = ws < 10; // anything but the ~64 the rig actually carries
  console.log(
    `[rig] ghế ${seat} ${what.padEnd(10)} ws.x=${ws.toFixed(3)} → scale=${scale.toFixed(5)}` +
      (bad ? "  ‼️ ĐO HỤT — vật này đang to gấp ~64 lần" : "")
  );
};

// How fast the body swivels towards whoever it is aiming at. Exponential, so this is
// a time constant, not a duration: ~85% of the way round in 0.34s, which lands inside
// the shot camera's 0.28s fly-in.
const TURN_RATE = 6;

// How far the figure tips towards the table to reach the deck.
//
// A lean is not decoration here, it is the only thing that makes the reach read. The
// arm cannot span the table and never could: the deck is 2.2 to 3.6 units from a seat
// depending on table size and where round it sits, against an arm of roughly 1, so
// solveArm clamps and the hand stops well short whatever target it is handed. What
// sells "reaching for the pile" is the body going after it.
//
// 8 degrees, not more: the rig pivots on the FLOOR under the chair, so the angle is
// multiplied by how high up the body you look. At 8° the head travels 0.30 in, the
// shoulder 0.27 and the waist 0.22, against 0.33 of clearance to the table body at
// felt+0.12 — and only the waist is low enough to collide with it at all. Measured:
// the waist first touches the table at 12.3°.
const REACH_LEAN = (8 * Math.PI) / 180;

const smoothstep = (x: number) => x * x * (3 - 2 * x);

// GLTFLoader strips dots from node names, so the rig's `MiddleHand.R` is only
// reachable as `MiddleHandR`. Looking it up by the name in the file returns
// undefined — which is how the revolver came to be attached to nobody.
function bone(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  const want = name.replace(/[.:/[\]]/g, "");
  let hit: THREE.Object3D | undefined;
  root.traverse((o) => {
    if (!hit && o.name === want) hit = o;
  });
  return hit;
}

// Scratch for the per-frame IK below. Module scope, not per call: this runs once per
// aiming figure per frame and every one of these would otherwise be garbage.
const FWD = new THREE.Vector3();
const SPARE_Q = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const V = Array.from({ length: 8 }, () => new THREE.Vector3());
// Kept out of the pool above: these are held across a call into solveArm, which reuses
// every slot in it.
const TARGET = new THREE.Vector3();
const ANCHOR = new THREE.Vector3();
const POLE_HINT = new THREE.Vector3();
const RIG_V = new THREE.Vector3(); // TEMPORARY — ?rig only
const Q = Array.from({ length: 3 }, () => new THREE.Quaternion());
const M = Array.from({ length: 2 }, () => new THREE.Matrix4());

// Rotate `b` so the direction `from` (in world space) ends up pointing along `to`,
// blended in by `w`. A bone's rotation is relative to its parent, so the world-space
// turn has to be conjugated into the parent's frame before it can be applied.
function swing(b: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, w: number) {
  if (from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12) return;
  Q[0].setFromUnitVectors(from.normalize(), to.normalize());
  b.parent?.getWorldQuaternion(Q[1]);
  Q[2].copy(Q[1]).invert().multiply(Q[0]).multiply(Q[1]);
  b.quaternion.premultiply(Q[0].identity().slerp(Q[2], w));
}

// Two-bone IK putting the gun hand out in front of the figure at AIM_Y, elbow hanging
// under it. Solved rather than animated: the .glb has no aiming clip, and the nearest
// ones (a punch, a clap) leave the elbow at 75-102 degrees and swung across the body —
// an arm tucked in, not an arm pointing. This lands it at 133 degrees, and because it
// touches only these two bones the head stays at 0.62, where every nameplate, crosshair
// and camera cut expects to find it.
// `poleHint` is which way the elbow hangs, in world space. It defaults to straight DOWN,
// which is right for an arm reaching out — and wrong for one folded up to the chest. See
// ELBOW_OUT: at the fan's distance the down-pole buries the elbow in the figure's own
// thigh, and two meshes sharing the same space is what the stray shards on screen are.
function solveArm(
  upper: THREE.Object3D,
  lower: THREE.Object3D,
  hand: THREE.Object3D,
  target: THREE.Vector3,
  w: number,
  poleHint?: THREE.Vector3
) {
  const [s, e, h, t, d, pole, ew, from] = V;
  upper.getWorldPosition(s);
  lower.getWorldPosition(e);
  hand.getWorldPosition(h);
  const l1 = s.distanceTo(e);
  const l2 = e.distanceTo(h);
  if (l1 < 1e-6 || l2 < 1e-6) return;
  t.copy(target);

  d.copy(t).sub(s);
  const len = Math.min(d.length(), (l1 + l2) * 0.999);
  if (len < 1e-6) return;
  d.normalize();
  // Law of cosines for the angle the upper arm makes with the line to the target; the
  // elbow then swings that far off it, towards whichever way is down.
  const a = Math.acos(THREE.MathUtils.clamp((l1 * l1 + len * len - l2 * l2) / (2 * l1 * len), -1, 1));
  const hang = poleHint ?? DOWN;
  pole.copy(hang).addScaledVector(d, -hang.dot(d));
  if (pole.lengthSq() < 1e-8) return;
  pole.normalize();
  ew.copy(s).addScaledVector(d, Math.cos(a) * l1).addScaledVector(pole, Math.sin(a) * l1);

  swing(upper, from.copy(e).sub(s), ew.sub(s), w);
  // getWorldPosition refreshes the ancestor chain, so these read the arm as the swing
  // above just left it.
  lower.getWorldPosition(e);
  hand.getWorldPosition(h);
  swing(lower, h.sub(e), t.sub(e), w);
}

// Reach for a point out in front of the figure at AIM_Y. `out` fixes how far — a rifle
// stops short so its butt can sit in the shoulder — and otherwise the arm goes as far
// as it can, which keeps the target inside its own reach by construction.
function aimArm(
  upper: THREE.Object3D,
  lower: THREE.Object3D,
  hand: THREE.Object3D,
  fwd: THREE.Vector3,
  w: number,
  out?: number
) {
  const [s, e, h] = V;
  upper.getWorldPosition(s);
  let reach = out;
  if (reach === undefined) {
    lower.getWorldPosition(e);
    hand.getWorldPosition(h);
    reach = (s.distanceTo(e) + e.distanceTo(h)) * ARM_SLACK;
  }
  TARGET.copy(s).addScaledVector(fwd, reach * Math.cos(AIM_ELEV));
  TARGET.y += reach * Math.sin(AIM_ELEV);
  solveArm(upper, lower, hand, TARGET, w);
}

// Point the gun and seat it in the fist. Computed every frame rather than baked into a
// constant: a revolver lines up with the forearm, a rifle points at the target while the
// hand holding it stays tucked — and a constant fitted to one pose was 73 degrees out
// the moment the pose changed.
function holdGun(
  gun: THREE.Object3D,
  hand: THREE.Object3D,
  elbow: THREE.Object3D | undefined,
  spec: GunSpec,
  k: number,
  fwd: THREE.Vector3,
  alongAim: boolean
) {
  const [aim, up, down, side, gb, gd, gs, tmp] = V;
  if (alongAim || !elbow) aim.copy(fwd);
  else {
    hand.getWorldPosition(aim);
    elbow.getWorldPosition(tmp);
    aim.sub(tmp);
  }
  if (aim.lengthSq() < 1e-12) return;
  aim.normalize();
  up.set(0, 1, 0).addScaledVector(aim, -aim.y);
  if (up.lengthSq() < 1e-8) return;
  up.normalize();
  down.copy(up).negate();
  side.crossVectors(aim, down);
  gb.fromArray(spec.barrel);
  gd.fromArray(spec.up).negate();
  gs.crossVectors(gb, gd);

  // Both frames are laid out the same way round — forward, sideways, down — so the map
  // from one to the other is a rotation even though neither is right-handed.
  M[0].makeBasis(aim, side, down);
  M[1].makeBasis(gb, gs, gd);
  Q[0].setFromRotationMatrix(M[0].multiply(M[1].transpose()));
  hand.getWorldQuaternion(Q[1]);
  gun.quaternion.copy(Q[1].invert().multiply(Q[0]));
  // The .glb's origin is on the frame, not in the grip, so pull it back by that much.
  gun.position.copy(tmp.fromArray(spec.grip)).multiplyScalar(-k).applyQuaternion(gun.quaternion);
}

// Back down onto the cloth. Nobody sits through a card game with a pistol in their fist,
// so the gun spends most of the round lying in front of its owner and is drawn up as the
// arm comes up — `w` is how much of the way back to the table it is.
//
// The resting pose is built in WORLD space and pulled into the hand's frame every frame,
// never stored as a fixed offset from the hand. That is what keeps a gun on the table
// standing still while the body under it swivels to face a target, leans in for the deck
// or rocks back from a hit — all of which move the bone it is parented to.
const REST_P = new THREE.Vector3();
const REST_Q = new THREE.Quaternion();
function restGun(
  gun: THREE.Object3D,
  hand: THREE.Object3D,
  spec: GunSpec,
  seat: [number, number, number],
  face: number,
  w: number
) {
  const s = spec.heldLen / spec.modelLen; // the gun's size in world units
  // Lengthwise, muzzle towards the middle — the way the cards in play point, so the gun
  // reads as part of that row rather than laid over it. Unless it will not fit: a gun
  // laid this way spends the table's RADIUS, and the strip of clear cloth between the
  // centre piles and the rim is only 1.19 wide at a two-player table. The long guns go
  // back to lying across there, which spends the circumference instead.
  const felt = Math.hypot(seat[0], seat[2]) - SEAT_GAP; // the seat is SEAT_GAP past the rim
  // Measured from the middle of the table, not straight out from the seat. Sitting
  // GUN_REST_RIGHT off to one side puts every end of the gun on a longer diagonal than
  // the seat's own line, which is enough on its own to hang a Winchester over the rim.
  const edge = felt - GUN_REST_EDGE;
  const along = spec.heldLen <= Math.sqrt(edge ** 2 - GUN_REST_RIGHT ** 2) - PILE_CLEAR;
  // Its far corner is half a gun further out on the seat's line when it lies lengthwise,
  // and half a gun further sideways when it lies across. Either way that corner is what
  // has to stay inside the rim, so it is what sets how far onto the cloth the gun goes —
  // subject to a floor, so a short gun still comes out far enough to be beside the cards.
  const side = GUN_REST_RIGHT + (along ? 0 : spec.heldLen / 2);
  const out = SEAT_GAP + Math.max(GUN_REST_IN, felt - Math.sqrt(edge ** 2 - side ** 2) + (along ? spec.heldLen / 2 : 0));
  // A figure looks down its own +z, so turned by `face` its forward is (sin, cos). Its
  // RIGHT is local -x, not +x: the rig puts every .R bone at negative x and every .L
  // bone at positive x, which is what a right-handed frame facing +z with +y up gives.
  // Turned by `face` that direction is (-cos, sin).
  REST_P.set(
    seat[0] + Math.sin(face) * out - Math.cos(face) * GUN_REST_RIGHT,
    FELT_Y + spec.drop * s,
    seat[2] + Math.cos(face) * out + Math.sin(face) * GUN_REST_RIGHT
  );
  hand.worldToLocal(REST_P);
  // feltQuat leaves the barrel along +x; the quarter turn off `face` swings it onto the
  // seat's own forward.
  REST_Q.copy(feltQuat(spec)).premultiply(Q[0].setFromAxisAngle(UP, along ? face - Math.PI / 2 : face));
  REST_Q.premultiply(hand.getWorldQuaternion(Q[1]).invert());
  gun.position.lerp(REST_P, w);
  gun.quaternion.slerp(REST_Q, w);
}

// Close a finger chain by `radians`, rotating it towards `toward` rather than about a
// hardcoded axis. Sign-free by construction: curling always brings a fingertip back
// towards the arm, so aiming at the elbow can only ever bend the hand the right way —
// and the two hands are not built alike (Thumb1.L hangs off Palm.L, Thumb1.R off
// MiddleHand.R), so anything axis-based would have to be written twice and mirrored.
const F = Array.from({ length: 3 }, () => new THREE.Vector3());
function curlToward(b: THREE.Object3D, tip: THREE.Object3D, toward: THREE.Object3D, radians: number) {
  const [base, out, back] = F;
  b.getWorldPosition(base);
  tip.getWorldPosition(out);
  out.sub(base);
  toward.getWorldPosition(back);
  back.sub(base);
  if (out.lengthSq() < 1e-12 || back.lengthSq() < 1e-12) return;
  out.normalize();
  back.normalize();
  const full = out.angleTo(back);
  if (full < 1e-6) return;
  // swing() blends identity -> the full turn, so a fraction of the way there is exactly
  // `radians` along the same path.
  swing(b, out, back, Math.min(1, radians / full));
}

// A hand of cards is held, not welded at a fixed angle. The palm's frame is read off
// the skeleton every frame the same way holdGun reads the gun's, so the fan follows the
// fist through the sitting pose, the reach for the deck and the lean, instead of
// drifting off it the moment anything moves.
//
// Derived, never hardcoded: every bone in this rig points along its own local +Y, so the
// finger direction is measurable, and the thumb gives the second axis. Their cross
// product is the palm normal, which is where the backs of the cards face.
const C = Array.from({ length: 4 }, () => new THREE.Vector3());
const C_BASIS = new THREE.Matrix4();
const C_Q = new THREE.Quaternion();
function holdCards(
  fan: THREE.Object3D,
  hand: THREE.Object3D,
  fingerTip: THREE.Object3D,
  thumbTip: THREE.Object3D
) {
  const [up, thumb, normal, side] = C;
  hand.getWorldPosition(up);
  fingerTip.getWorldPosition(side);
  up.subVectors(side, up); // wrist -> fingertips
  hand.getWorldPosition(thumb);
  thumbTip.getWorldPosition(side);
  thumb.subVectors(side, thumb);
  if (up.lengthSq() < 1e-12 || thumb.lengthSq() < 1e-12) return;
  up.normalize();
  normal.crossVectors(up, thumb.normalize());
  if (normal.lengthSq() < 1e-12) return; // thumb folded flat along the fingers
  normal.normalize();
  // The palm settles which way the cards FACE. It does not settle which way is up on
  // them: solveArm swings the upper and lower arm and never touches the wrist, so the
  // roll is whatever the sitting clip happened to leave — measured 57 degrees off vertical,
  // a hand of cards lying sideways across the chest. So take the long axis from the
  // world instead, projected into the card plane, and the fan stands up no matter what
  // the wrist is doing. This also re-squares the basis, which the thumb could not: it
  // sits only 10 degrees off the fingers, so a `side` built from it comes out sheared.
  up.set(0, 1, 0).addScaledVector(normal, -normal.y);
  if (up.lengthSq() < 1e-6) return; // palm flat to the sky; keep last frame's angle
  up.normalize();
  side.crossVectors(up, normal);
  // Card planes face +z with +y up, so (side, up, normal) maps their frame onto the palm.
  C_BASIS.makeBasis(side, up, normal);
  C_Q.setFromRotationMatrix(C_BASIS);
  fan.quaternion.copy(hand.getWorldQuaternion(Q[0]).invert().multiply(C_Q));
}

// The cards themselves, splayed about their bottom edge — a held hand fans, it does not
// slide sideways. Authored in CardMesh's own units; the group above scales the lot down
// into the fist.
//
// The spread stops opening at HELD_FAN_MAX and the cards overlap further instead, the
// same way the felt fan used to and the same way a real hand does. Past ~36 degrees the
// outer cards lie down towards the table rather than facing their owner.
function HeldFan({ count }: { count: number }) {
  const n = Math.max(0, count);
  const step = Math.min(HELD_FAN_STEP, HELD_FAN_MAX / Math.max(1, n - 1));
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <group key={i} rotation={[0, 0, (i - (n - 1) / 2) * step]}>
          {/* Pushed up by half a card so the pivot is the bottom edge, in the fist —
              and forward by a hair per card, which is what keeps coplanar neighbours
              out of each other's depth. */}
          <CardMesh faceDown position={[0, CARD_H / 2, i * 0.01]} />
        </group>
      ))}
    </>
  );
}

// The off hand onto the fore-end, sliding back down the barrel if the far end is out
// of reach — a long gun must never pull an arm straight.
function reachFore(
  upper: THREE.Object3D,
  lower: THREE.Object3D,
  hand: THREE.Object3D,
  gun: THREE.Object3D,
  spec: GunSpec,
  k: number,
  w: number
) {
  if (!spec.fore) return;
  const [s, e, h] = V;
  gun.updateMatrixWorld(true);
  gun.localToWorld(TARGET.fromArray(spec.fore).multiplyScalar(k));
  gun.localToWorld(ANCHOR.fromArray(spec.grip).multiplyScalar(k));
  upper.getWorldPosition(s);
  lower.getWorldPosition(e);
  hand.getWorldPosition(h);
  const span = (s.distanceTo(e) + e.distanceTo(h)) * OFF_ARM_SLACK;
  const far = s.distanceTo(TARGET);
  if (far > span)
    TARGET.lerp(ANCHOR, Math.min(1, (far - span) / Math.max(far - s.distanceTo(ANCHOR), 1e-6)));
  solveArm(upper, lower, hand, TARGET, w);
}

function PersonModel({
  position,
  color,
  dead,
  sheriff,
  faceAngle,
  firingKey,
  aiming,
  aimAt,
  reachKey,
  reachAt,
  handCount,
  equipment,
  seat,
  character,
  look,
}: {
  position: [number, number, number];
  color: string;
  dead?: boolean;
  sheriff?: boolean;
  faceAngle: number;
  firingKey?: number | null;
  aiming?: boolean;
  aimAt?: THREE.Vector3 | null;
  reachKey?: number | null;
  reachAt?: THREE.Vector3 | null;
  handCount: number;
  equipment: { defId: string }[];
  seat: number;
  character: string | null;
  look?: Look;
}) {
  const person = personFor(character, seat, look);
  const fit = fitting(person.headY);
  const { scene } = useGLTF(person.url);
  // Usually a different file from the mesh: five of the seven bodies ship with no
  // animation of their own and borrow it from whichever of the two carriers matches.
  const { animations } = useGLTF(person.clips);
  // A module-level singleton per weapon, so this is a stable dependency even though
  // `equipment` is a fresh array on every broadcast.
  const spec = heldGun(equipment, seat);
  const held = useGLTF(spec.url);
  const rig = useRef<THREE.Group>(null);
  const hatRef = useRef<THREE.Group>(null);
  const cardsRef = useRef<THREE.Group>(null);

  // SkeletonUtils, not scene.clone(): a plain clone shares the original skeleton,
  // so all seven players would animate as one.
  const body = useMemo(() => SkeletonUtils.clone(scene) as THREE.Group, [scene]);
  // castShadow is set here and nowhere else: the body gets it in the shirt pass below,
  // but this clone is built straight from useGLTF rather than through <Model>, so it was
  // the one thing on the table casting nothing — which is exactly why a gun lying on the
  // cloth read as hovering over it.
  const gun = useMemo(() => {
    const g = held.scene.clone(true);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    return g;
  }, [held.scene]);
  const arms = useMemo(
    () => ({
      r: [bone(body, "UpperArm.R"), bone(body, "LowerArm.R"), bone(body, "MiddleHand.R")] as const,
      l: [bone(body, "UpperArm.L"), bone(body, "LowerArm.L"), bone(body, "MiddleHand.L")] as const,
    }),
    [body]
  );
  // The card hand's own bones, looked up once. `bone` walks the whole skeleton, and the
  // frame loop wants four of these per figure — at a full table that is 28 traversals a
  // frame for names that never change.
  const grip = useMemo(
    () => ({
      fingers: bone(body, "Fingers.L"),
      fingerTip: bone(body, "Fingers.L_end"),
      thumb: bone(body, "Thumb1.L"),
      thumbTip: bone(body, "Thumb2.L_end"),
    }),
    [body]
  );
  // Rooted on `body`, not on the `rig` ref. drei only hands out an action once its
  // root is non-null, and a ref is null until React commits — so an effect that asks
  // one render too early silently gets nothing, plays nothing, and never asks again,
  // because its deps never change. Nothing playing means the bind pose, and the bind
  // pose is STANDING. `body` exists during render, so there is no such window.
  const { actions } = useAnimations(animations, body);

  // Only the shirt is recoloured, so only the shirt is cloned — SkeletonUtils.clone
  // shares materials with the loaded scene, and cloning all six would be 35 needless
  // materials at a full table. Cloned once, so a tint can never compound.
  //
  // And it stays: with four male bodies and up to seven male characters at one table,
  // two players WILL be wearing the same model, and then the tint is the only thing
  // telling them apart. The model carries the variety the tint cannot — build, hair,
  // skin, trousers, boots — rather than replacing it.
  const shirts = useMemo(() => {
    const own: THREE.MeshStandardMaterial[] = [];
    body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      m.castShadow = true;
      if (m.material.name !== person.shirt) return;
      const c = (m.material as THREE.MeshStandardMaterial).clone();
      m.material = c;
      own.push(c);
    });
    return own;
  }, [body, person.shirt]);
  useEffect(() => {
    for (const m of shirts) m.color.set(color);
  }, [shirts, color]);
  useEffect(() => () => shirts.forEach((m) => m.dispose()), [shirts]);

  // Gun and hat hang off bones, so they follow the animation instead of drifting
  // when the arm comes up. Both are authored in scene units, and a bone's world
  // scale here is ~64x (the armature is modelled at 100x, then we scale by ~0.64),
  // so each gets that measured scale divided back out rather than a magic number.
  //
  // Only scale and parentage here — where the gun points is set per frame below,
  // because a rifle points at the target while the hand that holds it stays tucked.
  const gunK = useRef(1);
  const rigT = useRef(0); // TEMPORARY — ?rig only, see the size check in the frame loop
  useEffect(() => {
    const hand = arms.r[2];
    if (!hand || dead) return;
    hand.scale.setScalar(person.handScale);
    rig.current?.updateWorldMatrix(true, true);
    const ws = new THREE.Vector3();
    // Read AFTER the fist is taken in, so shrinking the hand does not shrink the gun
    // with it — the divide below is what keeps the gun at its own measured length.
    hand.getWorldScale(ws);
    gunK.current = spec.heldLen / spec.modelLen / Math.max(ws.x, 1e-6);
    gun.scale.setScalar(gunK.current);
    rigLog(seat, `súng ${spec.url.split("/").pop()}`, ws.x, gunK.current);
    hand.add(gun);
    return () => {
      hand.remove(gun);
    };
  }, [arms, gun, spec, dead, person.handScale]);

  useEffect(() => {
    const head = bone(body, "Head");
    const hat = hatRef.current;
    if (!head || !hat) return;
    rig.current?.updateWorldMatrix(true, true);
    const ws = new THREE.Vector3();
    head.getWorldScale(ws);
    hat.scale.setScalar(1 / Math.max(ws.x, 1e-6));
    rigLog(seat, "nón", ws.x, hat.scale.x);
    head.add(hat);
    return () => {
      head.remove(hat);
    };
    // `seat` is for the debug line only and never changes for a mounted figure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

  // The hand of cards, into the left fist — same trick as the hat and the gun. Its
  // children are authored in CardMesh's own world units (a card is CARD_W across), so
  // the scale converts those to HELD_CARD_W and then divides out the bone's ~64x world
  // scale, which comes from the armature being modelled at 100x.
  useEffect(() => {
    const hand = arms.l[2];
    const fan = cardsRef.current;
    if (!hand || !fan) return;
    rig.current?.updateWorldMatrix(true, true);
    const ws = new THREE.Vector3();
    hand.getWorldScale(ws);
    const k = 1 / Math.max(ws.x, 1e-6);
    fan.scale.setScalar((HELD_CARD_W / CARD_W) * k);
    // Along the bone, i.e. down the fingers, into the middle of the fist. holdCards only
    // ever writes the quaternion, so this survives every frame after it.
    fan.position.set(0, HOLD_PUSH * k, 0);
    rigLog(seat, "quạt bài", ws.x, fan.scale.x);
    hand.add(fan);
    return () => {
      hand.remove(fan);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arms]);

  // Base pose. The sitting clip opens with the act of sitting down, which would replay
  // every time the component remounts, so it starts from where that has finished.
  //
  // Matched on the suffix alone: the pack names its clips for the body that came with
  // them, so the same motion is "Man_Sitting" on the men and "Female_Sitting" on the
  // women. Which one is playing is decided by people.ts handing over the right file.
  useEffect(() => {
    const name = Object.keys(actions).find((k) => k.endsWith(dead ? "_Death" : "_Sitting"));
    const a = name ? actions[name] : null;
    if (!a) return;
    a.reset();
    // Both of these are one-shot poses, NOT loops. The sitting clip opens with the act
    // of sitting DOWN — head at y=4.21 standing, settling to 3.40 seated — so
    // looping it makes everyone stand up and sit back down every 8.3 seconds. It
    // starts past that move and clamps on the final seated frame instead.
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    // Straight to the LAST frame, which is the pose that then holds. It used to park at
    // 3.0s, chosen as "where the sitting-down move ends" — but the clip runs 8.33s, so
    // the figure went on shifting for another five seconds after it appeared (the
    // shoulder travels 0.03 over that stretch) before finally settling. Read off the
    // action rather than written down, because the men's and women's clips differ.
    if (!dead) a.time = a.getClip().duration;
    // Full weight at once, NOT faded in. Whatever weight the pose is missing the mixer
    // fills from the bind pose, and the bind pose is standing: a 0.3s fade is 0.3s of
    // standing up out of the chair on every mount (head 4.18 -> 3.40, measured). There
    // is nothing to ease from anyway — this is where the figure already is.
    a.play();
    return () => {
      a.fadeOut(0.2);
    };
  }, [actions, dead]);

  // A shot puts the arm up; an unanswered Bang! keeps it there. Firing at someone who
  // has nothing to answer with opens no pending at all, so that case comes down on a
  // timer instead — one that outlasts the camera cut, or the arm drops while the cut
  // is still looking at it.
  const [justFired, setJustFired] = useState(false);
  useEffect(() => {
    if (firingKey == null) return;
    setJustFired(true);
    const id = setTimeout(() => setJustFired(false), AIM_HOLD * 1000);
    return () => clearTimeout(id);
  }, [firingKey]);
  // Still means "is this figure holding a shot on someone", which is what the body turns
  // on. Whether the ARM answers it is a separate question — see ARM_RAISE.
  const armUp = (justFired || !!aiming) && !dead;
  const armLifts = ARM_RAISE && armUp;

  // The reach runs off its own clock rather than a boolean, because it is three moves
  // (out, hold over the pile, back) and the cards in Draw.tsx are timed against the
  // same phases. -1 is idle; a new `reachKey` restarts it from zero.
  const reachT = useRef(-1);
  useEffect(() => {
    if (reachKey == null) return;
    reachT.current = 0;
  }, [reachKey]);

  // Turning to face the target is animated here rather than set as a `rotation` prop:
  // r3f would re-apply the prop on every broadcast and fight this for the same value,
  // and a body that teleports through 90 degrees reads as a glitch either way. Inside
  // the rig group, so the figure swivels and its stool stays put.
  //
  // Tied to the arm, not to the standoff: a figure that has not turned aims at the
  // middle of the table no matter who it is shooting.
  //
  // Runs after drei's mixer — it registers its own useFrame inside useAnimations, which
  // is called above this one — so the IK writes over the animated arm rather than being
  // overwritten by it.
  const turned = useRef(false);
  const aimW = useRef(0);

  // TEMPORARY — delete this effect once the arm is fixed. Add ?aim to the room URL and
  // every figure reports the four values the gun arm runs on, then samples the weight
  // for two seconds. The camera cut and the muzzle flash aim by world POSITION, the arm
  // by a seat COMPARISON, and that is the only place the two paths differ — so this
  // prints both sides of that comparison.
  useEffect(() => {
    if (!AIM_DEBUG) return;
    console.log(
      `[aim] ghế ${seat}: firingKey=${firingKey} aiming=${aiming} dead=${dead} armUp=${armUp}`
    );
    if (firingKey == null) return;
    const t = setInterval(() => console.log(`[aim] ghế ${seat}: w=${aimW.current.toFixed(2)}`), 200);
    const stop = setTimeout(() => clearInterval(t), 2200);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [firingKey, aiming, dead, armUp, seat]);

  useFrame((_, dt) => {
    const g = rig.current;
    if (!g) return;
    arms.r[2]?.scale.setScalar(person.handScale); // the mixer owns this bone; take it back

    // Reaching. Out, hold, back — smoothstepped at both ends so the arm does not start
    // and stop at full speed. Resolved BEFORE the turn below, because the body has to
    // know it is reaching in order to turn towards what it is reaching for.
    let rw = 0;
    if (reachT.current >= 0) {
      reachT.current += dt;
      const rt = reachT.current;
      if (rt >= REACH_DUR) reachT.current = -1;
      else if (rt < REACH_OUT) rw = smoothstep(rt / REACH_OUT);
      else if (rt < REACH_OUT + REACH_GRAB) rw = 1;
      else rw = 1 - smoothstep((rt - REACH_OUT - REACH_GRAB) / REACH_BACK);
    }
    // Never both: a figure holding an unanswered Bang! has business more urgent than a
    // card, and the two poses would fight over the same body.
    if (armLifts) rw = 0;

    // Square up to whatever the body is dealing with — the person being shot at, or the
    // cards being reached for. The reach case is not cosmetic: another player's cards sit
    // up to 68 degrees off a seat's own forward, and without the turn the arm swings
    // across the chest instead of going out in front. It also carries information, now
    // that nothing is drawn travelling: who a figure turns to IS where the card went.
    const facing = armUp && aimAt ? aimAt : rw > 0 && reachAt ? reachAt : null;
    const want = facing ? Math.atan2(facing.x - position[0], facing.z - position[2]) : faceAngle;
    if (!turned.current) {
      // YXZ so the lean below is applied AFTER the facing turn, i.e. about the body's
      // own sideways axis. In the default XYZ order the same rotation.x tips the figure
      // about the WORLD x axis, which throws seats sideways off their chairs by however
      // far round the table they sit.
      g.rotation.order = "YXZ";
      g.rotation.y = want;
      turned.current = true;
    } else {
      const d = THREE.MathUtils.euclideanModulo(want - g.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      g.rotation.y += d * Math.min(1, dt * TURN_RATE);
    }
    g.rotation.x = REACH_LEAN * rw;

    aimW.current = THREE.MathUtils.clamp(aimW.current + (armLifts ? dt / AIM_IN : -dt / AIM_OUT), 0, 1);
    const [ru, rl, rh] = arms.r;
    if (!ru || !rl || !rh) return;
    const w = aimW.current;
    FWD.set(0, 0, 1).applyQuaternion(g.getWorldQuaternion(SPARE_Q));

    if (w > 0) {
      // A revolver goes out at arm's length; a rifle's butt goes into the shoulder, so
      // its firing hand stops short and the off hand carries the far end.
      aimArm(ru, rl, rh, FWD, w, spec.fore ? RIFLE_TUCK : undefined);
    }
    // The bones have just been moved by the mixer and by the IK above, but the matrices
    // built from them are still last frame's — and both of the calls below read the
    // hand's world transform. One frame of lag is invisible on a hanging arm and very
    // visible on a gun that is supposed to be lying still on the table while its owner
    // swivels, so bring the subtree up to date first.
    g.updateWorldMatrix(false, true);
    // Every frame, not only while aiming: skipping this once the arm is down leaves the
    // gun frozen in its last aimed direction, sticking out horizontally from the hip.
    holdGun(gun, rh, rl, spec, gunK.current, FWD, !!spec.fore && w > 0.5);
    // ...and then most of the way back down onto the cloth, unless the arm is up.
    if (w < 1) restGun(gun, rh, spec, position, faceAngle, 1 - w);

    // TEMPORARY — ?rig only. Everything hung off a bone can only go wrong in one of two
    // ways, and both show up here: the wrong SIZE (a scale measured against a stale bone
    // matrix), or a NaN transform. NaN is worth its own line because it never heals —
    // restGun puts the gun back with position.lerp, and lerping out of NaN gives NaN
    // again, so one bad frame leaves that mesh strewn across the room for good.
    // On a one-second timer: this decomposes a matrix per figure.
    if (RIG_DEBUG) {
      rigT.current += dt;
      if (rigT.current > 1) {
        rigT.current = 0;
        gun.getWorldScale(RIG_V);
        const len = RIG_V.x * spec.modelLen;
        const nan = !Number.isFinite(gun.position.x) || !Number.isFinite(gun.quaternion.x);
        if (nan || len > spec.heldLen * 2 || len < spec.heldLen / 2) {
          console.warn(
            `[rig] ghế ${seat}: súng đang dài ${len.toFixed(2)} (phải là ${spec.heldLen})` +
              (nan ? " — VÀ toạ độ/hướng là NaN" : "")
          );
        }
        const fanScale = cardsRef.current?.scale.x ?? 0;
        if (fanScale > (HELD_CARD_W / CARD_W) * 0.1) {
          console.warn(`[rig] ghế ${seat}: quạt bài scale=${fanScale.toFixed(4)} — to gấp ~64 lần`);
        }
      }
    }
    // The RIGHT arm reaches for cards, the same one that picks the gun up. That is the
    // split a person uses — you hold your hand in the off hand and work with the other —
    // and it is only available because restGun leaves this fist empty between shots.
    // Solved to the pile's real position rather than a forward pose, so the hand tracks
    // it as the body leans; solveArm clamps the target back inside the arm's own reach,
    // which is what turns "point at the deck" into "fully extended towards it".
    if (rw > 0 && reachAt) solveArm(ru, rl, rh, reachAt, rw);

    const [lu, ll, lh] = arms.l;
    if (!lu || !ll || !lh) return;
    if (w > 0 && spec.fore) reachFore(lu, ll, lh, gun, spec, gunK.current, w);

    // The off hand carries the cards — except on a long gun, where it is out on the
    // fore-end and the fan would be dragged along the barrel with it.
    const fan = cardsRef.current;
    const busy = w > 0 && !!spec.fore;
    if (fan) fan.visible = handCount > 0 && !busy && !dead;
    if (!fan?.visible) return;
    // Carried in front of its own shoulder, not the middle of the chest. Solved to a
    // world point like everything else here, so the fan stays put relative to the table
    // while the body swivels. Facing yaw, forward is (sin, cos) and the figure's own
    // left — the side this hand is on — is (cos, -sin).
    const fx = Math.sin(g.rotation.y);
    const fz = Math.cos(g.rotation.y);
    TARGET.set(
      position[0] + fx * HOLD_OUT + fz * HOLD_SIDE,
      HOLD_Y,
      position[2] + fz * HOLD_OUT - fx * HOLD_SIDE
    );
    // Down, tilted out along the body's own left — the side this arm is on. A figure
    // facing `yaw` has its local +x at (cos yaw, 0, -sin yaw), which is what fz/-fx are.
    POLE_HINT.set(fz * ELBOW_OUT_K, -ELBOW_DOWN_K, -fx * ELBOW_OUT_K);
    solveArm(lu, ll, lh, TARGET, 1, POLE_HINT);
    // Fingers close on it, and the thumb comes over the front. Written EVERY frame, not
    // once: the sitting clip drives five finger channels of its own, so the mixer would take
    // the hand straight back open.
    const { fingers, fingerTip, thumb, thumbTip } = grip;
    if (fingers && fingerTip) curlToward(fingers, fingerTip, ll, CURL);
    if (thumb && thumbTip && fingers) curlToward(thumb, thumbTip, fingers, THUMB_CURL);
    // Read after the curl so the fan sits in the fist the fingers just made.
    g.updateWorldMatrix(false, true);
    if (fingerTip && thumbTip) holdCards(fan, lh, fingerTip, thumbTip);
  });

  return (
    <group position={position}>
      <Chair top={fit.stoolTop} face={faceAngle} models />
      <group ref={rig} position={[0, FLOOR_Y, 0]}>
        <group position={[0, 0, fit.sitFwd]} scale={fit.scale}>
          <primitive object={body} />
        </group>
      </group>
      {/* Parented into the head bone by the effect above; rendered here so it is
          still declarative React rather than meshes built by hand. */}
      <group ref={hatRef}>
        <group position={[0, HAT_ON_HEAD, 0]}>
          <CowboyHat color={dead ? "#4a4a4a" : color} sheriff={sheriff} />
        </group>
      </group>
      {/* Same again for the hand of cards — parented into the left fist per frame by
          holdCards, written here so it stays ordinary React. */}
      <group ref={cardsRef}>
        <HeldFan count={handCount} />
      </group>
    </group>
  );
}

// One seated player. `models` picks the look; everything outside this component —
// nameplates, crosshairs, the shot camera — anchors on AVATAR_HEAD_Y either way,
// which is exactly why the model is scaled to put its head there.
export function Avatar({
  position,
  color,
  dead,
  sheriff,
  faceAngle,
  firingKey,
  aiming,
  aimAt,
  reachKey,
  reachAt,
  handCount,
  equipment,
  seat,
  character,
  look,
  models,
}: {
  position: [number, number, number];
  color: string;
  dead?: boolean;
  sheriff?: boolean;
  faceAngle: number;
  firingKey?: number | null;
  aiming?: boolean; // holding an unanswered Bang! on someone — the block look has no arms to do it with
  aimAt?: THREE.Vector3 | null; // whose way to turn while the gun is up
  // This seat just reached for a card: out over the felt, or across at another player.
  // Modelled figures only — the block look has no arms to do it with.
  reachKey?: number | null;
  reachAt?: THREE.Vector3 | null; // what the hand goes for, in world space
  // How many cards to fan into the left fist. Modelled figures only — the block look
  // has no hands to put them in, so it holds nothing.
  handCount?: number;
  equipment?: { defId: string }[]; // what is in play in front of them, for the weapon
  seat: number;
  // Which of the seven bodies sits here. The character's id, not the player's: the
  // body belongs to Calamity Janet, not to whoever drew her — unless the player asked
  // for one at the name box, which `look` carries and which wins.
  character?: string | null;
  look?: Look;
  models?: boolean;
}) {
  const blocks = <BlockAvatar position={position} color={color} dead={dead} sheriff={sheriff} faceAngle={faceAngle} models={models} />;
  return (
    <ModelSlot enabled={models} fallback={blocks}>
      <PersonModel
        position={position}
        color={color}
        dead={dead}
        sheriff={sheriff}
        faceAngle={faceAngle}
        firingKey={firingKey}
        aiming={aiming}
        aimAt={aimAt}
        reachKey={reachKey}
        reachAt={reachAt}
        handCount={handCount ?? 0}
        equipment={equipment ?? []}
        seat={seat}
        character={character ?? null}
        look={look}
      />
    </ModelSlot>
  );
}


export function Tombstone({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* mound base */}
      <mesh position={[0, 0.05, 0.02]} castShadow receiveShadow>
        <boxGeometry args={[0.46, 0.1, 0.22]} />
        <meshStandardMaterial color="#4f4a45" roughness={1} />
      </mesh>
      {/* slab */}
      <mesh position={[0, 0.34, 0]} castShadow>
        <boxGeometry args={[0.34, 0.5, 0.09]} />
        <meshStandardMaterial color="#8d8880" roughness={0.95} />
      </mesh>
      {/* rounded top */}
      <mesh position={[0, 0.59, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.17, 0.09, 20]} />
        <meshStandardMaterial color="#8d8880" roughness={0.95} />
      </mesh>
      {/* carved cross (R.I.P.) */}
      <mesh position={[0, 0.44, 0.05]}>
        <boxGeometry args={[0.05, 0.22, 0.02]} />
        <meshStandardMaterial color="#5b564f" roughness={1} />
      </mesh>
      <mesh position={[0, 0.5, 0.05]}>
        <boxGeometry args={[0.17, 0.05, 0.02]} />
        <meshStandardMaterial color="#5b564f" roughness={1} />
      </mesh>
    </group>
  );
}
