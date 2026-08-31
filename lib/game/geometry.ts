// Where everyone is sitting, and how far a gun reaches.
//
// Seat order IS the distance metric — room.players is kept in clockwise order and the
// index is the seat — so this is the quietest place in the engine for a mistake to
// live: get it wrong and the game keeps playing, it just plays a different game.

import { CARD_DEF_BY_ID } from "../cards";
import { activeEffect } from "./events-read";
import { charEffect } from "./deck";
import { Player, Room, aliveBySeat } from "./state";

// Weapon range: the equipped gun's range, or 1 (Colt .45) if unarmed. Events may
// override it outright (Short Barrel / Sniper Nest) or shift it (Eagle Eye).
export function rangeOf(p: Player, room?: Room): number {
  let range = 1;
  for (const c of p.equipment) {
    const def = CARD_DEF_BY_ID[c.defId];
    if (def?.kind === "gun" && def.range) range = def.range;
  }
  if (!room) return range;
  const eff = activeEffect(room);
  if (eff.rangeOverride != null) range = eff.rangeOverride;
  return Math.max(1, range + (eff.rangeDelta ?? 0));
}

export function hasEquip(p: Player, defId: string): boolean {
  return p.equipment.some((c) => c.defId === defId);
}

// How many Barrel-style Draw!s a player gets when hit by a Bang!: one per Barrel
// in play, plus any the character brings innately.
export function barrelAttempts(p: Player): number {
  return (hasEquip(p, "barrel") ? 1 : 0) + (charEffect(p).extraBarrel ?? 0);
}

// Distance the viewer `from` sees to player `to`, counting only living players
// around the circle. Mustang and Paul Regret each add +1 to how far others see
// the target; Scope and Rose Doolan each subtract 1 from what the viewer sees.
// Both pairs stack (Paul Regret + Mustang = +2). Minimum 1.
export function distanceBetween(room: Room, from: Player, to: Player): number {
  if (from.id === to.id) return 0;
  // A ghost is not in the circle: the living count seats around it as though the chair
  // were empty, and nobody can measure a distance TO one (so nobody can shoot one). It
  // still has to measure its own way out, though, so for its own question — and only
  // then — it steps back into the ring at its own seat. `room.players` is already in
  // seat order, so the filter keeps the circle in order too.
  const ring = from.ghost
    ? room.players.filter((p) => p.alive || p.id === from.id)
    : aliveBySeat(room);
  const i = ring.findIndex((p) => p.id === from.id);
  const j = ring.findIndex((p) => p.id === to.id);
  if (i < 0 || j < 0) return Infinity;
  const raw = Math.abs(i - j);
  let dist = Math.min(raw, ring.length - raw);

  // A card and an ability that pull the same way stack: Paul Regret holding a
  // Mustang is seen at +2, Rose Doolan holding a Scope sees everyone at -2.
  if (hasEquip(to, "mustang")) dist += 1;
  dist += charEffect(to).distanceToDelta ?? 0;
  if (hasEquip(from, "scope")) dist -= 1;
  dist -= charEffect(from).distanceSeenDelta ?? 0;
  // Weather events stretch or flatten the whole table (Fog / Open Plains).
  dist += activeEffect(room).distanceDelta ?? 0;

  return Math.max(1, dist);
}
