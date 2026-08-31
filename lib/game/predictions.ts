// The engine half of turn prediction: staking a guess, taking it back, judging it, and
// throwing it away when the turn it was about never resolved.
//
// Split from the core deliberately. lib/predictions.ts holds the PURE half — the odds, the
// buckets, the pacing, the adjudication — and cannot touch a Room; this file is the only
// place that mutates one on a prediction's behalf, and it reaches a hand solely through
// drawInto and the discard pile. That is what keeps a guess from ever bending a rule, the
// same way EventCtx keeps an event honest.
//
// Nothing here may import ./index: every arrow points down (state, deck, rules), which is
// the invariant the module split rests on.

import type { PredictionResult, TurnOutcome } from "../predictions";
import { PENALTY_CARDS, REWARD_CARDS, isCorrect, predictionProblem } from "../predictions";
import { err, type Result } from "../errors";
import { drawInto } from "./deck";
import { predictMsLeft, predictSubjectId } from "./rules";
import { rooms, type Player, type Room } from "./state";

// Stake a guess on the turn that is running right now. Thin on purpose: this checks what
// belongs to the Room (phase, pending, whose seat is playing, whether the clock has run
// out), predictionProblem checks what belongs to the prediction rules (who may stake, what
// they can pay for, whether the value is a real bucket).
export function predict(code: string, playerId: string, subjectId: string, value: string): Result {
  const room = rooms.get(code);
  if (!room || room.phase !== "playing") return err("no-such-room");
  if (room.pending) return err("waiting-for-reaction");
  const by = room.players.find((p) => p.id === playerId);
  const subject = room.players.find((p) => p.id === subjectId);
  if (!by || !subject) return err("player-not-found");
  // The id is sent and checked rather than inferred, so a stake that was aimed at the last
  // turn can never land on this one: a click that raced the hand-off is refused instead of
  // silently re-pointed at whoever happens to be playing by the time it arrives.
  if (subjectId !== predictSubjectId(room)) return err("bad-predict-target");
  // The authority on the window. predictBlock checks it too, to grey the panel out, but a
  // press that arrives late has to be refused here or the clock means nothing.
  if (predictMsLeft(room) <= 0) return err("predict-window-closed");
  const problem = predictionProblem({
    by,
    subject,
    value,
    locked: room.predictions.filter((p) => p.byId === by.id && p.targetId === subjectId),
  });
  if (problem) return err(problem);
  room.predictions.push({ byId: by.id, targetId: subjectId, value });
  return { ok: true };
}

// Take a staked guess back. Allowed for as long as the window is open, which is what makes
// the panel's confirm button safe to press: nothing is charged at stake time, so undoing it
// moves no cards and leaves nothing to refund.
//
// Once the window shuts the stake is final — otherwise "confirm" would mean nothing at all
// and the honest play would be to stake every bucket in turn and cancel the losers.
export function cancelPrediction(code: string, playerId: string, subjectId: string): Result {
  const room = rooms.get(code);
  if (!room || room.phase !== "playing") return err("no-such-room");
  if (subjectId !== predictSubjectId(room)) return err("bad-predict-target");
  if (predictMsLeft(room) <= 0) return err("predict-window-closed");
  const before = room.predictions.length;
  room.predictions = room.predictions.filter(
    (p) => !(p.byId === playerId && p.targetId === subjectId)
  );
  if (room.predictions.length === before) return err("no-prediction-to-cancel");
  return { ok: true };
}

// The reveal rides its own field rather than the log: six players staking a guess each would
// push every shot, death and event out of a 40-entry log within a few turns. `seq` is
// monotonic so a client can tell a NEW reveal from a re-render.
function openReveal(room: Room, subjectId: string, outcome: TurnOutcome, results: PredictionResult[]) {
  room.predictFeed.push({ seq: ++room.predictSeq, targetId: subjectId, outcome, results });
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

// Judge every stake on `subject`'s turn and pay it out: +1 card for a hit, -1 for a miss.
// Called from endTurn while playsThisTurn is still intact — beginTurn clears it.
//
// No grouping and no summing: predictionProblem allows at most one stake per (staker,
// subject), so one prediction is one verdict is one card.
export function judgePredictions(room: Room, subject: Player) {
  const mine = room.predictions.filter((p) => p.targetId === subject.id);
  if (mine.length === 0) return;
  room.predictions = room.predictions.filter((p) => p.targetId !== subject.id);

  const outcome: TurnOutcome = { plays: room.playsThisTurn };
  const results: PredictionResult[] = [];
  for (const p of mine) {
    const correct = isCorrect(p, outcome);
    results.push({ byId: p.byId, value: p.value, correct });
    const staker = room.players.find((x) => x.id === p.byId);
    if (!staker) continue;
    if (correct) drawInto(room, staker.hand, REWARD_CARDS);
    else chargeCards(room, staker, PENALTY_CARDS);
  }
  openReveal(room, subject.id, outcome, results);
}

// The predicted turn never resolved, so the stakes are thrown away rather than judged:
// neither paid nor charged. Left outstanding they would be judged a full lap later against a
// completely different turn.
//
// Which cases actually land here is narrower than it looks, and worth stating because the
// obvious guess is wrong. A guess can only be staked on the seat ALREADY playing, so a turn
// that was skipped before it began can never carry one. Dying does not reach here either —
// endTurn judges whatever turn it closes, so a subject who is killed and whose turn then
// ends normally is judged on the cards they did play (pinned in predictions-engine.test.ts).
// What is left is the hand-off that BYPASSES endTurn: the subject surrenders, or drops their
// connection, mid-turn. Both funnel through advanceToNextSeat, which is what calls this.
export function voidPredictionsFor(room: Room, subjectId: string) {
  const stale = room.predictions.filter((p) => p.targetId === subjectId);
  if (stale.length === 0) return;
  room.predictions = room.predictions.filter((p) => p.targetId !== subjectId);
  openReveal(
    room,
    subjectId,
    { plays: 0 },
    stale.map((p) => ({ byId: p.byId, value: p.value, correct: false, voided: true }))
  );
}
