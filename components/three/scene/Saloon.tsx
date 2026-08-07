"use client";

// The static room: plank floor, wood walls, the wall decor that is left, the table
// itself and the hanging lamp. Nothing in here reads game state — it only takes
// `felt`, which is why TableScene memoises these exports.
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { plankTexture, signTexture, feltTexture, wallTexture } from "./textures";
import { FELT_Y, FLOOR_Y } from "./geometry";
import { TableBase } from "./Furniture";

// How long after a shot the shadow map keeps refreshing — long enough to cover the
// firing animation and its fade back to the seated pose (620ms + 300ms).
const SHOT_LIVE_SHADOW = 1.1;

// Floor to ceiling. Exported because the camera has to stop before it leaves through
// the roof once the room can be orbited.
export const ROOM_H = 7;

// Inner face of a wall, from the middle of the room. The room is a square `felt * 6.5`
// across; exported because the bar stands against a wall and the bottles on its shelf are
// placed from Decor, which must not carry a second copy of this arithmetic.
export const wallAt = (felt: number) => (felt * 6.5) / 2 - 0.05;
// Shelf heights above the floor, and how far the shelf face stands off the wall.
export const BAR_SHELVES = [1.15, 1.9, 2.65] as const;
export const BAR_SHELF_OUT = 0.33;

export const WOOD = "#5a3a1c";
const WOOD_DARK = "#3a2410";
const METAL = "#8a8f96";

// A hung horseshoe (open end pointing down, "for luck").
function Horseshoe({ s = 0.22 }: { s?: number }) {
  return (
    <mesh rotation={[0, 0, Math.PI * 1.28]}>
      <torusGeometry args={[s, s * 0.16, 8, 22, Math.PI * 1.45]} />
      <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.4} />
    </mesh>
  );
}

// A single rifle lying along local +Y (barrel up), for the crossed-rifles trophy.
function Rifle() {
  return (
    <group>
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.022, 0.022, 1.15, 10]} /><meshStandardMaterial color="#2b2b2e" metalness={0.7} roughness={0.35} /></mesh>
      <mesh position={[0, -0.02, 0]}><boxGeometry args={[0.06, 0.36, 0.05]} /><meshStandardMaterial color={WOOD} roughness={0.8} /></mesh>
      <mesh position={[0, -0.46, 0]} rotation={[0, 0, 0.16]}><boxGeometry args={[0.1, 0.42, 0.07]} /><meshStandardMaterial color={WOOD_DARK} roughness={0.8} /></mesh>
    </group>
  );
}

function CrossedRifles() {
  return (
    <group>
      <group rotation={[0, 0, 0.5]}><Rifle /></group>
      <group rotation={[0, 0, -0.5]}><Rifle /></group>
    </group>
  );
}

// A wall-mounted oil lamp that also casts a warm pool of light on a side wall.
function WallSconce({ felt, lit = true }: { felt: number; lit?: boolean }) {
  return (
    <group>
      <mesh position={[0, -0.02, 0.06]}><boxGeometry args={[0.1, 0.18, 0.1]} /><meshStandardMaterial color="#1a1a1a" metalness={0.5} roughness={0.6} /></mesh>
      <mesh position={[0, 0.13, 0.08]}><sphereGeometry args={[0.09, 14, 14]} /><meshStandardMaterial color="#fff2d0" emissive="#ffcf8f" emissiveIntensity={2.2} /></mesh>
      {/* The glowing globe above stays either way — an unlit sconce still reads as a
          lamp. What goes is the light it casts, which every material in the room pays
          for on every pixel. */}
      {lit && <pointLight position={[0, 0.13, 0.35]} color="#ffcf8f" intensity={7} distance={felt * 3} decay={2} />}
    </group>
  );
}

// The bar. Hand-built rather than downloaded, and it is the one thing in this room where
// that is the better answer: a counter is a run of boxes, so a model buys nothing, while
// building it lets it be sized to THIS room — it runs a fixed fraction of the wall it
// stands against, at every table size.
//
// The bottles on the back shelf are the models already loaded for the table, so the bar
// costs no new download at all.
function BarCounter({ felt, wall, floorY }: { felt: number; wall: number; floorY: number }) {
  const len = felt * 3.4; // a bit over half the wall
  const H = 1.7; // ~1.05m at 0.63m to the unit, which is bar height
  const D = 0.62;
  const x = -wall + D / 2 + 0.04;
  const shelfW = 0.34;
  return (
    <group>
      {/* front panel and the counter top that overhangs it */}
      <mesh position={[x, floorY + H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[D, H, len]} />
        <meshStandardMaterial color={WOOD} roughness={0.85} />
      </mesh>
      <mesh position={[x + 0.06, floorY + H + 0.04, 0]} castShadow receiveShadow>
        <boxGeometry args={[D + 0.22, 0.1, len + 0.16]} />
        <meshStandardMaterial color="#6b4526" roughness={0.55} />
      </mesh>
      {/* a brass foot rail, the detail that says bar rather than kitchen counter */}
      <mesh position={[x + D / 2 + 0.16, floorY + 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, len, 10]} />
        <meshStandardMaterial color="#b08333" metalness={0.75} roughness={0.35} />
      </mesh>
      {/* back shelving against the wall, with the bottles from Decor standing on it */}
      <mesh position={[-wall + 0.16, floorY + 1.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[shelfW, 3, len * 0.8]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.95} />
      </mesh>
      {BAR_SHELVES.map((h, r) => (
        <mesh key={r} position={[-wall + BAR_SHELF_OUT, floorY + h, 0]} castShadow>
          <boxGeometry args={[shelfW * 0.9, 0.07, len * 0.78]} />
          <meshStandardMaterial color={WOOD} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

// A window with the night outside it. No light attached: an emissive pane is enough for
// the bloom pass already running to make it glow, and a real light here would be a
// fourth source fighting the lamp the whole room is composed around.
function Window({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y, z]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[1.5, 1.9]} />
        <meshStandardMaterial color="#8fa6c8" emissive="#5d7fb5" emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
      {/* frame and the two glazing bars */}
      {([[0, 0.98, 1.72, 0.14], [0, -0.98, 1.72, 0.14], [-0.79, 0, 0.14, 2.1], [0.79, 0, 0.14, 2.1], [0, 0, 0.07, 1.9], [0, 0, 1.5, 0.07]] as const).map(
        ([px, py, w, h], i) => (
          <mesh key={i} position={[px, py, 0]}>
            <boxGeometry args={[w, h, 0.1]} />
            <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
          </mesh>
        )
      )}
    </group>
  );
}

// The surfaces that cover the screen — ceiling shell, walls, panelling, floor, felt — in
// whichever material the machine can afford.
//
// Only these get the treatment, and that is the point: they are what a zoomed-out
// table is made of, pixel for pixel, while the beams and the bottles are a few hundred
// pixels each. meshStandardMaterial runs the full physically-based path per pixel and
// loops every light in the scene; Lambert is diffuse only. On these surfaces the
// difference is close to invisible anyway — they are all roughness 0.95–1, so the
// specular term the expensive shader computes is very nearly zero.
function Surface({
  low,
  roughness = 1,
  ...rest
}: {
  low?: boolean;
  roughness?: number;
  color?: string;
  map?: THREE.Texture;
  side?: THREE.Side;
}) {
  return low ? <meshLambertMaterial {...rest} /> : <meshStandardMaterial {...rest} roughness={roughness} />;
}

// Western saloon shell: plank floor, boarded walls with waist-high panelling, a bar
// along one side and the wall decor. Sizes scale with the table.
export function SaloonInner({ felt, low }: { felt: number; low?: boolean }) {
  const floorTex = useMemo(plankTexture, []);
  const signTex = useMemo(signTexture, []);
  const roomW = felt * 6.5;
  const roomH = ROOM_H;
  const floorY = FLOOR_Y;
  const wall = wallAt(felt); // inner wall distance from centre
  // Boards about 0.55 wide and a tile every 2.2 up, which is roughly a 35cm plank and a
  // 1.4m course at this scene's 0.63m to the unit.
  const wallTex = useMemo(() => wallTexture(Math.round(roomW / 3.3), Math.round(roomH / 2.2)), [roomW, roomH]);
  const dadoTex = useMemo(() => wallTexture(Math.round(roomW / 3.3), 1), [roomW]);
  // Free the canvas-backed textures when the scene unmounts (r3f doesn't).
  useEffect(() => () => [floorTex, signTex, wallTex, dadoTex].forEach((t) => t.dispose()), [floorTex, signTex, wallTex, dadoTex]);
  // Waist-high panelling, the way a room of this age would be built: it takes the knocks
  // and it gives the wall a horizontal line, without which four storeys of identical
  // vertical boards read as a fence rather than as a room.
  const dadoH = 1.5;
  // Each wall as its own inward-facing plane rather than the inside of one box. A box
  // can only carry one material across all six faces, and this room wants boards on the
  // walls, planks on the floor and neither on the ceiling.
  const walls = [
    { pos: [0, floorY + roomH / 2, -wall] as const, rot: 0 },
    { pos: [0, floorY + roomH / 2, wall] as const, rot: Math.PI },
    { pos: [-wall, floorY + roomH / 2, 0] as const, rot: Math.PI / 2 },
    { pos: [wall, floorY + roomH / 2, 0] as const, rot: -Math.PI / 2 },
  ];
  return (
    <group>
      {/* Ceiling, and a dark shell behind everything so no gap can show the void. */}
      <mesh position={[0, floorY + roomH / 2, 0]}>
        <boxGeometry args={[roomW, roomH, roomW]} />
        <Surface low={low} color="#2a1b0e" side={THREE.BackSide} />
      </mesh>
      {walls.map((w, i) => (
        <group key={i} position={w.pos as unknown as [number, number, number]} rotation={[0, w.rot, 0]}>
          <mesh receiveShadow>
            <planeGeometry args={[roomW, roomH]} />
            <Surface low={low} map={wallTex} />
          </mesh>
          <mesh position={[0, -roomH / 2 + dadoH / 2, 0.02]} receiveShadow>
            <planeGeometry args={[roomW, dadoH]} />
            <Surface low={low} map={dadoTex} color="#8a6034" roughness={0.95} />
          </mesh>
          {/* The capping rail along the top of the panelling. */}
          <mesh position={[0, -roomH / 2 + dadoH, 0.05]}>
            <boxGeometry args={[roomW, 0.12, 0.1]} />
            <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
          </mesh>
        </group>
      ))}
      {/* Ceiling beams. Cheap boxes, but the lamp hangs between them and throws them
          across the roof, which is most of what tells you the room has a structure. */}
      {[-2, -1, 0, 1, 2].map((k) => (
        <mesh key={k} position={[0, floorY + roomH - 0.22, (k * roomW) / 5.5]} castShadow>
          <boxGeometry args={[roomW, 0.34, 0.3]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.95} />
        </mesh>
      ))}
      <BarCounter felt={felt} wall={wall} floorY={floorY} />
      <Window x={wall - 0.04} z={-felt * 1.5} y={floorY + 2.5} />
      <Window x={wall - 0.04} z={felt * 0.6} y={floorY + 2.5} />
      {/* plank floor just above the box bottom */}
      <mesh position={[0, floorY + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[roomW, roomW]} />
        <Surface low={low} map={floorTex} />
      </mesh>
      {/* back wall: carved SALOON sign + lucky horseshoes. The band below them is
          left empty — it used to carry the players' WANTED posters. */}
      <mesh position={[0, floorY + 3.5, -wall + 0.03]}>
        <planeGeometry args={[2.6, 0.76]} />
        <meshStandardMaterial map={signTex} roughness={0.9} />
      </mesh>
      {[-wall * 0.5, wall * 0.5].map((x, i) => (
        <group key={i} position={[x, floorY + 3.25, -wall + 0.06]}>
          <Horseshoe />
        </group>
      ))}
      {/* left wall: a lamp sconce */}
      <group position={[-wall + 0.07, floorY + 1.9, felt * 1.15]} rotation={[0, Math.PI / 2, 0]}>
        <WallSconce felt={felt} lit={!low} />
      </group>
      {/* right wall: crossed rifles + a lamp sconce */}
      <group position={[wall - 0.07, floorY + 2.2, -felt * 0.3]} rotation={[0, -Math.PI / 2, 0]}>
        <CrossedRifles />
      </group>
      <group position={[wall - 0.07, floorY + 1.9, felt * 1.15]} rotation={[0, -Math.PI / 2, 0]}>
        <WallSconce felt={felt} lit={!low} />
      </group>
    </group>
  );
}

// The round table itself: felt top, apron and legs.
export function TableInner({ felt, models, low }: { felt: number; models?: boolean; low?: boolean }) {
  const bodyR = felt + 0.12;
  const felTex = useMemo(() => feltTexture(), []);
  useEffect(() => () => felTex.dispose(), [felTex]);
  return (
    <group>
      {/* wooden table body — top surface at y=0 */}
      <mesh position={[0, -0.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[bodyR, bodyR * 0.94, 0.4, 64]} />
        <meshStandardMaterial color="#5a3312" roughness={0.75} />
      </mesh>
      {/* green felt, lifted just above the body top to avoid z-fighting. Everything
          that lies on the table is placed off FELT_Y, so this is the one place the
          playing surface's height is decided. */}
      <mesh position={[0, FELT_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[felt, 96]} />
        <Surface low={low} map={felTex} roughness={0.98} />
      </mesh>
      {/* padded leather rim around the felt */}
      <mesh position={[0, 0.028, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[felt * 0.965, felt, 96]} />
        <meshStandardMaterial color="#4a2c14" roughness={0.6} />
      </mesh>
      <TableBase felt={felt} models={models} />
    </group>
  );
}


// Stop re-rendering the shadow map on every single frame.
//
// three.js refreshes shadow maps continuously by default, which only makes sense for
// a scene that keeps moving. Here the geometry is essentially static: the room, the
// table and the seated figures never move, and the things that DO move (cards flying
// to a hand, the Draw! reveal) are small, lit from above and cast nothing anyone
// looks at. So the map is rendered once, then only when the game state actually
// changes — `key` carries whatever should trigger a refresh.
export function StaticShadows({
  trigger,
  live,
  liveSec = SHOT_LIVE_SHADOW,
}: {
  trigger: string;
  live?: number | string; // identity of the moving thing; a new one re-opens the window
  liveSec?: number; // how long that thing moves for
}) {
  const gl = useThree((s) => s.gl);
  const until = useRef(0);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  // A new turn / a death / a player joining can change what casts a shadow.
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, trigger]);
  // Modelled cowboys animate when they fire, and a body falls over when it dies —
  // a frozen shadow map would leave the shadow of the old pose behind. Rather than
  // give up the optimisation and re-render shadows every frame forever, spend it
  // only while something is actually moving.
  useEffect(() => {
    if (live == null) return;
    until.current = liveSec;
  }, [live, liveSec]);
  useFrame((_, dt) => {
    if (until.current <= 0) return;
    until.current -= dt;
    gl.shadowMap.needsUpdate = true;
  });
  return null;
}

// The hanging oil lamp over the table: the scene's key light. It is the one thing
// bright enough to trip Bloom's threshold, and being a point light directly above
// the felt it also gives every figure a shadow that anchors it to the table.
export function TableLampInner({ felt }: { felt: number }) {
  const y = 2.55;
  return (
    <group position={[0, y, 0]}>
      {/* chain up to the ceiling */}
      <mesh position={[0, 0.75, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 1.5, 6]} />
        <meshStandardMaterial color="#2b2b2e" metalness={0.6} roughness={0.5} />
      </mesh>
      {/* tin shade */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <coneGeometry args={[0.46, 0.3, 24, 1, true]} />
        <meshStandardMaterial color="#3a2a18" roughness={0.7} metalness={0.35} side={THREE.DoubleSide} />
      </mesh>
      {/* the flame globe — emissive so Bloom blooms it */}
      <mesh position={[0, -0.05, 0]}>
        <sphereGeometry args={[0.14, 18, 18]} />
        <meshStandardMaterial color="#fff6d8" emissive="#ffc873" emissiveIntensity={3.4} toneMapped={false} />
      </mesh>
      {/* Key light. `decay={1.4}` rather than a physical 2 so the far seats stay
          lit instead of falling away into the dark.
          NO castShadow, deliberately: a point light shadow in three.js is a CUBE
          map, so switching it on re-renders the whole scene SIX more times every
          frame. That one flag was most of the reason this page ran hot. The
          directional light below still casts, which is what anchors the figures. */}
      <pointLight
        position={[0, -0.05, 0]}
        color="#ffd79a"
        intensity={26}
        distance={felt * 5}
        decay={1.4}
      />
    </group>
  );
}

