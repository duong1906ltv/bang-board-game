"use client";

// What a body does when it is shot: rocks back if it survives, goes all the way over
// backwards off the stool if it does not. Both are the same rigid rotation of the
// whole seated figure about the back edge of its chair — which is also what keeps the
// sitting pose they happen from.
//
// Not the .glb's Man_Death clip for the fall. That is a standing clip, falls FORWARD,
// and from t=1.2s sinks 5.25 units straight through the floor: it was authored to
// drop a corpse out of the world.
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { AVATAR_HEAD_R, AVATAR_HEAD_Y, FLOOR_Y } from "./geometry";
import { SHOT_IN } from "./Gunfire";
import type { LogEntry } from "@/lib/types";

const FALL = 0.9; // seconds going over
const LIE = 0.6; // and lying on the floor before the tombstone replaces the body
export const TOPPLE_SEC = FALL + LIE;

const HIT_ANGLE = Math.PI / 6;
const HIT_OUT = 0.14; // snapped back by the impact
const HIT_BACK = 0.5; // and rocking upright again
// The lean has to PEAK as the shot camera lands, not before it has finished flying
// in — otherwise the one moment the cut exists to show is already over by the time
// you are looking at it. What is left doubles as reaction time when there is no cut.
const HIT_LEAD = Math.max(0, SHOT_IN - HIT_OUT);
export const HIT_SEC = HIT_LEAD + HIT_OUT + HIT_BACK;

// The stool goes over on its back legs, not its middle, so the pivot is the back
// edge of the seat — that is what lifts the feet as the body drops.
const BACK_EDGE = 0.31;

// Solved, not chosen. Rotating the head by θ leaves it BACK_EDGE·sinθ + h·cosθ above
// the pivot; resting it one head-radius off the boards is the θ below. It lands a
// little PAST square because the pivot is behind the seat, not under it — a flat 90°
// stops with the head floating 0.53 clear of the floor.
const HEAD_UP = AVATAR_HEAD_Y - FLOOR_Y;
const FALL_ANGLE =
  Math.atan2(BACK_EDGE, HEAD_UP) + Math.acos(AVATAR_HEAD_R / Math.hypot(BACK_EDGE, HEAD_UP));

export type Reaction = { kind: "hit" | "fall" } | null;

// Read off hp and alive rather than the action log: the log names players instead of
// identifying them, so two players who picked one name would both flinch at one
// bullet. A seat always knows its own hp.
//
// Adjusted DURING render, not in an effect. An effect lands one render too late, and
// in that render a killed seat is already a grave — the avatar unmounts and remounts,
// losing its mixer and fading back in from the model's standing bind pose mid-fall.
export function useReaction(alive: boolean, hp: number): Reaction {
  const [prev, setPrev] = useState({ alive, hp });
  const [reaction, setReaction] = useState<Reaction>(null);
  if (prev.alive !== alive || prev.hp !== hp) {
    setPrev({ alive, hp });
    if (prev.alive && !alive) setReaction({ kind: "fall" });
    else if (alive && !prev.alive) setReaction(null); // a new game, not a resurrection
    else if (hp < prev.hp) setReaction({ kind: "hit" });
  }
  useEffect(() => {
    if (!reaction) return;
    const id = setTimeout(
      () => setReaction(null),
      (reaction.kind === "fall" ? TOPPLE_SEC : HIT_SEC) * 1000
    );
    return () => clearTimeout(id);
  }, [reaction]);
  return reaction;
}

// The newest thing in the log that makes a body move, and how long it moves for.
// Only the baked shadow map needs this — it has to know that SOMETHING is animating,
// not who — so resolving players by name is good enough here in a way it is not for
// the reaction itself.
export function useLatestMotion(log: LogEntry[]): { key: number; sec: number } | null {
  const [motion, setMotion] = useState<{ key: number; sec: number } | null>(null);
  const seen = useRef(-1);
  useEffect(() => {
    const last = log[log.length - 1];
    if (!last || last.id <= seen.current) return;
    const prev = seen.current;
    seen.current = last.id;
    // The log arrives pre-populated when you open a room; nothing in it is moving.
    if (prev < 0) return;
    const e = log.findLast(
      (x) => x.id > prev && (x.kind === "death" || (x.kind === "hit" && !!x.n))
    );
    if (e) setMotion({ key: e.id, sec: e.kind === "death" ? TOPPLE_SEC : HIT_SEC });
  }, [log]);
  return motion;
}

// Rotates `children` backwards about the floor behind the seat at `ang`.
//
// One group, never a changing tree: a group at position p with quaternion q maps
// x -> q·x + p, so p = P - q·P turns it into a rotation about the pivot P while the
// children keep the absolute coordinates they were written with. Wrapping and
// unwrapping them instead would change the element type at that position on every
// impact, and React would unmount the whole avatar and build a new one.
export function Lean({
  ang,
  seat,
  reaction,
  children,
}: {
  ang: number;
  seat: [number, number]; // x, z of the chair
  reaction: Reaction;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  const idle = useRef(false);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  // Solved, not guessed: rotating (0,h,0) about a by θ moves it along (-a.z, 0, a.x),
  // and that has to point straight out from the table — away from the centre — or the
  // body falls onto the felt instead of off the back of the chair.
  const axis = useMemo(() => new THREE.Vector3(Math.sin(ang), 0, -Math.cos(ang)), [ang]);
  const pivot = useMemo(
    () =>
      new THREE.Vector3(
        seat[0] + BACK_EDGE * Math.cos(ang),
        FLOOR_Y,
        seat[1] + BACK_EDGE * Math.sin(ang)
      ),
    [seat, ang]
  );

  useEffect(() => {
    t.current = 0;
  }, [reaction]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    if (!reaction) {
      if (idle.current) return;
      idle.current = true;
      g.quaternion.identity();
      g.position.set(0, 0, 0);
      return;
    }
    idle.current = false;
    t.current += dt;
    let angle: number;
    if (reaction.kind === "fall") {
      // Squared, not linear: a body going over a chair back hangs at the tipping
      // point and then lands hard. A constant rate reads as being lowered by a crane.
      const u = Math.min(t.current / FALL, 1);
      angle = FALL_ANGLE * u * u;
    } else if (t.current < HIT_LEAD) {
      angle = 0;
    } else if (t.current < HIT_LEAD + HIT_OUT) {
      angle = HIT_ANGLE * ((t.current - HIT_LEAD) / HIT_OUT);
    } else {
      // Squared on the way home: snaps off the peak, then settles rather than
      // arriving upright at speed.
      const u = Math.min((t.current - HIT_LEAD - HIT_OUT) / HIT_BACK, 1);
      angle = HIT_ANGLE * (1 - u) * (1 - u);
    }
    g.quaternion.setFromAxisAngle(axis, angle);
    g.position.copy(pivot).sub(scratch.copy(pivot).applyQuaternion(g.quaternion));
  });

  return <group ref={ref}>{children}</group>;
}
