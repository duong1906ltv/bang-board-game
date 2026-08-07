"use client";

// Cards as objects on the table: equipment laid out on the felt, the draw/discard
// piles in the middle, and the flight a freshly drawn card makes into your hand.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { CardMesh } from "../CardMesh";
import { Crosshair } from "./Crosshair";
import { CARD_DEF_BY_ID, CARD_ICON, type Card } from "@/lib/cards";
import { CARD_LIFT, DECK_X, DISCARD_X, FELT_Y, deckTop } from "./geometry";
import { PickSpot } from "./PickSpot";

// Centre-to-centre spacing of the cards in a row in play. Exported because the gun
// waiting beside them is placed one slot to the right of it (see restGun).
export const FELT_CARD_GAP = 0.38;

// A gun used to be drawn here too, a small copy lying beside its weapon card. It is
// gone: the gun a player owns now waits on the cloth in front of them at full size and
// is picked up to fire (see restGun in Avatars.tsx), so a second one next to the card
// was the same weapon twice — and the wrong size of the two.
export function FeltCards({ cards, ang, radius, onInspect, color, pickable, onPickCard }: { cards: Card[]; ang: number; radius: number; onInspect?: (c: Card) => void; color?: string; pickable?: boolean; onPickCard?: (cardId: string) => void }) {
  if (!cards.length) return null;
  const cx = radius * Math.cos(ang);
  const cz = radius * Math.sin(ang);
  const gap = FELT_CARD_GAP;
  // Orient the row so each card's long axis points toward the table centre
  // (portrait, facing the seat) and cards spread tangentially.
  return (
    <group position={[cx, 0, cz]} rotation={[0, Math.PI / 2 - ang, 0]}>
      {cards.map((c, i) => {
        const o = (i - (cards.length - 1) / 2) * gap;
        const def = CARD_DEF_BY_ID[c.defId];
        const suffix =
          def?.kind === "gun" && def.range
            ? `${def.range}`
            : c.defId === "scope"
            ? "−1"
            : c.defId === "mustang"
            ? "+1"
            : "";
        return (
          <group key={c.id} position={[o, 0, 0]}>
            <CardMesh card={c} scale={0.46} position={[0, FELT_Y + CARD_LIFT, 0]} rotation={[-Math.PI / 2, 0, 0]} />
            {/* a scope over each selectable card so it's easy to pick (Cat Balou / Panic) */}
            {pickable && (
              <Html center position={[0, 0.3, 0]} distanceFactor={7} style={{ pointerEvents: "auto" }} zIndexRange={[46, 36]}>
                <div
                  onClick={() => onPickCard?.(c.id)}
                  title="Chọn lá này"
                  style={{ cursor: "pointer", filter: "drop-shadow(0 0 6px #33d17a)" }}
                >
                  <Crosshair size={42} color="#33d17a" fill="rgba(51,209,122,0.18)" stroke={8} />
                </div>
              </Html>
            )}
            {/* icon badge above the card; tap to see the full card + effect */}
            {/* Bounded z-index so table badges stay UNDER center overlays like the
                CheckFx reveal (which sits at 70–80) instead of poking through it. */}
            <Html center position={[0, 0.14, -0.28]} distanceFactor={9} style={{ pointerEvents: "auto" }} zIndexRange={[45, 30]}>
              <div
                title={pickable ? "Chọn lá này" : def?.effect}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onClick={() => (pickable && onPickCard ? onPickCard(c.id) : onInspect?.(c))}
                style={{
                  whiteSpace: "nowrap",
                  fontFamily: "system-ui, sans-serif",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#fff",
                  background: pickable ? "rgba(20,110,50,0.9)" : "rgba(20,18,16,0.85)",
                  border: `2px solid ${pickable ? "#33d17a" : color ?? "rgba(240,226,192,0.5)"}`,
                  boxShadow: pickable ? "0 0 8px #33d17a" : undefined,
                  padding: "0 5px",
                  borderRadius: 7,
                  textShadow: "0 1px 2px #000",
                  cursor: "pointer",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                }}
              >
                {/* Guns: 🎯 + range (same style as the header range badge) — avoids
                    the green water-pistol 🔫 emoji and the dark, hard-to-see rifle art. */}
                {def?.kind === "gun" ? "🎯" : (CARD_ICON[c.defId] ?? "🔵")}
                {suffix && <span style={{ fontSize: 10, fontWeight: 800, marginLeft: 2 }}>{suffix}</span>}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

// The draw pile — and, on your draw phase, the draw BUTTON. A gold ring pulses on
// the cloth around it and the whole stack takes the click, so drawing is done by
// reaching for the deck instead of pressing a control docked under the table.
//
// The ring is the only affordance out here on purpose: the sentence explaining it
// belongs in the HUD (see the note above the turn panel in Table.tsx about keeping
// the felt free of DOM).
function DrawPile({ count, live, onDraw }: { count: number; live: boolean; onDraw?: () => void }) {
  const stack = Math.min(Math.max(count, 1), 6);
  return (
    <group position={[DECK_X, 0, 0]}>
      {Array.from({ length: stack }).map((_, i) => (
        <CardMesh key={i} faceDown scale={0.72} position={[0, i * 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      ))}
      {live && onDraw && (
        // Radii are measured, not picked: a 0.72-scale card's half-diagonal is 0.39,
        // so 0.40 clears its corners and the outer edge stops well short of the
        // discard pile 0.9 away. The ring sits on the cloth UNDER the cards — this
        // group is already a card's lift above the felt, so come back down to
        // FELT_Y + 0.002. The hit plane is the whole ringed area, 0.96 across,
        // rather than one 0.45-wide card.
        <PickSpot radius={0.4} hit={[0.96, 0.96]} ringY={0.002 - CARD_LIFT} onPick={onDraw} />
      )}
    </group>
  );
}

// Draw pile + discard pile in the middle of the table. The top discarded card is
// shown face-up so the centre reads as an active play area.
//
// It used to open the card modal on click, because lying flat at table scale it was
// legible as a shape but not as a card. It now carries its own effect text at twice
// the resolution (`detail`), so the card IS the readout and the modal was one tap of
// ceremony in front of information already on the table. Zoom does the rest.
//
// Neither pile carries a counter any more. The numbers were the only floating HUD
// left out on the felt, and the piles already show what they need to: the draw stack
// grows with `deckCount`, and the discard shows its top card face-up.
export function CenterPiles({ deckCount, discardCount, topDiscard, canDraw, onDrawDeck }: { deckCount: number; discardCount: number; topDiscard: Card | null; canDraw?: boolean; onDrawDeck?: () => void }) {
  return (
    <group position={[0, FELT_Y + CARD_LIFT, 0]}>
      <DrawPile count={deckCount} live={!!canDraw} onDraw={onDrawDeck} />
      <group position={[DISCARD_X, 0, 0]}>
        {topDiscard ? (
          <CardMesh card={topDiscard} detail scale={0.72} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0.2]} />
        ) : (
          discardCount > 0 && <CardMesh faceDown scale={0.72} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0.25]} />
        )}
      </group>
    </group>
  );
}

// A single card animating from the draw pile at table centre toward "you" (the
// camera), arcing up and turning face-up along the way, so a draw reads as "that
// card came to me". Removes itself once it reaches the near edge.
function DrawFlight({
  card,
  delay,
  felt,
  camY,
  camZ,
  onDone,
}: {
  card: Card;
  delay: number;
  felt: number;
  camY: number;
  camZ: number;
  onDone: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const t = useRef(-delay); // stagger multiple cards drawn in the same turn
  const DUR = 0.7;
  // Straight off the top of the pile — the same point the reaching arms aim at.
  const from = useMemo(deckTop, []);
  // Arc apex, lifted high over the felt on the way toward the camera.
  const mid = useMemo(() => new THREE.Vector3(-0.2, felt * 0.9, felt * 0.5), [felt]);
  // Near the camera, low and forward, so it reads as arriving in your hand.
  const to = useMemo(() => new THREE.Vector3(0, camY * 0.42, camZ * 0.72), [camY, camZ]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    t.current += dt;
    if (t.current < 0) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const p = Math.min(t.current / DUR, 1);
    const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
    // Quadratic Bézier from → mid → to.
    const u = 1 - e;
    g.position.set(
      u * u * from.x + 2 * u * e * mid.x + e * e * to.x,
      u * u * from.y + 2 * u * e * mid.y + e * e * to.y,
      u * u * from.z + 2 * u * e * mid.z + e * e * to.z
    );
    // Lie flat on the deck → stand up facing the camera, with a little spin.
    g.rotation.x = -Math.PI / 2 + (Math.PI / 2 - 0.35) * e;
    g.rotation.z = Math.sin(e * Math.PI) * 0.5;
    const s = 0.72 * (0.7 + 0.7 * e);
    g.scale.setScalar(s);
    // Fade out over the last stretch as it "tucks" into the hand.
    const opacity = p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m) {
        m.transparent = true;
        m.opacity = opacity;
      }
    });
    if (p >= 1) onDone();
  });

  return (
    <group ref={group} visible={false}>
      <CardMesh card={card} />
    </group>
  );
}

// Watches your hand and launches a DrawFlight for each newly-added card, so
// drawn cards visibly travel from the deck toward you instead of just popping in.
export function FlyingCards({ hand, felt, camY, camZ }: { hand: Card[]; felt: number; camY: number; camZ: number }) {
  const [flights, setFlights] = useState<{ key: string; card: Card; delay: number }[]>([]);
  const prev = useRef<string[]>(hand.map((c) => c.id));
  const primed = useRef(false);

  useEffect(() => {
    const ids = hand.map((c) => c.id);
    if (!primed.current) {
      // Skip the initial mount (entering 3D) so the whole hand doesn't fly in.
      primed.current = true;
      prev.current = ids;
      return;
    }
    const added = hand.filter((c) => !prev.current.includes(c.id));
    prev.current = ids;
    if (added.length) {
      setFlights((f) => [
        ...f,
        ...added.map((c, i) => ({ key: `${c.id}-${i}`, card: c, delay: i * 0.14 })),
      ]);
    }
  }, [hand]);

  const done = (key: string) => setFlights((f) => f.filter((x) => x.key !== key));

  return (
    <>
      {flights.map((fl) => (
        <DrawFlight
          key={fl.key}
          card={fl.card}
          delay={fl.delay}
          felt={felt}
          camY={camY}
          camZ={camZ}
          onDone={() => done(fl.key)}
        />
      ))}
    </>
  );
}
