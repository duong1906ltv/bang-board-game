// The engine half of turn prediction: staking a guess, judging it, and throwing it away
// when the turn it was about never happened.
//
// Split from the core deliberately. lib/predictions.ts holds the PURE half — the odds, the
// buckets, the adjudication — and cannot touch a Room; this file is the only place that
// mutates one on a prediction's behalf, and it reaches a hand solely through drawInto and
// the discard pile. That is what keeps a guess from ever bending a rule, the same way
// EventCtx keeps an event honest.
//
// Nothing here may import ./index: every arrow points down (state, deck, rules), which is
// the invariant the module split rests on.

import type { PredictionKind, PredictionResult, Prediction, TurnOutcome } from "../predictions";
import { isCorrect, predictionProblem, settle } from "../predictions";
import { err, type Result } from "../errors";
import { drawInto } from "./deck";
import { nextSeatId } from "./rules";
import { rooms, type Player, type Room } from "./state";

// Stake a guess on the upcoming turn. Thin on purpose: this checks what belongs to the
// Room (phase, pending, whose seat is next), predictionProblem checks what belongs to the
// prediction rules (who may stake, what they can pay for, whether the value is real).
export function predict(
  code: string,
  playerId: string,
  targetId: string,
  kind: PredictionKind,
  value: string
): Result {
  const room = rooms.get(code);
  if (!room || room.phase !== "playing") return err("no-such-room");
  if (room.pending) return err("waiting-for-reaction");
  const by = room.players.find((p) => p.id === playerId);
  const target = room.players.find((p) => p.id === targetId);
  if (!by || !target) return err("player-not-found");
  // Only ever the NEXT seat: that is what gives everyone the whole of the current turn to
  // think, instead of a window that slams shut the moment somebody plays their first card.
  if (targetId !== nextSeatId(room)) return err("bad-predict-target");
  const problem = predictionProblem({
    by,
    target,
    kind,
    value,
    alivePlayerIds: room.players.filter((p) => p.alive).map((p) => p.id),
    locked: room.predictions.filter((p) => p.byId === by.id && p.targetId === targetId),
  });
  if (problem) return err(problem);
  room.predictions.push({ byId: by.id, targetId, kind, value });
  return { ok: true };
}

// The reveal rides its own field rather than the log: six players staking two questions
// each would push every shot, death and event out of a 40-entry log within a few turns.
// `seq` is monotonic so a client can tell a NEW reveal from a re-render.
function openReveal(room: Room, targetId: string, outcome: TurnOutcome, results: PredictionResult[]) {
  room.predictFeed.push({ seq: ++room.predictSeq, targetId, outcome, results });
  // A feed, not a single field: endTurn can judge one turn and then skip the seat after it
  // in the SAME action, and a lone field would drop the judged verdict — the one that
  // actually moved cards. Trimmed because a client that missed a dozen is long gone.
  if (room.predictFeed.length > 8) room.predictFeed.shift();
}

// Take the cost of a missed guess out of a hand at random, and only as far as the hand
// actually goes. A hand can shrink between staking and judgement — Cat Balou, a Duel, a
// discard — and remembering a debt to collect later would be a second economy nobody
// asked for.
function chargeCards(room: Room, p: Player, n: number) {
  for (let i = 0; i < n && p.hand.length > 0; i++) {
    room.discard.push(p.hand.splice(Math.floor(Math.random() * p.hand.length), 1)[0]);
  }
}

// Judge every stake on `target`'s turn and pay it out: +1 card per hit, -1 per miss,
// summed per staker. Called from endTurn while playsThisTurn and turnShotIds are still
// intact — beginTurn clears both.
export function judgePredictions(room: Room, target: Player) {
  const mine = room.predictions.filter((p) => p.targetId === target.id);
  if (mine.length === 0) return;
  room.predictions = room.predictions.filter((p) => p.targetId !== target.id);

  const outcome: TurnOutcome = { shotIds: [...room.turnShotIds], plays: room.playsThisTurn };
  const byStaker = new Map<string, Prediction[]>();
  for (const p of mine) {
    const list = byStaker.get(p.byId) ?? [];
    list.push(p);
    byStaker.set(p.byId, list);
  }

  const results: PredictionResult[] = [];
  for (const [byId, preds] of byStaker) {
    for (const p of preds) {
      results.push({ byId, kind: p.kind, value: p.value, correct: isCorrect(p, outcome) });
    }
    const staker = room.players.find((x) => x.id === byId);
    if (!staker) continue;
    const net = settle(preds, outcome);
    if (net > 0) drawInto(room, staker.hand, net);
    else if (net < 0) chargeCards(room, staker, -net);
  }
  openReveal(room, target.id, outcome, results);
}

// The predicted turn never actually happened — the seat was skipped, or the game ended on
// it — so the stakes are thrown away rather than judged: neither paid nor charged. Left
// outstanding they would be judged a full lap later against a completely different turn.
export function voidPredictionsFor(room: Room, targetId: string) {
  const stale = room.predictions.filter((p) => p.targetId === targetId);
  if (stale.length === 0) return;
  room.predictions = room.predictions.filter((p) => p.targetId !== targetId);
  openReveal(
    room,
    targetId,
    { shotIds: [], plays: 0 },
    stale.map((p) => ({ byId: p.byId, kind: p.kind, value: p.value, correct: false, voided: true }))
  );
}
