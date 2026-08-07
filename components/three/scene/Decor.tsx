"use client";

// The things nobody plays with: bottles and glasses left on the felt, barrels and a
// crate standing around the room. The saloon had furniture and wall fittings but nothing
// anyone had put down — a table mid-game with only the cards on it, and bare floor the
// moment you orbited behind a player.
//
// Modelled, not built from primitives like the horseshoe and the crossed rifles on the
// walls. All CC0, and all but the shot glass from Quaternius — the same hand as the
// cowboy, the chairs, the table and four of the six guns, so they share a palette and a
// polygon budget rather than looking bolted on.
//
// Every size below is a HEIGHT IN WORLD UNITS divided by the model's own measured
// height. The scene runs at roughly 0.63m to the unit (the table top stands 1.58 above
// the floor, which is a metre), so the real-world sizes are written out and converted
// once, here, rather than left as bare scale factors nobody can check.
import { useGLTF } from "@react-three/drei";
import { FELT_Y, FLOOR_Y } from "./geometry";
import { BAR_SHELVES, BAR_SHELF_OUT, wallAt } from "./Saloon";
import { Model, ModelSlot } from "./ModelSlot";

const M_PER_UNIT = 0.63;
const m = (metres: number) => metres / M_PER_UNIT;

// url -> [measured height in the file's own units, how far its lowest point sits BELOW
// its origin in those same units]. Both read off the meshes with a script; the shot
// glass is the one that needed the second number, its origin sitting up near the rim.
const PROP = {
  bottleGreen: { url: "/models/bottle-green.glb", h: 1.564, drop: 0.001 },
  bottleRed: { url: "/models/bottle-red.glb", h: 1.623, drop: 0.001 },
  shotGlass: { url: "/models/shot-glass.glb", h: 1.433, drop: 0.929 },
  crate: { url: "/models/bottle-crate.glb", h: 1.022, drop: 0 },
  barrel: { url: "/models/barrel.glb", h: 1.347, drop: -0.006 },
  keg: { url: "/models/keg.glb", h: 0.66, drop: -0.001 },
} as const;

type PropName = keyof typeof PROP;

// Same lesson as the guns: an unloaded file suspends whatever asked for it, and up here
// that is the whole room.
if (typeof window !== "undefined") for (const p of Object.values(PROP)) useGLTF.preload(p.url);

// One prop, standing on `on` (a floor or a table top) at (x, z), sized by its real
// height and turned by `spin` so no two copies of the same barrel face the same way.
function Prop({ name, tall, x, z, on, spin = 0 }: { name: PropName; tall: number; x: number; z: number; on: number; spin?: number }) {
  const p = PROP[name];
  const s = m(tall) / p.h;
  return <Model url={p.url} position={[x, on + p.drop * s, z]} rotation={[0, spin, 0]} scale={s} />;
}

// Bottles and glasses on the cloth, and barrels around the walls.
//
// Everything is placed as a fraction of `felt`, never in absolute units: the table grows
// with the player count, and a bottle left at a fixed radius would sit on the rim of a
// two-player table and halfway to the middle of a seven-player one.
//
// The band it may use is narrow and both edges are real. Inside 0.84 are the draw and
// discard piles; outside 0.92 of the inner ring is the row of cards each player has in
// play, and past that the gun waiting by their right hand. The cluster sits between
// them, off to one side of the near edge so it is not centred in front of anybody.
export function DecorInner({ felt, models }: { felt: number; models?: boolean }) {
  return (
    <ModelSlot enabled={models} fallback={null}>
      {/* On the table. A bottle and its glasses read as a game in progress; a second
          bottle across the felt keeps the near edge from being the only dressed part. */}
      <Prop name="bottleGreen" tall={0.3} x={felt * 0.3} z={felt * 0.42} on={FELT_Y} spin={0.6} />
      <Prop name="shotGlass" tall={0.075} x={felt * 0.21} z={felt * 0.5} on={FELT_Y} />
      <Prop name="shotGlass" tall={0.075} x={felt * 0.38} z={felt * 0.51} on={FELT_Y} spin={1.2} />
      <Prop name="bottleRed" tall={0.31} x={-felt * 0.44} z={-felt * 0.16} on={FELT_Y} spin={-1.1} />

      {/* Bottles on the bar's back shelf. The shelving is built in Saloon.tsx out of
          boxes; these are the same two models already standing on the table, so a stocked
          bar costs nothing to download. Two shelves rather than three — the top one reads
          as empty from the table and would only be eight more draw calls. */}
      {BAR_SHELVES.slice(0, 2).map((h, r) =>
        [-1.1, -0.42, 0.36, 1.05].map((t, i) => (
          <Prop
            key={`${r}-${i}`}
            name={(r + i) % 2 ? "bottleRed" : "bottleGreen"}
            tall={0.3}
            x={-wallAt(felt) + BAR_SHELF_OUT}
            z={t * felt}
            /* The shelf boards are 0.07 thick and positioned by their middle. */
            on={FLOOR_Y + h + 0.035}
            spin={i * 1.7 + r}
          />
        ))
      )}

      {/* On the floor, well outside the chairs — which stand at felt + 0.45 — and behind
          the far players, so orbiting round the back of the table reveals them instead
          of bare planks. They can never be walked through: the camera orbits on a sphere
          and at its lowest it still passes 1.17 above a barrel's lid. */}
      <Prop name="barrel" tall={0.85} x={-felt * 1.9} z={-felt * 1.5} on={FLOOR_Y} spin={0.4} />
      <Prop name="keg" tall={0.44} x={-felt * 1.62} z={-felt * 1.86} on={FLOOR_Y} spin={-0.9} />
      <Prop name="barrel" tall={0.85} x={felt * 2.05} z={-felt * 1.05} on={FLOOR_Y} spin={2.3} />
      <Prop name="crate" tall={0.4} x={felt * 1.72} z={felt * 1.95} on={FLOOR_Y} spin={-0.35} />
      <Prop name="keg" tall={0.44} x={felt * 2.0} z={felt * 1.62} on={FLOOR_Y} spin={1.7} />
    </ModelSlot>
  );
}
