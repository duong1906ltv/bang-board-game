// The prediction rules, judged on their own. Everything here is a pure function, so
// these tests need no table — the engine side lives in predictions-engine.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_SHOT,
  PLAYS_BUCKETS,
  isCorrect,
  playsBucket,
  predictionProblem,
  settle,
  type Prediction,
  type TurnOutcome,
} from "../predictions";
import type { Player } from "../game/state";

const shoot = (byId: string, value: string): Prediction => ({
  byId,
  targetId: "T",
  kind: "shoot",
  value,
});
const plays = (byId: string, value: string): Prediction => ({
  byId,
  targetId: "T",
  kind: "plays",
  value,
});
const outcome = (shotIds: string[], n: number): TurnOutcome => ({ shotIds, plays: n });

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

test("naming the person who got shot is a hit", () => {
  assert.equal(isCorrect(shoot("A", "victim"), outcome(["victim"], 1)), true);
  assert.equal(isCorrect(shoot("A", "victim"), outcome(["somebody-else"], 1)), false);
});

test("naming ANY of several people shot in one turn is a hit", () => {
  // Willy the Kid and a Volcanic both fire more than once in a turn. Reading the second
  // shot right is still a read, so this must not be judged on shotIds[0] alone.
  const o = outcome(["first", "second", "third"], 3);
  assert.equal(isCorrect(shoot("A", "third"), o), true);
  assert.equal(isCorrect(shoot("A", "first"), o), true);
});

test("NO_SHOT is right when nobody was shot and wrong when somebody was", () => {
  assert.equal(isCorrect(shoot("A", NO_SHOT), outcome([], 2)), true);
  assert.equal(isCorrect(shoot("A", NO_SHOT), outcome(["victim"], 1)), false);
});

test("a turn spent only on Gatling counts as shooting nobody", () => {
  // Gatling and Indians! aim at no one, so the engine never records a shotId for them —
  // which makes NO_SHOT the correct read on a turn like that. Surprising enough that the
  // panel has to say so out loud; here it is pinned as a rule.
  assert.equal(isCorrect(shoot("A", NO_SHOT), outcome([], 1)), true);
});

test("plays predictions match their own bucket and nothing else", () => {
  assert.equal(isCorrect(plays("A", "2"), outcome([], 2)), true);
  assert.equal(isCorrect(plays("A", "2"), outcome([], 3)), false);
  assert.equal(isCorrect(plays("A", "3+"), outcome([], 3)), true);
  assert.equal(isCorrect(plays("A", "3+"), outcome([], 6)), true);
  assert.equal(isCorrect(plays("A", "0"), outcome([], 0)), true);
});

test("settle pays one card per hit and takes one per miss", () => {
  const o = outcome(["victim"], 2);
  // both right
  assert.equal(settle([shoot("A", "victim"), plays("A", "2")], o), 2);
  // one question only, right
  assert.equal(settle([shoot("A", "victim")], o), 1);
  // one right one wrong cancels out
  assert.equal(settle([shoot("A", "victim"), plays("A", "0")], o), 0);
  // one question only, wrong
  assert.equal(settle([plays("A", "0")], o), -1);
  // both wrong
  assert.equal(settle([shoot("A", "nobody-real"), plays("A", "0")], o), -2);
  // staking nothing is always free — this is what makes abstaining a real option
  assert.equal(settle([], o), 0);
});

test("you cannot predict yourself, a bot, or a dead player", () => {
  const me = stub({ id: "me", hand: cards(3) });
  const alive = ["me", "T", "bot"];
  const problem = (target: Player) =>
    predictionProblem({ by: me, target, kind: "shoot", value: NO_SHOT, alivePlayerIds: alive, locked: [] });

  assert.equal(problem(me), "bad-predict-target");
  assert.equal(problem(stub({ id: "bot", isBot: true })), "bad-predict-target");
  assert.equal(problem(stub({ id: "T", alive: false })), "bad-predict-target");
  assert.equal(problem(stub({ id: "T" })), null);
});

test("a dead or ghosting player cannot stake a guess", () => {
  const target = stub({ id: "T" });
  const args = { target, kind: "shoot" as const, value: NO_SHOT, alivePlayerIds: ["T"], locked: [] };
  assert.equal(predictionProblem({ ...args, by: stub({ id: "me", hand: cards(3), alive: false }) }), "bad-predict-target");
  assert.equal(predictionProblem({ ...args, by: stub({ id: "me", hand: cards(3), ghost: true }) }), "bad-predict-target");
});

test("each question may only be staked once per target", () => {
  const me = stub({ id: "me", hand: cards(3) });
  const target = stub({ id: "T" });
  const base = { by: me, target, alivePlayerIds: ["T"], value: NO_SHOT };
  assert.equal(
    predictionProblem({ ...base, kind: "shoot", locked: [shoot("me", "T")] }),
    "already-predicted"
  );
  // ...but the OTHER question is still open
  assert.equal(
    predictionProblem({ ...base, kind: "plays", value: "1", locked: [shoot("me", "T")] }),
    null
  );
});

test("you may stake only as many questions as you could pay for", () => {
  const target = stub({ id: "T" });
  const base = { target, kind: "shoot" as const, value: NO_SHOT, alivePlayerIds: ["T"] };

  // Empty-handed stakes nothing: a miss takes a card they do not have, so without this
  // gate an empty hand predicts everything at pure profit and refills for free.
  assert.equal(predictionProblem({ ...base, by: stub({ id: "me", hand: cards(0) }), locked: [] }), "predict-needs-a-card");
  // One card buys exactly one question.
  assert.equal(predictionProblem({ ...base, by: stub({ id: "me", hand: cards(1) }), locked: [] }), null);
  assert.equal(
    predictionProblem({ ...base, kind: "plays", value: "1", by: stub({ id: "me", hand: cards(1) }), locked: [shoot("me", "T")] }),
    "predict-needs-a-card"
  );
  // Two cards buy both.
  assert.equal(
    predictionProblem({ ...base, kind: "plays", value: "1", by: stub({ id: "me", hand: cards(2) }), locked: [shoot("me", "T")] }),
    null
  );
});

test("a shoot value must be a living player or NO_SHOT, and a bucket must be a real bucket", () => {
  const me = stub({ id: "me", hand: cards(3) });
  const target = stub({ id: "T" });
  const base = { by: me, target, alivePlayerIds: ["T", "other"], locked: [] };
  assert.equal(predictionProblem({ ...base, kind: "shoot", value: "ghost-id" }), "invalid-prediction");
  assert.equal(predictionProblem({ ...base, kind: "shoot", value: "other" }), null);
  assert.equal(predictionProblem({ ...base, kind: "plays", value: "4" }), "invalid-prediction");
  assert.equal(predictionProblem({ ...base, kind: "plays", value: "3+" }), null);
});
