"use client";

// Whose turn it is, half of it. The other half is TurnMarker in Players.tsx.
//
// It began as a yellow arrow 0.62 tall bobbing 1.13 above a head of radius 0.15 — four
// times the size of the thing it pointed at, and floating above even the nameplate. The
// next attempt, a glowing disc painted on the felt, was worse in a way worth recording:
// being a flat quad it hung over the rim of a round table, and being additive it washed
// the red cards under it into a haze. Both were pictures OF light.
//
// This is light. It multiplies with the surfaces instead of adding over them, so the
// cards it falls on stay legible; it has no polygon to overhang a curved edge; and it
// reaches the player as well as their corner of the cloth, which is the thing the disc
// never did — the disc lit a place, this lights a person.
//
// What it cannot do is work in close-up. Brightness is a comparison, so it needs two
// players in frame to mean anything, and the camera orbits freely — over one shoulder
// there is only ever one. That is what the arrow came back for, at a fifth of the size
// that got it pulled. The light carries the wide shot, the arrow carries the close one.
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { FELT_Y } from "./geometry";

// Height above the felt. Well under the lamp at 2.6 and the ceiling above that, so the
// cone is steep enough to pool tightly rather than smear across half the table.
const HEIGHT = 2.6;
// The aim point is pulled off the chair towards the middle, so the cone straddles the
// player AND the cards and gun in front of them rather than lighting a back.
const AIM_IN = 0.42;
// Half-angle of the cone, from the coverage it has to give: this much radius on the
// cloth at HEIGHT above it. 1.0 takes in the row of cards in play, the gun waiting to
// their right and the width of a seated body.
const COVER = 1.0;
const ANGLE = Math.atan(COVER / HEIGHT);
// Soft-edged, or the cone draws a hard ellipse on the felt and we are back to a decal.
const PENUMBRA = 0.75;
// Against the lamp's 26 at decay 1.4 — enough to read as a second source without
// flattening the one light the room is built around. At 17 it measured 3.3 at a seated
// chest against the lamp's 3.8, i.e. 87% brighter than the player beside them; 21 takes
// that to 4.1 and 108%. Raised on the table's own reading of it, not on the maths —
// 87% was plenty on paper and still read as flat in a lit saloon.
const INTENSITY = 21;
const DECAY = 1.5;
// The colour was. This used to be #ffd79a — the lamp's colour, exactly. So 72% more of
// the same light does not read as "a light on this player", it reads as "this player is
// sitting nearer the lamp", and telling those apart needs a second player in frame to
// compare against. A cool source has no such requirement: there is nothing else in the
// room this colour, so one lit figure alone is enough to know. Kept pale rather than
// blue so the green cloth under it does not go cyan.
const COLOR = "#e2ecff";
// Time constant, not a duration: the light glides to the next seat rather than cutting,
// which turns the change of turn into a movement. ~95% of the way in 0.55s.
const SLIDE = 5.5;
// And fades rather than snapping when a turn ends or the game does.
const FADE = 4;

const TMP = new THREE.Vector3();

// One light, mounted once and moved — never one per seat, and never mounted and
// unmounted with the turn. Three.js bakes the light count into every material's shader,
// so adding or removing one recompiles all of them, and the table would hitch on every
// single turn.
export function TurnLight({ at }: { at: THREE.Vector3 | null }) {
  const light = useRef<THREE.SpotLight>(null);
  // The target has to be in the scene graph or its world matrix never updates and the
  // cone keeps pointing at the origin.
  const target = useMemo(() => new THREE.Object3D(), []);
  const aim = useRef(new THREE.Vector3(0, FELT_Y, 0));
  const first = useRef(true);

  useFrame((_, dt) => {
    const l = light.current;
    if (!l) return;
    if (at) {
      // Pull the aim point off the seat towards the middle of the table. `at` is on the
      // seat ring, so scaling it down the radius is the same as walking inwards.
      const r = Math.hypot(at.x, at.z) || 1;
      const k = Math.max(0, r - AIM_IN) / r;
      aim.current.set(at.x * k, FELT_Y, at.z * k);
      // The very first turn arrives with the light still parked at the middle of the
      // table; sliding in from there would read as the lamp falling over.
      if (first.current) {
        first.current = false;
        target.position.copy(aim.current);
        l.position.set(aim.current.x, FELT_Y + HEIGHT, aim.current.z);
      }
    }
    const t = 1 - Math.exp(-SLIDE * dt);
    target.position.lerp(aim.current, t);
    l.position.lerp(TMP.set(aim.current.x, FELT_Y + HEIGHT, aim.current.z), t);
    const want = at ? INTENSITY : 0;
    l.intensity += (want - l.intensity) * (1 - Math.exp(-FADE * dt));
  });

  return (
    <>
      <primitive object={target} />
      <spotLight
        ref={light}
        target={target}
        position={[0, FELT_Y + HEIGHT, 0]}
        color={COLOR}
        intensity={0}
        angle={ANGLE}
        penumbra={PENUMBRA}
        decay={DECAY}
        distance={HEIGHT * 2.4}
        /* No shadow on purpose. The shadow map is baked and frozen (see StaticShadows),
           so a light that moves every turn would either need the bake reopened for the
           whole slide or would drag a stale shadow around behind it. It is here to say
           whose turn it is, and the room already has a light that casts. */
      />
    </>
  );
}
