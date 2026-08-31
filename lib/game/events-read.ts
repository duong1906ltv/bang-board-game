// Reading the weather: what the events currently in force add up to, how their
// timers tick down, and how one is described to the client.
//
// The FIRING side stays in index.ts on purpose. makeCtx hands events the callbacks
// they act through — applyDamage, openGeneralStore, leftNeighbor — so it belongs to
// the core, and fireEvent/rollRoundEvents ride on it. Splitting read from fire is
// what lets geometry.ts and rules.ts sit below the core instead of inside it.

import { EventView } from "../types";
import { EVENT_BY_ID, EventEffect, mergeEffect } from "../events";
import { ActiveEvent, Room } from "./state";

// Wipe every per-game event field. `eventLevel` is a ROOM setting and survives,
// so the host doesn't have to re-pick the frequency after every game.
export function resetEventState(room: Room) {
  room.events = [];
  room.roundEvents = [];
  room.eventFeed = [];
  room.eventSeq = 0;
  room.usedEventIds = [];
  room.turnCounter = 0;
  room.turnDir = 1;
  room.turnDirRestore = null;
  room.roundStarterId = null;
  room.roundEventDue = false;
}

// The effects in force right now. Every event applies to the whole table, so this
// takes no player: there is deliberately no way to ask "what applies to HIM".
export function activeEffect(room: Room): EventEffect {
  const out: EventEffect = {};
  for (const ev of room.events) {
    const def = EVENT_BY_ID[ev.defId];
    if (def?.effect) mergeEffect(out, def.effect);
  }
  return out;
}

// Every active effect ticks down one turn per turn started. Durations are set in
// turns because that is what the engine can count: one round = one turn per living
// player, so a round-long modifier expires exactly as the round closes.
export function tickEvents(room: Room) {
  room.events = room.events.filter((ev) => {
    ev.turnsLeft -= 1;
    return ev.turnsLeft > 0;
  });
}

// Events are live from the very first turn. There used to be a one-round grace
// period, from back when events could single out one player: landing on somebody
// before they had a weapon or a full hand was pure bad luck. Every event now applies
// to the whole table equally, so there is nothing left to protect anyone from.
export function eventsUnlocked(room: Room): boolean {
  return room.eventLevel !== "off";
}

export function toEventView(room: Room, ev: ActiveEvent): EventView {
  const def = EVENT_BY_ID[ev.defId];
  return {
    seq: ev.seq,
    id: ev.defId,
    emoji: def?.emoji ?? "🎲",
    scope: def?.scope ?? "instant",
    // A countdown is meaningful for anything that persists: it says how many turns
    // of this round the rule still covers. Instants have nothing to count.
    turnsLeft: def && def.scope !== "instant" ? ev.turnsLeft : undefined,
  };
}
