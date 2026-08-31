"use client";

// Everything drawn at a seat other than the body: the nameplate, the patch of cloth in
// front of them, the aiming crosshair — and Opponents, which places one of each around
// the far arc. The hand of cards itself is in the figure's fist, over in Avatars.tsx.
import { useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Avatar, Tombstone } from "./Avatars";
import { CardMesh } from "../CardMesh";
import { FeltCards } from "./Cards";
import { FeltGun } from "./FeltGun";
import { Crosshair } from "./Crosshair";
import { PickSpot } from "./PickSpot";
import type { Gunfire } from "./Gunfire";
import { reachFor, type ReachMotion } from "./Draw";
import { Lean, useReaction } from "./Reactions";
import {
  AVATAR_COLORS,
  AVATAR_HEAD_Y,
  CARD_LIFT,
  crownY,
  equipRadius,
  faceCentre,
  FELT_Y,
  FLOOR_Y,
  SEAT_GAP,
  othersInTurnOrder,
  seatAngle,
  YOUR_SEAT_ANG,
} from "./geometry";
import type { Card } from "@/lib/cards";
import type { PlayerPublic, Role } from "@/lib/types";
import { ROLE_EMOJI } from "@/lib/types";



function Nameplate({ p, position, onClick }: { p: PlayerPublic; position?: [number, number, number]; onClick?: () => void }) {
  return (
    <Html
      center
      position={position}
      distanceFactor={6}
      style={{ pointerEvents: onClick ? "auto" : "none" }}
      /* Bounded, like every other overlay out here. Left unset, drei defaults the top of
         the range to 16,777,271 — so a plaque, which takes clicks whenever it is
         inspectable, sat in front of the Draw! reveal, the aiming crosshairs and the
         card picker, swallowing anything it happened to overlap. Above the badges lying
         on the felt (45) and below the reveals that interrupt play. */
      zIndexRange={[60, 50]}
    >
      <div
        onClick={onClick}
        title={onClick ? "Xem thông tin" : undefined}
        /* A solid plaque, not bare white text. Floating unbacked text read as
           unanchored and collided illegibly with the wall posters behind it. */
        style={{
          whiteSpace: "nowrap",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#f4e9d6",
          cursor: onClick ? "pointer" : "default",
          userSelect: "none",
          padding: "5px 11px 6px",
          borderRadius: 9,
          background: "rgba(24,18,12,0.82)",
          border: `1px solid ${p.isTurn ? "#e0a955" : "rgba(120,95,60,0.75)"}`,
          boxShadow: p.isTurn
            ? "0 0 0 2px rgba(224,169,85,0.25), 0 3px 10px rgba(0,0,0,0.5)"
            : "0 3px 10px rgba(0,0,0,0.5)",
          backdropFilter: "blur(2px)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
          {p.isTurn ? "▶ " : ""}
          {/* On its feet but still dead — the plaque is the only place that says so in
              words, since the figure itself looks like everyone else's. */}
          {p.ghost ? "👻 " : ""}
          {p.role ? ROLE_EMOJI[p.role] + " " : ""}
          {p.name}
        </div>
        <div style={{ fontSize: 12, letterSpacing: -1, marginTop: 1 }}>
          {"❤️".repeat(Math.max(0, p.hp))}
          <span style={{ opacity: 0.3 }}>{"🤍".repeat(Math.max(0, p.maxHp - p.hp))}</span>
          {/* The exact hand size, because the fan cannot carry it past about ten cards:
              at that point the cards overlap far enough that each shows 1-2 pixels of
              its own edge. The fan still tells you at a glance who is loaded; this
              tells you by how much. */}
          <span style={{ letterSpacing: 0, marginLeft: 6, opacity: 0.85, fontVariantNumeric: "tabular-nums" }}>
            🂠 {p.handCount}
          </span>
        </div>
        {p.character && (
          <div style={{ fontSize: 10, opacity: 0.75, marginTop: 1 }}>{p.character.name}</div>
        )}
      </div>
    </Html>
  );
}

// ─── Whose turn it is, said over the head ────────────────────────────────────
// The first attempt at this was an arrow 0.62 tall parked at y=1.75, which is 182px on
// screen at the nearest seat — two head-diameters of arrow aimed at one head, floating
// above even the nameplate. It was pulled for that, and TurnLight took over.
//
// It was never the arrow that was wrong, it was the envelope. The room it needed was
// never up there: the hat tops out at 1.05 and the plaque used to start at 1.20, so
// there was a gap sitting directly ON the hat and the old arrow had gone looking for
// space above the plaque instead.
//
// The first size fitted in that gap was 0.17, which read as small in play: 20px tall at
// the far side of a seven-player table, on a 900px window. This is the original 0.62
// back — 73px far side, 268px at the nearest seat — but ON the hat rather than above the
// plaque, which is the half of the old attempt that was actually wrong.
//
// The width did NOT scale with it. 0.17x0.21 was wider than tall because a small mark
// needs the silhouette; at 0.62 that ratio is 0.78 across, 449px at the near seat of a
// four-player table, and it stops reading as an arrow at all. Taller than wide is what
// a pointer looks like.
const MARK_H = 0.62;
const MARK_W = 0.42;
// Clear of the hat, not perched on it: the tip stops this far short of the crown, which
// is enough for the shape to read as pointing AT the head rather than growing out of it.
const MARK_GAP = 0.07;
// Hai figure đội mũ lệch 0.2 nhau, nên độ cao này đọc từ crownY() ở geometry.ts. Trước
// đây nó nhận cờ `models` — đúng khi kiểu thân và kiểu model là một chuyện, và SAI kể từ
// khi thân tách ra: `models` vẫn bật cho bàn/ghế/đồ đạc, nên dấu sẽ treo ở 1.05 trên một
// cái đầu hình khối cao 0.85 và bay lơ lửng cách 0.2. Chính là con bug cũ thu nhỏ.
const markY = () => crownY() + MARK_GAP + MARK_H / 2;

// And the plaque moves up out of the way. Its height in WORLD units is not fixed:
// <Html distanceFactor={f}> scales by f/(2·tan(fov/2)·dist), which works out to
// `elementPx · f / viewportHeight` of world — so the shorter the browser window, the
// bigger the plaque grows out here. The arrow now reaches 1.74, and a ~59px plaque is
// half a world unit tall by the time the window is down to 700px, so it has to sit this
// high to stay off it. Anything under 1.99 starts clipping the arrow on a laptop; this
// keeps 0.047 of daylight there and 0.15 on a desktop.
const PLATE_Y = 2.04;
// It turns rather than bobbing. Bobbing spends vertical room and there are three
// hundredths spare; turning spends none, and four flat facets take the lamp one at a
// time, so it flares once a revolution without anything animating the material.
const MARK_SPIN = 0.9; // rad/s

function TurnMarker({ position }: { position: [number, number, number] }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += MARK_SPIN * dt;
  });
  return (
    <group ref={g} position={position}>
      {/* Four radial segments, not a smooth cone: a faceted head reads as struck brass,
          and it is a solid pyramid rather than a flat chevron so there is no angle it
          can be seen edge-on from and vanish. */}
      <mesh rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[MARK_W / 2, MARK_H, 4]} />
        <meshStandardMaterial
          color="#e0a955"
          emissive="#ffae3d"
          emissiveIntensity={0.55}
          metalness={0.75}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

// How far in front of the seat the face-down fan lies. Named because the ring that
// surrounds it has to be centred on the same spot.
const FAN_Z = -0.1;
// The steal ring, now that there is no fan under it to size itself against. Fixed at
// what a six-card fan used to need — big enough to aim at from across the table, and at
// 1.19 across it still clears the 1.89 between neighbouring seats at a seven-player
// table, which is the tightest seating there is.
const SPOT_R = 0.52;
const SPOT_SQUASH = 0.54;

// A seat's own patch of cloth, in front of where they sit.
//
// It used to carry a face-down fan of their hand. Those cards are in the figure's fist
// now (HeldFan in Avatars.tsx), so what is left here is the SPOT — lit with the same
// gold ring as the draw pile while Jesse Jones is choosing whose hand to raid, because
// it is the same gesture: reach out and take those cards.
//
// The ring stayed on the cloth rather than following the cards into the hand. A ring is
// a flat thing drawn on a surface; there is no surface in mid-air, and a click target
// that moves with a swivelling body is one you have to chase. The spot in front of a
// seat reads as "that player", which is what stealing actually targets.
// A face-down fan of an opponent's hand, lying on their patch of cloth.
//
// This is where every hand used to be. It moved into the figure's fist when the modelled
// bodies arrived — but the BLOCK figures have no fists, so with the fan gone their hands
// were nowhere in the scene at all, leaving the count on the plaque as the only trace of
// a card. So it comes back for that look, and only for that look: drawn in both, one
// hand would be on the table and in a fist at the same time.
//
// Capped at six, which is also the number SPOT_R was measured against — so the steal
// ring that outlived the fan still frames it exactly, with nothing to re-measure.
const FAN_MAX = 6;
const FAN_STEP = 0.12;

function FeltHand({ count }: { count: number }) {
  const n = Math.min(count, FAN_MAX);
  if (n <= 0) return null;
  return (
    <>
      {Array.from({ length: n }).map((_, i) => {
        const off = (i - (n - 1) / 2) * FAN_STEP;
        return (
          // ON the cloth, not over it. The old fan sat 0.10 above the felt — a third of
          // a card's own width, and the reason the whole table read as hovering. These
          // stack by the depth-buffer margin instead, like every other card lying flat:
          // the z-rotation is applied BEFORE the -90° that lays them down, so it spins
          // each card in its own plane and none of them tilts into the cloth.
          <CardMesh
            key={i}
            faceDown
            scale={0.5}
            position={[off, FELT_Y + CARD_LIFT + i * 0.004, FAN_Z]}
            rotation={[-Math.PI / 2, 0, off * 0.25]}
          />
        );
      })}
    </>
  );
}

function OpponentSpot({ stealable, onSteal }: { stealable?: boolean; onSteal?: () => void }) {
  if (!stealable || !onSteal) return null;
  return (
    <PickSpot
      radius={SPOT_R}
      squash={SPOT_SQUASH}
      center={[0, FAN_Z]}
      hit={[2 * (SPOT_R + 0.07), 2 * (SPOT_R * SPOT_SQUASH + 0.07)]}
      ringY={FELT_Y + 0.002}
      onPick={onSteal}
    />
  );
}

// A crosshair "scope" floating over a valid Bang! target. Green = available,
// yellow when hovered. Click to pick this player.
function TargetMarker({ position, onClick }: { position: [number, number, number]; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const col = hover ? "#ffd24a" : "#33d17a";
  return (
    <Html center position={position} distanceFactor={6} style={{ pointerEvents: "auto" }} zIndexRange={[40, 30]}>
      <div
        onClick={onClick}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        style={{ cursor: "pointer", filter: `drop-shadow(0 0 6px ${col})` }}
        title="Bắn mục tiêu này"
      >
        <Crosshair
          size={hover ? 66 : 58}
          color={col}
          fill={hover ? "rgba(255,210,74,0.18)" : "rgba(51,209,122,0.12)"}
          stroke={7}
        />
      </div>
    </Html>
  );
}


// Your own seat, on the near edge. It used to be deliberately bare — no nameplate, no
// cards laid out like everyone else's — on the reasoning that you are the camera and
// your own hp, role and character are already in the HUD. That held while the camera
// was bolted to one angle and your seat was off the bottom of the frame. It stopped
// holding the moment the room could be turned: orbit round and your chair is in shot
// like any other, and it was the one seat with nothing over it.
//
// So it now carries what an opponent's carries — plaque, turn arrow, cards in play at
// the same radius and in your own colour. Two things it still does not: the aiming
// crosshair, because you cannot shoot yourself, and the fan of face-down cards, because
// your hand is the real thing in DOM under the canvas and a second, differently-sized
// copy of it on the felt would contradict it.
export function YourAvatar({
  you,
  players,
  count,
  ring,
  felt,
  shot,
  aiming,
  reach,
  onInspect,
  models,
}: {
  // Read off view.you, not the players array: the array hides roles from everyone,
  // including from you, so your own sheriff star would never light up.
  you: { alive: boolean; ghost: boolean; hp: number; role: Role | null; equipment: Card[]; seat: number; hand: Card[] };
  players: PlayerPublic[];
  count: number;
  ring: number;
  felt: number;
  shot?: Gunfire | null;
  aiming?: boolean;
  reach?: ReachMotion | null;
  onInspect?: (c: Card) => void;
  models?: boolean;
}) {
  const reaction = useReaction(you.alive, you.hp);
  const seatR = felt + SEAT_GAP;
  const x = seatR * Math.cos(YOUR_SEAT_ANG);
  const z = seatR * Math.sin(YOUR_SEAT_ANG);
  // Opponents take colours 0..count-2 in seating order, so this one is yours alone —
  // a table maxes out at 7, which is exactly how many colours there are.
  const color = AVATAR_COLORS[(count - 1) % AVATAR_COLORS.length];
  const aimAt = shot?.youFired ? shot.to : undefined;
  // Your own row in the players array carries name, hp, hand size, character and whose
  // turn it is — everything the plaque needs except the role, which the server blanks
  // for every seat including yours, so that one comes off view.you.
  const me = players.find((q) => q.seat === you.seat);
  const plaque = me && { ...me, role: you.role };
  // A ghost is up: the figure comes back and the grave stands empty for the length of
  // the turn, which is the whole signal — nobody else at this table is sitting in a
  // chair they were buried under.
  if (!you.alive && !you.ghost && reaction?.kind !== "fall")
    return (
      <>
        <Tombstone position={[x, FLOOR_Y, z]} />
      </>
    );
  return (
    <>
      {/* Không có biển tên trên đầu CHÍNH BẠN. Tên, máu và vai của bạn đã nằm trong HUD
          dưới canvas — cùng lý do quạt bài của bạn không được dựng trong scene: một bản
          thứ hai của cùng thông tin, ở cỡ khác, chỉ làm che bàn. Đối thủ vẫn có biển,
          vì với họ đó là bản DUY NHẤT. */}
      {plaque?.isTurn && <TurnMarker position={[x, markY(), z]} />}
      <FeltCards cards={you.equipment} ang={YOUR_SEAT_ANG} radius={equipRadius(ring)} onInspect={onInspect} color={color} />
      <FeltGun equipment={you.equipment} x={x} z={z} face={faceCentre(YOUR_SEAT_ANG)} models={models} />
      {/* Quạt bài úp cho ghế của CHÍNH BẠN, cùng khung với mọi đối thủ: ở VÀNH NỈ (ring), không
          phải ở ghế (seatR — chỗ đó nằm ngoài mặt nỉ), quay -ang - π/2.

          Chỗ này từng cố ý để trống, với lý do ghi ở Seat bên dưới: bài thật của bạn đã nằm
          trong HUD dưới canvas nên một bản thứ hai khác cỡ sẽ mâu thuẫn với nó. Lý lẽ đó đúng
          khi xét riêng ghế bạn và sai khi xét cả bàn — bàn 7 ghế có 6 quạt và một ghế trống trơ
          đọc như thể người đó không có bài. Bản úp này không mâu thuẫn với HUD: nó nói SỐ bài
          cho người khác thấy, đúng việc quạt của họ đang làm cho bạn. */}
      <group
        position={[ring * Math.cos(YOUR_SEAT_ANG), 0, ring * Math.sin(YOUR_SEAT_ANG)]}
        rotation={[0, -YOUR_SEAT_ANG - Math.PI / 2, 0]}
      >
        <FeltHand count={you.hand.length} />
      </group>
      <Lean ang={YOUR_SEAT_ANG} seat={[x, z]} reaction={reaction}>
        <Avatar
          position={[x, 0, z]}
          color={color}
          sheriff={you.role === "sheriff"}
          faceAngle={faceCentre(YOUR_SEAT_ANG)}
          aimAt={aimAt}
          firingKey={shot?.youFired ? shot.key : null}
          aiming={aiming}
          reachKey={reach?.seq ?? null}
          reachAt={reach?.from ?? null}
          handCount={you.hand.length}
          equipment={you.equipment}
          seat={you.seat}
          character={me?.character?.id}
          look={me?.look}
          models={models}
        />
      </Lean>
    </>
  );
}

export function Opponents({
  players,
  youSeat,
  ring,
  felt,
  arc,
  targetIds,
  onPickTarget,
  onInspect,
  onInspectPlayer,
  pickCardMode,
  onPickCard,
  shot,
  aimingSeat,
  reaches,
  stealIds,
  onSteal,
  models,
}: {
  players: PlayerPublic[];
  youSeat: number;
  ring: number;
  felt: number;
  arc: number;
  targetIds?: string[];
  onPickTarget?: (id: string) => void;
  onInspect?: (c: Card) => void;
  onInspectPlayer?: (p: PlayerPublic) => void;
  pickCardMode?: boolean;
  onPickCard?: (ownerId: string, cardId: string) => void;
  shot?: Gunfire | null;
  aimingSeat?: number | null;
  reaches?: ReachMotion[];
  // Jesse Jones' draw phase: whose hands he may take a card from, and taking it.
  stealIds?: string[];
  onSteal?: (playerId: string) => void;
  models?: boolean;
}) {
  // Order opponents by turn order relative to the viewer (the player right after
  // you first) so the seating reads the same from everyone's perspective.
  const n = players.length;
  const others = othersInTurnOrder(players, youSeat, n);
  const seatR = felt + SEAT_GAP; // avatars out past the felt so bodies don't cover it
  return (
    <>
      {others.map((p, i) => (
        <Seat
          key={p.id}
          p={p}
          // Spread across the far arc (centered straight ahead, away from the camera).
          ang={seatAngle(i, others.length, arc)}
          color={AVATAR_COLORS[i % AVATAR_COLORS.length]}
          {...{ ring, seatR, targetIds, onPickTarget, onInspect, onInspectPlayer, pickCardMode, onPickCard, shot, models }}
          aiming={aimingSeat === p.seat}
          reach={reaches ? reachFor(reaches, p.seat) : null}
          stealable={!!stealIds?.includes(p.id)}
          onSteal={onSteal ? () => onSteal(p.id) : undefined}
        />
      ))}
    </>
  );
}

// One opponent's seat. A component rather than the body of that loop because the
// fall on death is per-seat state, and a hook cannot live inside a map.
function Seat({
  p,
  ang,
  color,
  ring,
  seatR,
  targetIds,
  onPickTarget,
  onInspect,
  onInspectPlayer,
  pickCardMode,
  onPickCard,
  shot,
  aiming,
  reach,
  stealable,
  onSteal,
  models,
}: {
  p: PlayerPublic;
  ang: number;
  color: string;
  ring: number;
  seatR: number;
  targetIds?: string[];
  onPickTarget?: (id: string) => void;
  onInspect?: (c: Card) => void;
  onInspectPlayer?: (p: PlayerPublic) => void;
  pickCardMode?: boolean;
  onPickCard?: (ownerId: string, cardId: string) => void;
  shot?: Gunfire | null;
  aiming?: boolean;
  reach?: ReachMotion | null;
  stealable?: boolean;
  onSteal?: () => void;
  models?: boolean;
}) {
  const reaction = useReaction(p.alive, p.hp);
  const x = ring * Math.cos(ang);
  const z = ring * Math.sin(ang);
  const ax = seatR * Math.cos(ang);
  const az = seatR * Math.sin(ang);
  const targetable = !!targetIds?.includes(p.id);
  // Where this seat's gun should point if it comes up. Tied to the shot rather than to
  // the standoff: a Bang! the target cannot answer opens no pending at all, and the arm
  // still has to have somewhere to point.
  const aimAt = shot?.shooter.seat === p.seat ? shot.to : undefined;
  return (
    <group>
      <group position={[x, 0, z]} rotation={[0, -ang - Math.PI / 2, 0]}>
        <OpponentSpot stealable={stealable} onSteal={onSteal} />
        {/* Same frame as the ring, so the one lands round the other. Your own seat has one of
            these too now (see YourAvatar). It used to be left out because your hand is already
            the real thing in DOM under the canvas — true for your seat alone, false for the
            table, where six fans and one bare seat read as "that player has no cards". */}
        {/* Quạt bài úp bám vào việc thân người có nắm tay hay không, KHÔNG bám vào cờ
            `models`. Hình khối không có nắm tay nên bài phải nằm trên nỉ; hồi trước hai
            chuyện đó trùng nhau nên một điều kiện là đủ, giờ thân đã tách khỏi `models`
            và điều kiện cũ sẽ làm bài không hiện ở đâu cả. */}
        <FeltHand count={p.handCount} />
      </group>
      {p.alive || p.ghost || reaction?.kind === "fall" ? (
        <Lean ang={ang} seat={[ax, az]} reaction={reaction}>
          <Avatar
            position={[ax, 0, az]}
            color={color}
            dead={false}
            sheriff={p.role === "sheriff"}
            faceAngle={faceCentre(ang)}
            aimAt={aimAt}
            firingKey={shot?.shooter.seat === p.seat ? shot.key : null}
            aiming={aiming}
            reachKey={reach?.seq ?? null}
            reachAt={reach?.from ?? null}
            handCount={p.handCount}
            equipment={p.equipment}
            seat={p.seat}
            character={p.character?.id}
            look={p.look}
            models={models}
          />
        </Lean>
      ) : (
        <Tombstone position={[ax, FLOOR_Y, az]} />
      )}
      <Nameplate p={p} position={[ax, PLATE_Y, az]} onClick={onInspectPlayer ? () => onInspectPlayer(p) : undefined} />
      {p.isTurn && (p.alive || p.ghost) && <TurnMarker position={[ax, markY(), az]} />}
      <FeltCards cards={p.equipment} ang={ang} radius={equipRadius(ring)} onInspect={onInspect} color={color} pickable={!!pickCardMode && targetable} onPickCard={(cid) => onPickCard?.(p.id, cid)} />
      {/* Gated on the seat still being occupied: killPlayer sends a corpse's equipment to
          the discard, so heldGun would fall back to the free Colt .45 and stand a gun up at
          an empty chair. FeltCards above needs no such guard — an empty array draws nothing. */}
      {(p.alive || p.ghost) && (
        <FeltGun equipment={p.equipment} x={ax} z={az} face={faceCentre(ang)} models={models} />
      )}
      {targetable && onPickTarget && (
        // Right on the head — you are aiming at them, so the crosshair rings the
        // face. It used to float at y=1.6, above even the nameplate, which put it in
        // the top band of the screen where the aiming instruction bar covers it. That
        // bar cannot be drawn under: it is `position: fixed` at zIndex 56 while the
        // whole canvas is a zIndex-40 stacking context, so nothing inside the scene
        // can ever paint over it. The head sits well below that band, which is what
        // keeps the scope clickable.
        <TargetMarker position={[ax, AVATAR_HEAD_Y, az]} onClick={() => onPickTarget(p.id)} />
      )}
    </group>
  );
}
