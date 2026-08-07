"use client";

// The two pieces of furniture that exist per seat and per table, each in a modelled
// and a primitive form. Sizes are derived from the .glb bounding boxes measured with
// a script, not tuned by eye — see the constants below.
import { FLOOR_Y } from "./geometry";
import { Model, ModelSlot } from "./ModelSlot";

const CHAIR_URL = "/models/chair.glb";
const TABLE_URL = "/models/table.glb";

// Measured bounding boxes, in the .glb's own units.
const CHAIR_MODEL_SEAT = 0.737; // feet to the seat plane
const CHAIR_MODEL_BOTTOM = -0.003; // its lowest point, a hair under its origin
const TABLE_MODEL_H = 1.208; // floor to tabletop
const TABLE_MODEL_BOTTOM = -0.063; // its lowest point sits slightly below its origin

// A wooden chair, seat plane meeting `top` with its feet on the floor. `top` differs
// between the looks: the block figure's hips are at -0.5, the modelled cowboy's at
// -0.85. `face` turns its back away from the table — the model sits facing +z, the
// same convention the cowboy uses.
//
// This replaced a bar stool that lost on every measure: its origin was in a corner
// rather than under the seat, it was only 0.41 across at the right height so it had to
// be stretched 1.5x sideways to read as a seat at all, and it shipped as red vinyl
// needing a retint. This one is centred, 0.73 across at uniform scale, already wood,
// and 216 triangles against 352. Its back clears the felt by 0.135 — a backed chair
// used to be ruled out by the WANTED posters on the far wall, which are gone now.
export function Chair({ top, face, models }: { top: number; face: number; models?: boolean }) {
  const h = top - FLOOR_Y;
  const s = h / CHAIR_MODEL_SEAT;
  return (
    <ModelSlot
      enabled={models}
      fallback={
        <mesh position={[0, (FLOOR_Y + top) / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.3, 0.27, h, 16]} />
          <meshStandardMaterial color="#6b4626" roughness={0.9} />
        </mesh>
      }
    >
      <Model
        url={CHAIR_URL}
        position={[0, FLOOR_Y - CHAIR_MODEL_BOTTOM * s, 0]}
        rotation={[0, face, 0]}
        scale={s}
      />
    </ModelSlot>
  );
}

// The table's underside. The felt top is NOT modelled: it carries a generated
// texture (fibre, rim, sheriff star) and cards are positioned on it by radius, and
// its radius grows with the player count while a model's cannot. Scaling a fixed
// model to a 2.18-2.68 radius would stretch it 2.8x across and 1.3x tall and splay
// the carved legs, so the model plays the pedestal a real round table has: it fills
// floor to table-body only, and the wide felt overhangs it.
export function TableBase({ felt, models }: { felt: number; models?: boolean }) {
  const bodyBottom = -0.4; // underside of the wooden body TableInner draws
  const s = (bodyBottom - FLOOR_Y) / TABLE_MODEL_H;
  const legR = (felt + 0.12) * 0.72; // unchanged from the primitive table
  return (
    <ModelSlot
      enabled={models}
      fallback={
        <>
          {([[legR, legR], [legR, -legR], [-legR, legR], [-legR, -legR]] as const).map(([x, z], i) => (
            <mesh key={i} position={[x, -0.95, z]} castShadow>
              <cylinderGeometry args={[0.1, 0.08, 1.3, 16]} />
              <meshStandardMaterial color="#3f2410" roughness={0.85} />
            </mesh>
          ))}
        </>
      }
    >
      <Model url={TABLE_URL} position={[0, FLOOR_Y - TABLE_MODEL_BOTTOM * s, 0]} scale={s} />
    </ModelSlot>
  );
}
