"use client";

// Cards changing hands, as something bodies do. Whoever gains the card reaches for
// wherever it is coming from; when it comes off another PLAYER, that player reaches back
// — a handover between two people, not a snatch at somebody sitting out of arm's length.
//
// The gesture carries it alone: no cards are drawn travelling. A bunch used to fly from
// the pile to the seat alongside the arm, and once the arm existed that was the same
// event told twice, the second telling adding nothing but clutter over the felt.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CARD_DEF_BY_ID } from "@/lib/cards";
import { deckTop, discardTop, seatPositions } from "./geometry";
import type { LogEntry, PlayerPublic } from "@/lib/types";

// Out, hold over the source, back. The hold is what separates PICKING UP from a hand
// waving across the table — without a pause at the far end the arm just bounces.
export const REACH_OUT = 0.34;
export const REACH_GRAB = 0.14;
export const REACH_BACK = 0.42;
export const REACH_DUR = REACH_OUT + REACH_GRAB + REACH_BACK;
// The far side answers a beat late, so the pair reads as one person asking and the other
// obliging rather than as two people moving on a count.
const RESPOND_LAG = 0.12;

// Where a card on a PLAYER is reached for: over their own face-down fan, which Players
// lays on the felt at the `ring` radius. Aiming at their chest instead would have the
// hand grab at empty cloth a body-width from the cards you can see. Close enough for
// their in-play row too — that sits 0.07 further in, which no reach can tell apart.
const FAN_Y = 0.18;

// Read off the registry rather than hardcoded, so renaming a card in cards.ts cannot
// silently kill the gesture. These are the two plays that move a card off a player:
// Panic! takes it for itself, Cat Balou throws it away.
const TAKE_FROM = CARD_DEF_BY_ID.panic.name;
const TOSS_FROM = CARD_DEF_BY_ID["cat-balou"].name;

export interface ReachMotion {
  // Per LEG, not per event. One transfer is two arms, and Jesse Jones' draw is two
  // reaches by ONE arm to two different places; a changing seq is what restarts the arm
  // on the next one.
  seq: number;
  logId: number; // the log entry behind it, for ordering against shots and deaths
  seat: number;
  from: THREE.Vector3; // what the hand goes for
}

// The newest leg running at this seat. Newest, not first: Jesse's steal leg is still
// expiring as his deck leg arrives, and picking the first would leave the arm pointing
// at the victim while he is already helping himself to the pile.
export function reachFor(reaches: ReachMotion[], seat: number): ReachMotion | null {
  let best: ReachMotion | null = null;
  for (const r of reaches) if (r.seat === seat && (!best || r.seq > best.seq)) best = r;
  return best;
}

// Every reach the newest broadcast calls for, held until its animation has run.
//
// A list, not the single newest: one broadcast can carry a transfer (two seats moving at
// once) or an event that deals to the whole table (one log line per player), and taking
// only the last would leave everybody but one person sitting still.
export function useReaches(
  log: LogEntry[],
  players: PlayerPublic[],
  youSeat: number,
  arc: number,
  felt: number,
  ring: number
): ReachMotion[] {
  const [reaches, setReaches] = useState<ReachMotion[]>([]);
  const seen = useRef(-1);
  const seq = useRef(0);
  // Timers outlive the effect that made them ON PURPOSE. Jesse's second leg is scheduled
  // a whole REACH_DUR out and a broadcast lands long before then, so a cleanup tied to
  // the effect would cancel the deck reach every single time.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    const last = log[log.length - 1];
    if (!last || last.id <= seen.current) return;
    const prev = seen.current;
    seen.current = last.id;
    // The log arrives pre-populated on the first view of a room. Replaying its history
    // would have the whole table grabbing at each other the moment you walk in.
    if (prev < 0) return;

    const after = (ms: number, fn: () => void) => {
      const id = setTimeout(() => {
        timers.current.delete(id);
        fn();
      }, ms);
      timers.current.add(id);
    };
    // Show a leg, then take it away once it has played. Each leg times itself out, so
    // the two halves of a transfer expire independently rather than on a shared clock.
    const emit = (seat: number, from: THREE.Vector3, logId: number, delay: number) => {
      const m: ReachMotion = { seq: seq.current++, logId, seat, from };
      const show = () => {
        setReaches((r) => [...r, m]);
        after(REACH_DUR * 1000, () => setReaches((r) => r.filter((x) => x.seq !== m.seq)));
      };
      if (delay > 0) after(delay * 1000, show);
      else show();
    };

    const seats = seatPositions(players, youSeat, arc, felt);
    // The log identifies people by NAME and carries no id, so two players who picked the
    // same name are indistinguishable. Skip rather than make the wrong one reach.
    const one = (nm?: string) => {
      const hits = players.filter((p) => p.name === nm);
      return hits.length === 1 ? hits[0] : undefined;
    };
    // Where a seat's own cards lie: out along its bearing from the middle, at the radius
    // Players puts the face-down fan on.
    const cardsOf = (seat: number) => {
      const at = seats.get(seat);
      if (!at) return null;
      const d = at.clone().setY(0);
      return d.lengthSq() < 1e-6 ? null : d.normalize().multiplyScalar(ring).setY(FAN_Y);
    };

    // One card off one player and into another's hand — or into the discard. Both bodies
    // move: the taker reaches over, and a beat later the other answers, towards the taker
    // if they are handing it over and towards the middle if they are throwing it away.
    // Which way the far side turns is the only thing that says where the card went, now
    // that nothing is drawn travelling.
    const transfer = (logId: number, taker: PlayerPublic, victim: PlayerPublic, toDiscard: boolean) => {
      const theirs = cardsOf(victim.seat);
      const mine = cardsOf(taker.seat);
      if (!theirs || !mine) return false;
      emit(taker.seat, theirs, logId, 0);
      emit(victim.seat, toDiscard ? discardTop() : mine, logId, RESPOND_LAG);
      return true;
    };

    for (const e of log) {
      if (e.id <= prev) continue;

      if (e.kind === "play" && e.b && (e.card === TAKE_FROM || e.card === TOSS_FROM)) {
        const actor = one(e.a);
        const victim = one(e.b);
        if (actor && victim && actor.seat !== victim.seat) {
          transfer(e.id, actor, victim, e.card === TOSS_FROM);
        }
        continue;
      }

      if (e.kind !== "draw") continue;
      const n = e.n ?? 0;
      if (n <= 0) continue;
      const drawer = one(e.a);
      if (!drawer || !cardsOf(drawer.seat)) continue;

      // `took` is Jesse Jones choosing a hand over the deck: of `n`, that many came out
      // of `b`'s cards and the REST still comes off the pile. Two sources, so two legs
      // for him, in the order the engine resolves them — the player first, then the pile.
      // One reach at the deck would say he took the lot from there.
      const victim = e.took ? one(e.b) : undefined;
      const stole = !!victim && victim.seat !== drawer.seat && transfer(e.id, drawer, victim, false);
      const stolen = stole ? Math.min(e.took ?? 0, n) : 0;
      // The pile has no arms, so a plain draw is the one case that stays one-sided.
      if (n - stolen > 0) emit(drawer.seat, deckTop(), e.id, stolen > 0 ? REACH_DUR : 0);
    }
  }, [log, players, youSeat, arc, felt, ring]);

  return reaches;
}
