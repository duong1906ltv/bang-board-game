// The engine's shared ground: what a room and a player ARE, the one Map that holds
// every live room, and the few primitives everything else is built from.
//
// Nothing here may import from ./index. That is the rule the whole split rests on —
// this is the bottom layer, and a arrow pointing back up would make the module graph
// a cycle instead of a stack.

import type { PredictReveal } from "../types";
import type { MissionReveal } from "../types";
import type { Prediction } from "../predictions";
import {
  Character,
  CheckView,
  LogEntry,
  Phase,
  Role,
  TurnPhase,
  Winner,
} from "../types";
import { Card, rankLabel, SUIT_SYMBOL } from "../cards";
import { EventLevel } from "../events";

export interface Player {
  id: string;
  name: string;
  socketId: string | null;
  isHost: boolean;
  isBot: boolean; // server-controlled AI (fills seats for testing)
  connected: boolean;
  role: Role | null; // dealt at game start
  character: Character | null; // locked in after the draft
  draftChoices: Character[]; // the two candidates offered during the draft
  hasPicked: boolean; // draft: has locked a character

  // --- nhiệm vụ phụ (xem lib/missions.ts) ---
  // Lưu id, không lưu cả MissionDef — đúng như ActiveEvent.defId.
  missionId: string | null;
  missionProgress: number;
  missionSeen: string[]; // khoá đã đếm, chống đếm trùng (chỉ two-birds dùng)
  missionDone: boolean;
  hp: number;
  maxHp: number;
  alive: boolean;
  hand: Card[];
  equipment: Card[]; // blue cards in play (gun, Mustang, Scope, Jail, Dynamite...)
  wins: number; // cumulative wins in this room — deliberately NOT reset by Play Again
  rewardTicket?: string | null; // escape-reward link, granted once on reaching the win threshold
  // What others did to this player since their own turn last ended, cleared as their
  // turn hands off. A separate array rather than a filter over the shared log because
  // that log keeps only 40 entries — at 7 players a Bang! can fall off it before the
  // person it hit gets the table back.
  inbox: LogEntry[];

  // --- ghost turns (house rule; see beginTurn) ---
  // A dead player's seat still comes around. When it does they flip for the right to
  // rise, and if it comes up they play that one turn and lie back down at the end of
  // it. True only for the length of that turn — `alive` stays false throughout, which
  // is what keeps every win condition, every target list and every distance honest.
  ghost: boolean;
  // Flips missed since dying. The first one needs a Heart (25%); every one after takes
  // a Heart or a Diamond (50%), and the door stops widening there. Back to 0 each time
  // they rise, so the next death starts over at a Heart.
  ghostMisses: number;
}

// A random event currently in force (or the one that just fired).
export interface ActiveEvent {
  seq: number; // monotonic id, so the client can tell a NEW event from a repeat
  defId: string; // key into EVENT_BY_ID
  turnsLeft: number; // in turns; a round-long effect gets one turn per living player
}

export interface Room {
  code: string;
  phase: Phase;
  // Kept out of the room browser: this room was opened deliberately for a specific
  // group, who share its code. Without this, "create a private room" would be false
  // advertising — it would sit in the public list like any other.
  unlisted: boolean;
  // Always in clockwise seat order — seat IS the index, so nothing re-sorts and
  // there is no separate field to keep in sync. Only removeBot/disconnect ever
  // splice, which shifts the later seats along, exactly as a player leaving should.
  players: Player[];
  hostId: string;
  turnIndex: number; // index into players[] whose turn it is (playing phase)
  turnPhase: TurnPhase; // sub-phase of the current player's turn
  // The active player failed their Jail check: they serve the turn without playing
  // anything, but still have to discard down to their hand limit before it passes.
  jailedTurn: boolean;
  // Set when a player's own upkeep (their exploding Dynamite) knocked them to 0 and
  // we are waiting on their Beer answer. Their turn has NOT been set up yet — the
  // Jail check and the draw phase still have to run — so whoever resolves that
  // pending has to hand control back via resumeUpkeep().
  upkeepFor: string | null;
  bangsThisTurn: number; // Bang!s played by the active player this turn
  playsThisTurn: number; // cards played by the active player this turn (for maxPlays events)
  playedDefsThisTurn: string[]; // house rule: each card type only once per turn (Bang!/guns exempt)
  pending: Pending | null; // unresolved reaction locking the table
  winner: Winner | null; // set when the game ends
  // Players who hit 0 HP and still have to be resolved, in the order they were hit.
  // A multi (Indians!/Gatling) can drop several at once and each may want a Beer,
  // so death always goes through this queue — see processDeathQueue.
  deathQueue: {
    id: string;
    needed: number; // Beers required to get back to 1 HP
    sourceId: string | null;
    creditId: string | null; // indirect credit (Dynamite), see killPlayer
    saveable: boolean; // event damage is unsaveable, like Dynamite
  }[];
  checks: CheckView[]; // recent Draw! reveals (upkeep / Barrel), display-only
  botTimer: NodeJS.Timeout | null; // paces bot actions so humans can watch
  ackTimer: NodeJS.Timeout | null; // waves a "taking your card" dialog through if ignored
  deck: Card[]; // draw pile (top = end of array)
  discard: Card[]; // discard pile
  log: LogEntry[]; // action history (oldest → newest, trimmed)
  logSeq: number; // monotonic id for log entries

  // --- random events (see lib/events.ts) ---
  eventLevel: EventLevel; // room setting, survives restart()
  roundStarterId: string | null; // whoever opens each round — the round boundary marker
  roundEventDue: boolean; // an event is queued for the next turn start
  events: ActiveEvent[]; // in force for the rest of this round (lasting only — drives the rules)
  roundEvents: ActiveEvent[]; // every event drawn THIS round (instant + lasting) — for display
  // Rolling feed of the most recently FIRED events, newest last. A single action
  // can fire more than one (a table event at a round boundary plus that player's
  // own turn event), so a "latest event" field would silently drop the first —
  // clients announce every entry they haven't seen yet, by `seq`.
  eventFeed: ActiveEvent[];
  eventSeq: number;
  usedEventIds: string[]; // every event already seen this game — drawn from like a deck

  // --- turn prediction (see lib/predictions.ts) ---
  // Guesses staked but not yet judged. Always about the seat playing RIGHT NOW, so at most
  // one turn's worth is ever outstanding.
  predictions: Prediction[];
  // When the staking window for the running turn closes, as an epoch ms. A TIMESTAMP, never
  // a timer: nothing in this engine uses setTimeout, because the bot scheduler only queues
  // the next action after the previous one succeeded and a callback that never fires is how
  // a table freezes for good. A deadline that is only ever compared needs nobody to fire it.
  // Set in beginTurn alongside the other turn-scoped resets; 0 outside a live turn.
  predictEndsAt: number;
  predictFeed: PredictReveal[]; // verdicts not yet shown, oldest first (see PlayerView.predictFeed)

  // --- nhiệm vụ phụ ---
  missionsOn: boolean; // luật phòng, sống qua restart() — như eventLevel
  dealtMissionIds: string[]; // đã chia hoặc đã lộ; pool loại trừ danh sách này
  missionFeed: MissionReveal[];
  missionSeq: number;
  predictSeq: number;
  turnCounter: number; // turns begun this game (telemetry / sim reporting only)
  turnDir: 1 | -1; // play direction (the "reverse" event flips it)
  // The direction to put back once this ROUND is over, or null when nothing is
  // pending. Reverse is round weather like every other event: it fires as the round
  // opens and the whole round runs backwards, so the lap still visits every seat
  // exactly once and still ends on the opener. Kept as the direction to restore
  // rather than a boolean so a second Reverse landing before the first is undone
  // still returns the table to where it actually started.
  turnDirRestore: (1 | -1) | null;
}

// An unresolved reaction that locks the table until responded to. There is no
// deadline: reactions never time out (players take as long as they need).
// An unresolved reaction that locks the table until responded to. There is no
// deadline: reactions never time out (players take as long as they need).
export type Pending =
  | { kind: "bang"; targetId: string; sourceId: string; missedNeeded: number; missedPlayed: number }
  | { kind: "dying"; targetId: string; sourceId: string | null; creditId?: string | null; beersNeeded: number }
  | { kind: "multi"; effect: "indians" | "gatling"; sourceId: string; responders: { id: string; done: boolean; safe: boolean }[] }
  | { kind: "duel"; aId: string; bId: string; turnId: string }
  | { kind: "store"; sourceId: string; cards: Card[]; order: string[] }
  | { kind: "kit"; playerId: string; cards: Card[]; picksLeft: number }
  // Somebody is helping themselves to one of your cards (Panic!, Cat Balou, Jesse
  // Jones), waiting on you to acknowledge it. You cannot refuse — none of those are
  // preventable — so this buys one thing only, and it is the thing the private inbox
  // was already built for: the person losing the card gets to SEE it go, instead of
  // finding their hand one lighter and no idea why.
  //
  // The card is chosen when the play is made, not when the acknowledgement lands, so
  // the message can name it and the outcome cannot drift while the dialog is open.
  | {
      kind: "taken";
      takerId: string;
      victimId: string;
      mode: "take" | "toss"; // into their hand, or straight to the discard
      cardId: string;
      fromHand: boolean; // drawn blind out of their hand rather than off the table
      cardName?: string; // named only when it was face-up in play, which is public
      playName?: string; // the card played, for the log line written on acknowledgement
      thenDraw?: number; // Jesse Jones: cards still owed off the deck once this clears
    }
  // A Dynamite/Jail reveal waiting to be acknowledged by the player it happened to.
  // Upkeep used to flip these and act on them in the same breath, so the one person
  // with a stake in the result saw it as a banner sliding past — and a Jail sentence
  // skipped their turn before they had read why. `resume` says what the turn does
  // once they dismiss it: "stay" if the turn state is already set and only needs
  // unblocking, "skip" if the turn still has to pass to the next player.
  | { kind: "check"; playerId: string; resume: "stay" | "skip" };


export const rooms = new Map<string, Room>();

export function pushLog(room: Room, e: Omit<LogEntry, "id">) {
  room.log.push({ ...e, id: room.logSeq++ });
  if (room.log.length > 40) room.log.shift();
}

// Record a Draw! reveal (Dynamite/Jail/Barrel/Black Jack…) in the permanent log
// so everyone can see it in history, not just the transient checks banner.
export function logCheck(room: Room, c: { name: string; card: Card | null; kind: string; outcome: string }) {
  pushLog(room, {
    kind: "check",
    a: c.name,
    card: c.card ? `${rankLabel(c.card.rank)}${SUIT_SYMBOL[c.card.suit]}` : undefined,
    checkKind: c.kind,
    outcome: c.outcome,
  });
}

// Each player is offered 2 characters to choose from (no time limit to pick).
export const DRAFT_PER_PLAYER = 2;

// Role distribution by player count (classic Bang! base game).
export const ROLE_SETUP: Record<number, Role[]> = {
  4: ["sheriff", "renegade", "outlaw", "outlaw"],
  5: ["sheriff", "renegade", "outlaw", "outlaw", "deputy"],
  6: ["sheriff", "renegade", "outlaw", "outlaw", "outlaw", "deputy"],
  7: ["sheriff", "renegade", "outlaw", "outlaw", "outlaw", "deputy", "deputy"],
};

export function genCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (rooms.has(code));
  return code;
}

export function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function aliveBySeat(room: Room): Player[] {
  return room.players.filter((p) => p.alive);
}
