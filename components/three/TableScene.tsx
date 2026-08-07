"use client";

// First-person 3D table for Bang!. Reads the SAME PlayerView the 2D room uses,
// so the game logic / socket layer is untouched — this is purely a render layer.
// A fixed 3/4 view across a round table, opponents around the far arc. Your own
// hand is 2D DOM UI, not part of this scene.
//
// This file is only the assembly: camera, lights, and which pieces go where. The
// pieces themselves live in ./scene — geometry.ts holds every measured number,
// and each component file owns one thing you can see.
import { memo, useEffect, useMemo, useRef } from "react";
import type { ElementRef, MutableRefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { FLOOR_Y, layout, seatPositions } from "./scene/geometry";
import { ROOM_H, SaloonInner, TableInner, TableLampInner, StaticShadows } from "./scene/Saloon";
import { Opponents, YourAvatar } from "./scene/Players";
import { GUN_STOW_SEC } from "./scene/Avatars";
import { TurnLight } from "./scene/TurnLight";
import { DecorInner } from "./scene/Decor";
import { CenterPiles, FlyingCards } from "./scene/Cards";
import { CheckFx } from "./scene/CheckFx";
import { ShotCam, ShotFx, useLatestShot, useShotOutcome } from "./scene/Gunfire";
import { REACH_DUR, reachFor, useReaches } from "./scene/Draw";
import { useLatestMotion } from "./scene/Reactions";
import type { Card } from "@/lib/cards";
import type { PlayerView, PlayerPublic } from "@/lib/types";

interface SceneProps {
  view: PlayerView;
  targetIds?: string[];
  onPickTarget?: (id: string) => void;
  onInspect?: (c: Card) => void;
  onInspectPlayer?: (p: PlayerPublic) => void;
  pickCardMode?: boolean;
  onPickCard?: (ownerId: string, cardId: string) => void;
  homeKey?: number; // bump to fly the camera back to the resting angle
  // The draw pile IS the draw control: armed on your draw phase, clicked to draw.
  canDraw?: boolean;
  onDrawDeck?: () => void;
  // And for Jesse Jones, so is another player's hand — his second draw option is a
  // click on the cards he wants, not a button.
  stealIds?: string[];
  onSteal?: (playerId: string) => void;
  fx?: boolean; // advanced effects (bloom / vignette) — switchable off for weak devices
  shotCam?: boolean; // cut to a close shot on gunfire (see ShotCam)
  models?: boolean; // 3D cowboys instead of the block avatars (see CowboyModel)
}

function Scene({ view, targetIds, onPickTarget, onInspect, onInspectPlayer, pickCardMode, onPickCard, homeKey, canDraw, onDrawDeck, stealIds, onSteal, fx, shotCam = true, models = true }: SceneProps) {
  const nOpp = Math.max(1, view.players.length - 1);
  const { ring, felt, arc, camY, camZ, fov } = layout(nOpp);
  const controls = useRef<ElementRef<typeof OrbitControls> | null>(null);
  // Memoised because the identity matters, not just the value: Scene re-renders on
  // every broadcast, and a fresh [0,camY,camZ] each time would let r3f re-apply the
  // prop and yank the camera back — undoing the player's zoom, and fighting ShotCam
  // for the camera mid-cut.
  const homePos = useMemo<[number, number, number]>(() => [0, camY, camZ], [camY, camZ]);
  const homeTarget = useMemo<[number, number, number]>(() => [0, 0, -felt * 0.12], [felt]);
  useGoHome(controls, homeKey, homePos, homeTarget);
  const pickerOpen = view.pending?.kind === "store" || view.pending?.kind === "kit";
  const dim = useRoomDim(!!pickerOpen);
  // One shot, many reactors: the camera cut, the muzzle flash and the shooter's
  // own arm all read this so they stay in lockstep.
  const shot = useLatestShot(view.log, view.players, view.you.seat, arc, felt);
  const outcome = useShotOutcome(view.log, shot);
  // Whoever is holding a Bang! on someone who has not answered it yet. Taken from the
  // shot we already resolved rather than looking the name up a second time — and only
  // when the two agree, so a stale shot can never leave the wrong cowboy taking aim.
  const aimingSeat =
    view.pending?.kind === "bang" && shot?.shooter.name === view.pending.actorName
      ? shot.shooter.seat
      : null;
  // Baked shadows have to be re-opened whenever something actually moves: a shooter's
  // arm, a body rocking back, a body going over. All three are log entries, so the
  // higher id is simply the more recent event and it brings its own duration.
  // Where the turn light points. Memoised on the seating rather than rebuilt per frame:
  // the map is only wrong when someone joins, leaves or the arc changes.
  const seats = useMemo(
    () => seatPositions(view.players, view.you.seat, arc, felt),
    [view.players, view.you.seat, arc, felt]
  );
  const turnAt = (view.turnSeat != null && seats.get(view.turnSeat)) || null;
  const motion = useLatestMotion(view.log);
  const armKey = models && shot ? shot.key : -1;
  // Who just drew. Shared by the arms that reach and the cards that come off the pile,
  // so the two can never disagree about who is picking up what.
  const reaches = useReaches(view.log, view.players, view.you.seat, arc, felt, ring);
  const yourReach = reachFor(reaches, view.you.seat);
  // Whichever of the three body movements is newest owns the live-shadow window. Ranked
  // by log id — all three come off the same counter, so the bigger number is simply the
  // later event. The identity handed to StaticShadows is the LEG's seq, not that id: a
  // two-leg draw shares one log id, and reusing it would leave the shadow frozen through
  // the second reach. Prefixed so a seq can never collide with a log id.
  const newestReach = models ? reaches.reduce<typeof reaches[number] | null>((a, d) => (!a || d.seq > a.seq ? d : a), null) : null;
  const moving =
    newestReach && newestReach.logId >= Math.max(motion?.key ?? -1, armKey)
      ? { key: `draw-${newestReach.seq}`, sec: REACH_DUR }
      : (motion?.key ?? -1) >= armKey
      ? motion
      : null;
  return (
    <>
      <color attach="background" args={["#3a2a1a"]} />
      <fog attach="fog" args={["#3a2a1a", felt * 3, felt * 7]} />
      <PerspectiveCamera makeDefault position={homePos} fov={fov} />
      {/* Aim stays locked on the middle of the table — no pan — but you may walk the
          camera around it and zoom. Zoom: a head is only ~31-42px in the resting view,
          min felt*0.7 keeps the camera out of the table body, max felt*2.6 is a little
          past the resting shot at felt*2.05.
          Vertical travel is clamped both ways. Up, because the saloon is a box ROOM_H
          tall and the camera would otherwise climb out through the roof — worst at the
          far zoom stop, which is what this is derived from, and at a 7-player table
          that bites as early as 42 degrees. Down, because below ~80 degrees the camera
          drops under the players' heads and the felt goes edge-on. */}
      <OrbitControls
        ref={controls}
        target={homeTarget}
        enableRotate
        enableZoom
        enablePan={false}
        zoomSpeed={0.7}
        rotateSpeed={0.5}
        minDistance={felt * 0.7}
        maxDistance={felt * 2.6}
        minPolarAngle={Math.acos(Math.min(1, (FLOOR_Y + ROOM_H - 0.3) / (felt * 2.6)))}
        maxPolarAngle={(80 * Math.PI) / 180}
      />
      <ShotCam shot={shot} felt={felt} enabled={!!shotCam} standoff={aimingSeat != null} controls={controls} />
      {/* Keyed by the shot so each one mounts fresh and tears itself down; the flash is
          independent of the camera cut, so turning the cut off still leaves you a
          visible gunshot. It waits for the outcome — the gun goes off at the moment the
          standoff resolves, not while the table is still waiting for an answer. */}
      {shot && outcome && <ShotFx key={shot.key} shot={shot} hit={outcome === "hit"} />}
      {/* Lighting: one warm lamp over the table doing the real work, everything
          else just lifting the shadows off black.
          Before, ambient 1.05 + hemisphere 0.85 + directional 1.0 + a "warehouse"
          environment lit every surface almost equally, and the directional light
          never had castShadow — so nothing cast a shadow and the whole table read
          as flat decals. It also left no bright spot for Bloom to catch and no
          dark corner for the Vignette to deepen, which is why neither effect was
          doing anything visible. */}
      <ambientLight ref={dim(0)} intensity={0.26} color="#ffeccd" />
      <hemisphereLight ref={dim(1)} args={["#ffe8c0", "#2a1c10", 0.22]} />
      <directionalLight
        ref={dim(2)}
        position={[3.5, 7, 4]}
        intensity={0.45}
        color="#fff3e0"
        castShadow
        /* 1024 not 2048: a quarter of the shadow-map work, and the shadows here are
           soft blobs under figures, not edges anyone inspects. */
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-camera-left={-felt * 2.4}
        shadow-camera-right={felt * 2.4}
        shadow-camera-top={felt * 2.4}
        shadow-camera-bottom={-felt * 2.4}
        shadow-bias={-0.0006}
      />
      <TableLamp felt={felt} />
      <TurnLight at={turnAt} />
      <StaticShadows
        trigger={`${view.turnSeat}|${view.players.map((p) => (p.alive ? 1 : 0)).join("")}|${view.players.length}`}
        /* A body going over backwards moves for 1.5s, but the alive mask in `trigger`
           changes the instant it starts — that would bake the shadow of a cowboy
           still sitting upright and leave it there until the turn moved on. */
        live={moving?.key ?? (armKey >= 0 ? armKey : undefined)}
        liveSec={moving?.sec ?? (armKey >= 0 ? GUN_STOW_SEC : undefined)}
      />
      <Saloon felt={felt} />
      <Decor felt={felt} models={models} />
      <Table felt={felt} models={models} />
      <CenterPiles deckCount={view.deckCount} discardCount={view.discardCount} topDiscard={view.topDiscard} canDraw={canDraw} onDrawDeck={onDrawDeck} />
      <Opponents players={view.players} youSeat={view.you.seat} ring={ring} felt={felt} arc={arc} targetIds={targetIds} onPickTarget={onPickTarget} onInspect={onInspect} onInspectPlayer={onInspectPlayer} pickCardMode={pickCardMode} onPickCard={onPickCard} shot={shot} aimingSeat={aimingSeat} reaches={reaches} stealIds={stealIds} onSteal={onSteal} models={models} />
      <YourAvatar you={view.you} players={view.players} count={view.players.length} ring={ring} felt={felt} shot={shot} aiming={aimingSeat === view.you.seat} reach={yourReach} onInspect={onInspect} onInspectPlayer={onInspectPlayer} models={models} />
      <FlyingCards hand={view.you.hand} felt={felt} camY={camY} camZ={camZ} />
      <CheckFx check={view.checks.at(-1) ?? null} felt={felt} />
      {/* Cinematic pass: the lamp globe blooms, the corners fall away. Threshold
          dropped from 0.78 to 0.58 — under the old flat lighting nothing in frame
          was bright enough to cross 0.78, so Bloom rendered no visible glow at all.
          Skipped entirely when the player turns effects off (weak devices). */}
      {fx && (
        <EffectComposer>
          <Bloom intensity={0.75} luminanceThreshold={0.58} luminanceSmoothing={0.25} mipmapBlur />
          <Vignette offset={0.22} darkness={0.68} eskil={false} />
        </EffectComposer>
      )}
    </>
  );
}

export default function TableScene({
  view,
  targetIds,
  onPickTarget,
  onInspect,
  onInspectPlayer,
  pickCardMode,
  onPickCard,
  homeKey,
  canDraw,
  onDrawDeck,
  stealIds,
  onSteal,
  fx = true,
  shotCam = true,
  models = true,
}: SceneProps) {
  return (
    <div style={{ width: "100%", height: "100%", background: "#141210" }}>
      {/* dpr cap 1.5, not 2: at 2 a retina screen renders FOUR times the pixels of a
          1x screen every frame, and on a table of flat colours the difference is
          barely visible while the cost is not. 1.5 is 44% fewer pixels than 2. */}
      <Canvas shadows dpr={fx ? [1, 1.5] : [1, 1.25]}>
        <Scene {...{ view, targetIds, onPickTarget, onInspect, onInspectPlayer, pickCardMode, onPickCard, homeKey, canDraw, onDrawDeck, stealIds, onSteal, fx, shotCam, models }} />
      </Canvas>
    </div>
  );
}

// Flying the camera back to where it started, for the button in the HUD. Orbiting is
// free — a player can end up under the table or staring at a wall — and there was no way
// back short of reloading.
//
// A glide rather than a jump: the room the camera swings through on the way is what tells
// you it is the same table you were already looking at. And it yields to the shot camera,
// which takes the controls away for the length of a cut (`enabled = false`); pressing the
// button mid-gunfight parks the request until the cut hands the camera back.
const HOME_SEC = 0.55;
const TO_P = new THREE.Vector3();
const TO_T = new THREE.Vector3();

function useGoHome(
  controls: MutableRefObject<ElementRef<typeof OrbitControls> | null>,
  key: number | undefined,
  pos: [number, number, number],
  target: [number, number, number]
) {
  const t = useRef(-1);
  const from = useRef({ p: new THREE.Vector3(), t: new THREE.Vector3() });
  const armed = useRef(false);
  useEffect(() => {
    // The first run is the mount, when the camera is already home.
    if (!armed.current) {
      armed.current = true;
      return;
    }
    const c = controls.current;
    if (!c) return;
    from.current.p.copy(c.object.position);
    from.current.t.copy(c.target);
    t.current = 0;
  }, [key, controls]);
  useFrame((_, dt) => {
    if (t.current < 0) return;
    const c = controls.current;
    if (!c) {
      t.current = -1;
      return;
    }
    if (!c.enabled) return; // the shot camera has it; wait rather than fight
    t.current = Math.min(1, t.current + dt / HOME_SEC);
    const k = t.current * t.current * (3 - 2 * t.current); // smoothstep, so it eases out
    c.object.position.lerpVectors(from.current.p, TO_P.fromArray(pos), k);
    c.target.lerpVectors(from.current.t, TO_T.fromArray(target), k);
    c.update();
    if (t.current >= 1) t.current = -1;
  });
}

// The room drops back while a choice is staged over the table, so three cards read as a
// lit moment rather than as more things on a busy table.
//
// Done by taking the fill lights down, NOT by laying a dark sheet over everything: the
// lamp above the table is left alone, so the middle of the room keeps its light and only
// the corners fall away. A flat overlay would have dimmed the lamp, the felt and the
// cards equally, which is not dimming — it is fog.
const DIM_TO = 0.5;
const DIM_RATE = 6; // time constant; ~95% of the way in 0.5s

function useRoomDim(active: boolean) {
  const lights = useRef<(THREE.Light | null)[]>([]);
  // Captured off the light itself the first time it mounts, so the numbers stay written
  // once, up in the JSX where they are read.
  const full = useRef<number[]>([]);
  const k = useRef(1);
  useFrame((_, dt) => {
    const want = active ? DIM_TO : 1;
    k.current += (want - k.current) * (1 - Math.exp(-DIM_RATE * dt));
    lights.current.forEach((l, i) => {
      if (l && full.current[i] !== undefined) l.intensity = full.current[i] * k.current;
    });
  });
  return (i: number) => (l: THREE.Light | null) => {
    lights.current[i] = l;
    if (l && full.current[i] === undefined) full.current[i] = l.intensity;
  };
}

// Scene re-renders on every broadcast — each play, each 850ms bot tick. These three
// take only `felt`, so without memo the whole static room (walls, floor, wall decor,
// table legs) is rebuilt to reconcile to nothing.
const Saloon = memo(SaloonInner);
const Table = memo(TableInner);
const TableLamp = memo(TableLampInner);
// Same reason as the three above: nothing here moves, so it must not be rebuilt on
// every broadcast just to reconcile to itself.
const Decor = memo(DecorInner);
