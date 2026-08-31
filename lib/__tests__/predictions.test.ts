// The prediction rules, judged on their own. Everything here is a pure function, so
// these tests need no table — the engine side lives in predictions-engine.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLAYS_BUCKETS,
  PREDICT_WINDOW_MIN_MS,
  PREDICT_WINDOW_MS,
  PREDICT_WINDOW_PER_DEATH_MS,
  isCorrect,
  playsBucket,
  predictWindowMs,
  predictionProblem,
  type Prediction,
  type TurnOutcome,
} from "../predictions";
import type { Player } from "../game/state";

const guess = (byId: string, value: string): Prediction => ({ byId, targetId: "T", value });
const outcome = (n: number): TurnOutcome => ({ plays: n });

// Only the fields the prediction rules actually read; the rest of Player is irrelevant here.
function stub(over: Partial<Player> & { id: string }): Player {
  return {
    isBot: false,
    alive: true,
    ghost: false,
    hand: [],
    ...over,
  } as Player;
}
const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}` })) as Player["hand"];

test("playsBucket collapses everything from 3 upward", () => {
  assert.equal(playsBucket(0), "0");
  assert.equal(playsBucket(1), "1");
  assert.equal(playsBucket(2), "2");
  assert.equal(playsBucket(3), "3+");
  assert.equal(playsBucket(7), "3+");
  // Nothing should ever hand it a negative, but a bucket is a better answer than a crash.
  assert.equal(playsBucket(-1), "0");
});

test("every bucket playsBucket can return is a bucket the UI offers", () => {
  for (const n of [0, 1, 2, 3, 9]) {
    assert.ok((PLAYS_BUCKETS as readonly string[]).includes(playsBucket(n)));
  }
});

test("a guess matches its own bucket and nothing else", () => {
  assert.equal(isCorrect(guess("A", "2"), outcome(2)), true);
  assert.equal(isCorrect(guess("A", "2"), outcome(3)), false);
  assert.equal(isCorrect(guess("A", "3+"), outcome(3)), true);
  assert.equal(isCorrect(guess("A", "3+"), outcome(6)), true);
  assert.equal(isCorrect(guess("A", "0"), outcome(0)), true);
  assert.equal(isCorrect(guess("A", "0"), outcome(1)), false);
});

test("the staking window shrinks with the body count and then stops", () => {
  assert.equal(predictWindowMs(0), PREDICT_WINDOW_MS);
  assert.equal(predictWindowMs(1), PREDICT_WINDOW_MS - PREDICT_WINDOW_PER_DEATH_MS);
  assert.equal(predictWindowMs(3), PREDICT_WINDOW_MS - 3 * PREDICT_WINDOW_PER_DEATH_MS);
  // The floor is the point: without it the subtraction reaches zero on a long game and
  // retires the whole feature without ever saying so.
  assert.equal(predictWindowMs(99), PREDICT_WINDOW_MIN_MS);
  assert.ok(predictWindowMs(6) >= PREDICT_WINDOW_MIN_MS);
});

test("the window is never so short that the panel cannot be used", () => {
  // A table can only ever hold MAX_PLAYERS, so walk every reachable body count rather than
  // trusting the floor to catch a number nobody checked.
  for (let dead = 0; dead <= 7; dead++) {
    assert.ok(predictWindowMs(dead) >= PREDICT_WINDOW_MIN_MS, `dead=${dead}`);
  }
});

test("you cannot predict yourself or a dead player, but a bot is fair game", () => {
  const me = stub({ id: "me", hand: cards(3) });
  const problem = (subject: Player) => predictionProblem({ by: me, subject, value: "1", locked: [] });

  // Predicting yourself is not a read — you decide the answer. This is also what makes the
  // feature something you do on OTHER people's turns.
  assert.equal(problem(me), "bad-predict-target");
  assert.equal(problem(stub({ id: "T", alive: false })), "bad-predict-target");
  assert.equal(problem(stub({ id: "T" })), null);
  // Predicting a bot is ALLOWED on purpose. Forbidding it left one human at a table of bots
  // with no legal prediction at all, which made the whole feature unreachable.
  assert.equal(problem(stub({ id: "bot", isBot: true })), null);
});

test("a dead or ghosting player cannot stake a guess", () => {
  const subject = stub({ id: "T" });
  const args = { subject, value: "1", locked: [] };
  assert.equal(
    predictionProblem({ ...args, by: stub({ id: "me", hand: cards(3), alive: false }) }),
    "bad-predict-target"
  );
  assert.equal(
    predictionProblem({ ...args, by: stub({ id: "me", hand: cards(3), ghost: true }) }),
    "bad-predict-target"
  );
});

test("one guess per turn, and the second is refused", () => {
  const me = stub({ id: "me", hand: cards(3) });
  const subject = stub({ id: "T" });
  assert.equal(predictionProblem({ by: me, subject, value: "1", locked: [] }), null);
  // The single question IS the whole stake, which is what lets judgePredictions skip
  // grouping and summing entirely: one prediction, one verdict, one card.
  assert.equal(
    predictionProblem({ by: me, subject, value: "2", locked: [guess("me", "1")] }),
    "already-predicted"
  );
});

test("an empty hand cannot stake, because it cannot pay for a miss", () => {
  const subject = stub({ id: "T" });
  const base = { subject, value: "1", locked: [] };
  // Without this gate an empty hand stakes at pure profit — a miss takes a card that is not
  // there — and refills for free at exactly its weakest moment.
  assert.equal(predictionProblem({ ...base, by: stub({ id: "me", hand: cards(0) }) }), "predict-needs-a-card");
  assert.equal(predictionProblem({ ...base, by: stub({ id: "me", hand: cards(1) }) }), null);
});

test("only a real bucket may be staked", () => {
  const me = stub({ id: "me", hand: cards(3) });
  const subject = stub({ id: "T" });
  const base = { by: me, subject, locked: [] };
  assert.equal(predictionProblem({ ...base, value: "4" }), "invalid-prediction");
  assert.equal(predictionProblem({ ...base, value: "" }), "invalid-prediction");
  assert.equal(predictionProblem({ ...base, value: "nobody" }), "invalid-prediction");
  for (const b of PLAYS_BUCKETS) assert.equal(predictionProblem({ ...base, value: b }), null);
});

test("an omitted value asks whether ANY stake is possible, and must not fail validation", () => {
  // This is the shape predictBlock uses to drive the panel. It used to pass a placeholder
  // value instead, the placeholder was silently invalid, and the panel therefore greyed
  // every button out on every turn the engine would have accepted.
  const me = stub({ id: "me", hand: cards(3) });
  const subject = stub({ id: "T" });
  assert.equal(predictionProblem({ by: me, subject, locked: [] }), null);
});
