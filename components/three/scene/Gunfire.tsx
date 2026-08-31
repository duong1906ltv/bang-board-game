"use client";

// Everything that happens when someone fires: spotting the shot in the action log,
// cutting the camera in close, and the flash/tracer/smoke/report itself.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ElementRef, MutableRefObject } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { AVATAR_HEAD_Y, AVATAR_SHOULDER_Y, seatPositions } from "./geometry";
import { CARD_DEF_BY_ID } from "@/lib/cards";
import { playGunshot } from "@/lib/sfx";
import type { LogEntry, PlayerPublic } from "@/lib/types";

// ─── Cinematic shot camera ───────────────────────────────────────────────────

// Which plays count as gunfire. Read off the card registry rather than hardcoded
// strings, so renaming a card in cards.ts cannot silently kill the effect. Missed!
// is in here because Calamity Janet fires it AS a Bang!; a Missed! played to dodge
// carries no target, and the `b` check below is what tells those two apart.
const GUNFIRE_NAMES = new Set([
  CARD_DEF_BY_ID.bang.name,
  CARD_DEF_BY_ID.missed.name,
]);

function isGunfire(e: LogEntry): boolean {
  return e.kind === "play" && !!e.b && !!e.card && GUNFIRE_NAMES.has(e.card);
}

// Solved numerically across every table size and shooter/target pair: the subject's
// head lands at 193px+ on an 800px viewport (31-42px at rest), camera always inside
// the walls. Re-check with a script before moving any of the three.
const SHOT_DIST = 1.05; // back off this far along the shooter->target line
const SHOT_SIDE = 0.55; // and this far to one side, so it reads 3/4 not mugshot
const SHOT_HIGH = 0.75; // camera height above the table top — a shade above the eyeline

// Deliberately short — this fires on roughly a third of all plays (see getShotCam).
export const SHOT_IN = 0.28;
const SHOT_HOLD = 0.75;
const SHOT_OUT = 0.42;
export const SHOT_DUR = SHOT_IN + SHOT_HOLD + SHOT_OUT;

// A standoff holds the cut open past SHOT_HOLD, but not forever: nothing on the
// server ever forces an answer out of a player, so an AFK one would otherwise pin
// everybody else's camera in close-up indefinitely.
const STANDOFF_MAX = 8;

const smoothstep = (x: number) => x * x * (3 - 2 * x);

interface ShotFraming {
  origin: THREE.Vector3; // where the camera was when the cut started
  originLook: THREE.Vector3;
  from: THREE.Vector3; // the close position it flies to
  look: THREE.Vector3; // the head it stays pointed at
}

// One resolved shot: who fired at whom, and where they both sit. Produced once
// per volley and consumed by everything that reacts to gunfire, so the camera, the
// muzzle flash and the shooter's arm can never disagree about who pulled a trigger.
export interface Gunfire {
  key: number; // the log entry's id — a new identity per shot
  shooter: PlayerPublic;
  target: PlayerPublic;
  from: THREE.Vector3; // shooter's seat, at table-top height
  to: THREE.Vector3; // target's seat
  youFired: boolean;
}

export function useLatestShot(
  log: LogEntry[],
  players: PlayerPublic[],
  youSeat: number,
  arc: number,
  felt: number,
): Gunfire | null {
  const [shot, setShot] = useState<Gunfire | null>(null);
  const seen = useRef(-1);
  useEffect(() => {
    const last = log[log.length - 1];
    if (!last) return;
    if (last.id <= seen.current) return;
    const prev = seen.current;
    seen.current = last.id;
    // The log arrives pre-populated on the first view of a room. Replaying its
    // history as a burst of gunfire is not what someone joining wants to see.
    if (prev < 0) return;
    // One broadcast can carry several entries (a Gatling logs a hit per player).
    // Take the newest gunfire only: one shot per volley, not one per victim.
    const fired = log.findLast((e) => e.id > prev && isGunfire(e));
    if (!fired) return;

    // The log identifies people by NAME — it carries no player id — so two players
    // who picked the same name are indistinguishable here. Skip rather than
    // confidently swoop in on the wrong cowboy.
    const byName = (nm?: string) => {
      const hits = players.filter((p) => p.name === nm);
      return hits.length === 1 ? hits[0] : undefined;
    };
    const shooter = byName(fired.a);
    const target = byName(fired.b);
    if (!shooter || !target || shooter.seat === target.seat) return;

    const seats = seatPositions(players, youSeat, arc, felt);
    const from = seats.get(shooter.seat);
    const to = seats.get(target.seat);
    if (!from || !to) return;
    setShot({
      key: fired.id,
      shooter,
      target,
      from,
      to,
      youFired: shooter.seat === youSeat,
    });
  }, [log, players, youSeat, arc, felt]);
  return shot;
}

// Did the shot land? Null until the table knows — a Bang! is played before anyone has
// answered it, so firing the muzzle flash at that moment claims a hit that may never
// happen. Read off the log rather than off hp: the target's hp in `shot` was captured
// from the same broadcast as the play, so it has already moved by the time we see it.
export function useShotOutcome(log: LogEntry[], shot: Gunfire | null): "hit" | "miss" | null {
  return useMemo(() => {
    if (!shot) return null;
    for (const e of log) {
      if (e.id <= shot.key || e.a !== shot.target.name) continue;
      if (e.kind === "hit") return "hit";
      // Any reaction from the person being shot at is them getting out of the way.
      if (e.kind === "react") return "miss";
      // A Barrel logs outcome "hit" when the BARREL hit, which is a dodge; a failed one
      // resolves later, as a Missed! or as damage.
      if (e.kind === "check" && e.checkKind === "barrel" && e.outcome === "hit") return "miss";
    }
    return null;
  }, [log, shot]);
}

// Cuts to a close shot on gunfire, holds, then flies home.
//
// OrbitControls is switched OFF for the duration: drei calls controls.update() every
// frame while `enabled`, which would fight us for camera.position. "Home" is captured
// when the cut STARTS, so a player who has zoomed keeps their own framing, and a shot
// landing mid-cut re-aims from wherever the camera is rather than snapping home.
export function ShotCam({
  shot,
  felt,
  enabled,
  standoff,
  controls,
}: {
  shot: Gunfire | null;
  felt: number;
  enabled: boolean;
  standoff?: boolean; // this shot is still waiting for a Missed! or a pass
  controls: MutableRefObject<ElementRef<typeof OrbitControls> | null>;
}) {
  const camera = useThree((s) => s.camera);
  const [framing, setFraming] = useState<ShotFraming | null>(null);
  const t = useRef(0);
  const waited = useRef(0);
  const home = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(
    null,
  );
  const look = useRef(new THREE.Vector3());
  const tmpPos = useRef(new THREE.Vector3());
  const tmpLook = useRef(new THREE.Vector3());

  // Hand the camera back exactly where the cut promised to leave it.
  const land = useCallback(() => {
    const h = home.current;
    if (h) {
      camera.position.copy(h.pos);
      camera.lookAt(h.target);
      look.current.copy(h.target);
      const c = controls.current;
      if (c) {
        c.target.copy(h.target);
        c.enabled = true;
        c.update();
      }
    }
    home.current = null;
    setFraming(null);
  }, [camera, controls]);

  useEffect(() => {
    if (!shot || !enabled) return;
    // A shot you fired frames the person you hit; anyone else's frames the shooter.
    const subject = shot.youFired ? shot.to : shot.from;
    const other = shot.youFired ? shot.from : shot.to;
    // Face-on: out along the way the subject is facing, which is towards the table
    // centre — so the camera ends up hanging over the felt, looking back at them.
    // 3/4: back off along the line between the two and step to one side.
    const dir = shot.youFired
      ? subject.clone().negate().setY(0)
      : other.clone().sub(subject).setY(0);
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const from = subject
      .clone()
      .addScaledVector(dir, SHOT_DIST)
      .addScaledVector(perp, shot.youFired ? 0 : SHOT_SIDE);
    from.y = SHOT_HIGH;

    const c = controls.current;
    if (!home.current) {
      // Starting from rest: this is the framing we owe the player back.
      home.current = {
        pos: camera.position.clone(),
        target: c ? c.target.clone() : new THREE.Vector3(0, 0, -felt * 0.12),
      };
      if (c) look.current.copy(c.target);
      if (c) c.enabled = false;
    }
    t.current = 0;
    waited.current = 0;
    setFraming({
      origin: camera.position.clone(),
      originLook: look.current.clone(),
      from,
      look: subject.clone().setY(AVATAR_HEAD_Y),
    });
  }, [shot, enabled, felt, camera, controls]);

  // Turned off mid-cut (or unmounted): give the camera straight back rather than
  // leaving OrbitControls disabled forever.
  useEffect(() => {
    if (!enabled && framing) land();
  }, [enabled, framing, land]);
  useEffect(
    () => () => {
      const c = controls.current;
      if (c) c.enabled = true;
    },
    [controls],
  );

  useFrame((_, dt) => {
    if (!framing || !home.current) return;
    t.current += dt;
    // The cut ends when the standoff does, not on a fixed clock. Once the fly-in and
    // the hold have played out, the clock stops rather than running on into the
    // fly-out — so the camera stays on the subject for exactly as long as the table
    // is waiting for an answer.
    const holdEnd = SHOT_IN + SHOT_HOLD;
    if (standoff && t.current >= holdEnd) {
      waited.current += dt;
      if (waited.current < STANDOFF_MAX) t.current = holdEnd;
    }
    const tt = t.current;
    const pos = tmpPos.current;
    const aim = tmpLook.current;
    if (tt < SHOT_IN) {
      const u = smoothstep(tt / SHOT_IN);
      pos.lerpVectors(framing.origin, framing.from, u);
      aim.lerpVectors(framing.originLook, framing.look, u);
    } else if (tt < SHOT_IN + SHOT_HOLD) {
      pos.copy(framing.from);
      aim.copy(framing.look);
    } else if (tt < SHOT_DUR) {
      const u = smoothstep((tt - SHOT_IN - SHOT_HOLD) / SHOT_OUT);
      pos.lerpVectors(framing.from, home.current.pos, u);
      aim.lerpVectors(framing.look, home.current.target, u);
    } else {
      land();
      return;
    }
    camera.position.copy(pos);
    camera.lookAt(aim);
    look.current.copy(aim);
  });

  return null;
}

// ─── Gunfire effects ─────────────────────────────────────────────────────────

// An approximation of the gun position, not a lookup: the block avatar has no gun
// and the model's hand moves through its firing clip. Shoulder height, not head —
// the head spans y 0.47-0.77, so anything higher spawns the flash beside the face.
const MUZZLE_OUT = 0.45;
const MUZZLE_Y = AVATAR_SHOULDER_Y;
// Head, not chest. The tracer used to end at 0.34 — below the table rim from most
// seats, so what you saw was a streak vanishing past a shoulder rather than a hit.
const HIT_Y = AVATAR_HEAD_Y;

const FLASH_DUR = 0.07;
const TRACER_DUR = 0.16;
const SMOKE_DUR = 0.6;

// Muzzle flash, tracer and smoke for one shot, plus the report. Mounted with the
// shot's key so every shot gets a fresh instance and needs no reset logic; it
// unmounts itself once the smoke has cleared.
export function ShotFx({ shot }: { shot: Gunfire }) {
  const flash = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const tracer = useRef<THREE.Mesh>(null);
  const smoke = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  const [done, setDone] = useState(false);

  const geom = useMemo(() => {
    const dir = shot.to.clone().sub(shot.from).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    const muzzle = shot.from
      .clone()
      .addScaledVector(dir, MUZZLE_OUT)
      .setY(MUZZLE_Y);
    const hit = shot.to.clone().setY(HIT_Y);
    const span = hit.clone().sub(muzzle);
    // A cylinder is built along +Y, so the tracer is a Y-aligned bar rotated onto
    // the muzzle->target line rather than a mesh rebuilt per shot.
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      span.clone().normalize(),
    );
    return { muzzle, len: span.length(), quat };
  }, [shot]);

  useEffect(() => {
    playGunshot();
  }, [shot]);

  useFrame((_, dt) => {
    if (done) return; // the smoke has cleared; nothing left to drive
    t.current += dt;
    const tt = t.current;

    const fp = tt / FLASH_DUR;
    if (flash.current) {
      flash.current.visible = fp < 1;
      flash.current.scale.setScalar(
        0.09 + 0.16 * Math.sin(Math.min(fp, 1) * Math.PI),
      );
    }
    if (light.current) light.current.intensity = fp < 1 ? 26 * (1 - fp) : 0;

    // The tracer grows out of the muzzle over the first half of its life, then
    // fades where it lies — a bolt of light, not a travelling pellet, which at this
    // table size would cross the gap in two frames and be seen by nobody.
    const rp = tt / TRACER_DUR;
    if (tracer.current) {
      tracer.current.visible = rp < 1;
      const grow = Math.min(rp * 2, 1);
      tracer.current.scale.set(1, grow, 1);
      tracer.current.position.set(0, (geom.len * grow) / 2, 0);
      const m = tracer.current.material as THREE.MeshBasicMaterial;
      m.opacity = rp < 0.5 ? 0.95 : 0.95 * (1 - (rp - 0.5) / 0.5);
    }

    const sp = tt / SMOKE_DUR;
    if (smoke.current) {
      smoke.current.visible = sp < 1;
      smoke.current.scale.setScalar(0.06 + sp * 0.4);
      smoke.current.position.y = sp * 0.22;
      (smoke.current.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        0.32 * (1 - sp),
      );
    }

    if (tt >= SMOKE_DUR) setDone(true);
  });

  if (done) return null;
  return (
    <group position={geom.muzzle}>
      <mesh ref={flash}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial color="#ffd68a" transparent opacity={0.95} />
      </mesh>
      <pointLight
        ref={light}
        color="#ffb347"
        intensity={0}
        distance={3.2}
        decay={2}
      />
      <mesh ref={smoke}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial
          color="#cfc4b0"
          transparent
          opacity={0.3}
          depthWrite={false}
        />
      </mesh>
      <group quaternion={geom.quat}>
        <mesh ref={tracer}>
          <cylinderGeometry args={[0.012, 0.012, geom.len, 6]} />
          <meshBasicMaterial
            color="#fff0c0"
            transparent
            opacity={0.95}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}
