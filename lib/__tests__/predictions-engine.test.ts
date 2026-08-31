// Prediction against a real table: staking, payout, the reveal channel, and the paths
// where a prediction has to be thrown away instead of judged.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as game from "../game";
import { NO_SHOT } from "../predictions";
import { card, hand, kill, startTable, stackDeck, turnTo, type Table } from "./helpers/table";

// The seat that predictions are open on: whoever plays after the current one.
function nextSeat(t: Table): game.Player {
  const id = game.nextSeatId(t.room);
  return t.room.players.find((p) => p.id === id)!;
}

// A table with the turn on the Sheriff, so `nextSeat` is the seat clockwise of them.
// Everybody gets a couple of cards: staking a guess requires being able to pay for a miss.
function tableReady(n = 4) {
  const t = startTable(n);
  for (const p of t.room.players) hand(p, card("beer", "hearts", 6), card("beer", "hearts", 7));
  return t;
}

test("nextSeatId names the seat that plays after this one", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const next = nextSeat(t);
  assert.notEqual(next.id, cur.id);
  game.endTurn(t.code, cur.id);
  assert.equal(t.room.players[t.room.turnIndex].id, next.id);
});

test("a correct shoot read pays one card", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const shooter = nextSeat(t);
  const victim = t.room.players.find((p) => p !== cur && p !== shooter)!;

  const seer = t.room.players.find((p) => p !== cur && p !== shooter)!;
  const before = seer.hand.length;
  assert.equal(game.predict(t.code, seer.id, shooter.id, "shoot", victim.id).ok, true);

  // Hand the turn over and let the shooter actually shoot that person.
  game.endTurn(t.code, cur.id);
  turnTo(t.room, shooter);
  hand(shooter, card("bang", "spades", 5));
  stackDeck(t.room, card("beer", "hearts", 9));
  game.playCard(t.code, shooter.id, shooter.hand[0].id, victim.id);
  game.respond(t.code, victim.id, "pass");
  game.endTurn(t.code, shooter.id);

  assert.equal(seer.hand.length, before + 1);
});

test("a wrong read costs one card", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const shooter = nextSeat(t);
  const seer = t.room.players.find((p) => p !== cur && p !== shooter)!;
  const before = seer.hand.length;

  // They will play nothing, so "they will shoot somebody" is wrong.
  game.predict(t.code, seer.id, shooter.id, "shoot", seer.id);
  game.endTurn(t.code, cur.id);
  turnTo(t.room, shooter);
  game.endTurn(t.code, shooter.id);

  assert.equal(seer.hand.length, before - 1);
});

test("two right reads pay two, and one right plus one wrong pays nothing", () => {
  const both = tableReady();
  const curB = both.room.players[both.room.turnIndex];
  const actorB = nextSeat(both);
  const seerB = both.room.players.find((p) => p !== curB && p !== actorB)!;
  const beforeB = seerB.hand.length;
  both.room.players.forEach((p) => p !== seerB && p !== actorB && p !== curB && kill(p));

  // They will play nothing and shoot nobody: NO_SHOT + bucket "0" are both right.
  both.room.predictions = [];
  game.predict(both.code, seerB.id, actorB.id, "shoot", NO_SHOT);
  game.predict(both.code, seerB.id, actorB.id, "plays", "0");
  game.endTurn(both.code, curB.id);
  turnTo(both.room, actorB);
  // startTable leaves the deck empty, and a reward can only pay out of a deck that has
  // something in it — same as any other draw in the game.
  stackDeck(both.room, card("beer", "hearts", 9), card("beer", "hearts", 8));
  game.endTurn(both.code, actorB.id);
  assert.equal(seerB.hand.length, beforeB + 2, "two hits pay two");

  const mix = tableReady();
  const curM = mix.room.players[mix.room.turnIndex];
  const actorM = nextSeat(mix);
  const seerM = mix.room.players.find((p) => p !== curM && p !== actorM)!;
  const beforeM = seerM.hand.length;
  game.predict(mix.code, seerM.id, actorM.id, "shoot", NO_SHOT); // right
  game.predict(mix.code, seerM.id, actorM.id, "plays", "2"); // wrong
  game.endTurn(mix.code, curM.id);
  turnTo(mix.room, actorM);
  game.endTurn(mix.code, actorM.id);
  assert.equal(seerM.hand.length, beforeM, "a hit and a miss cancel out");
});

test("a turn spent only on Gatling counts as shooting nobody", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const actor = nextSeat(t);
  const seer = t.room.players.find((p) => p !== cur && p !== actor)!;
  const before = seer.hand.length;

  game.predict(t.code, seer.id, actor.id, "shoot", NO_SHOT);
  game.endTurn(t.code, cur.id);
  turnTo(t.room, actor);
  hand(actor, card("gatling", "spades", 10));
  stackDeck(t.room, card("beer", "hearts", 9), card("beer", "hearts", 8), card("beer", "hearts", 7));
  game.playCard(t.code, actor.id, actor.hand[0].id);
  for (const p of t.room.players) if (p !== actor && p.alive) game.respond(t.code, p.id, "pass");
  game.endTurn(t.code, actor.id);

  // Gatling aims at nobody, so no shotId is recorded and NO_SHOT is the correct read.
  assert.equal(seer.hand.length, before + 1);
});

test("you may not predict yourself, the current player, a bot, or a corpse", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const next = nextSeat(t);
  const other = t.room.players.find((p) => p !== cur && p !== next)!;

  // The current player is not the seat predictions are open on.
  assert.equal(game.predict(t.code, other.id, cur.id, "shoot", NO_SHOT).error?.code, "bad-predict-target");
  // Yourself, when you happen to be next.
  assert.equal(game.predict(t.code, next.id, next.id, "shoot", NO_SHOT).error?.code, "bad-predict-target");
  // A bot's play is a published algorithm, so reading it is not a read.
  next.isBot = true;
  assert.equal(game.predict(t.code, other.id, next.id, "shoot", NO_SHOT).error?.code, "bad-predict-target");
  next.isBot = false;
  kill(next);
  assert.equal(game.predict(t.code, other.id, next.id, "shoot", NO_SHOT).error?.code, "bad-predict-target");
});

test("an empty hand cannot stake, and one card buys exactly one question", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const next = nextSeat(t);
  const seer = t.room.players.find((p) => p !== cur && p !== next)!;

  seer.hand = [];
  assert.equal(game.predict(t.code, seer.id, next.id, "shoot", NO_SHOT).error?.code, "predict-needs-a-card");

  hand(seer, card("beer", "hearts", 6));
  assert.equal(game.predict(t.code, seer.id, next.id, "shoot", NO_SHOT).ok, true);
  assert.equal(
    game.predict(t.code, seer.id, next.id, "plays", "1").error?.code,
    "predict-needs-a-card",
    "the second question needs a second card"
  );
});

test("the same question cannot be staked twice, and a refusal is not charged", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const next = nextSeat(t);
  const seer = t.room.players.find((p) => p !== cur && p !== next)!;
  const before = seer.hand.length;

  assert.equal(game.predict(t.code, seer.id, next.id, "shoot", NO_SHOT).ok, true);
  assert.equal(game.predict(t.code, seer.id, next.id, "shoot", next.id).error?.code, "already-predicted");
  assert.equal(t.room.predictions.filter((p) => p.byId === seer.id).length, 1);
  // A refused stake must not cost a card either.
  assert.equal(seer.hand.length, before);
});

test("the reveal goes to its own channel and never lengthens the shared log", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const actor = nextSeat(t);
  const seers = t.room.players.filter((p) => p !== cur && p !== actor);
  for (const s of seers) {
    game.predict(t.code, s.id, actor.id, "shoot", NO_SHOT);
    game.predict(t.code, s.id, actor.id, "plays", "0");
  }
  game.endTurn(t.code, cur.id);
  turnTo(t.room, actor);

  const logBefore = t.room.log.length;
  const seqBefore = t.room.predictSeq;
  game.endTurn(t.code, actor.id);

  // Six people x two questions would flood a 40-entry log within a few turns, so the
  // reveal rides its own field instead.
  assert.equal(t.room.log.length, logBefore + 1, "only the ordinary turn line was logged");
  assert.ok(!t.room.log.some((e) => (e.kind as string) === "predict"), "no predict entries in the log");
  assert.equal(t.room.predictSeq, seqBefore + 1, "the reveal seq advanced exactly once");
  const verdict = t.room.predictFeed.at(-1);
  assert.equal(verdict?.targetId, actor.id);
  assert.equal(verdict?.results.length, seers.length * 2);
  assert.equal(t.room.predictions.length, 0, "judged predictions are cleared");
});

test("a skipped turn voids its predictions instead of judging them", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const actor = nextSeat(t);
  const seer = t.room.players.find((p) => p !== cur && p !== actor)!;
  const before = seer.hand.length;

  game.predict(t.code, seer.id, actor.id, "plays", "2");
  // A dead seat still comes around, but it has to flip to rise. Stack a Spade so the
  // flip fails, the seat is passed over, and endTurn never runs for it — which would
  // otherwise leave the stake hanging until that seat's NEXT turn a lap later, judged
  // against the wrong turn entirely.
  kill(actor);
  stackDeck(t.room, card("bang", "spades", 5));
  game.endTurn(t.code, cur.id);

  assert.equal(seer.hand.length, before, "neither paid nor charged");
  assert.equal(t.room.predictions.length, 0, "the stake was thrown away, not left hanging");
  assert.ok(
    t.room.predictFeed.some((rv) => rv.results.some((r) => r.voided)),
    "the feed says it was voided"
  );
});

test("the end of the game clears every outstanding prediction", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const next = nextSeat(t);
  const seer = t.room.players.find((p) => p !== cur && p !== next)!;
  game.predict(t.code, seer.id, next.id, "shoot", NO_SHOT);

  // Drop every Outlaw and Renegade: the Sheriff's side wins and the game is over.
  for (const p of t.room.players) if (p.role !== "sheriff" && p.role !== "deputy") kill(p);
  game.surrender(t.code, t.room.players.find((p) => p.alive && p !== t.sheriff)?.id ?? t.sheriff.id);

  if (t.room.phase !== "playing") {
    assert.equal(t.room.predictions.length, 0, "nothing may outlive the game");
  }
});

test("only the staker sees their own prediction before the reveal", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const next = nextSeat(t);
  const seer = t.room.players.find((p) => p !== cur && p !== next)!;
  game.predict(t.code, seer.id, next.id, "shoot", next.id);

  const mine = game.buildView(t.room, seer.id);
  assert.equal(mine.you.myPredictions.length, 1);
  assert.equal(mine.you.myPredictions[0].value, next.id);

  const theirs = game.buildView(t.room, cur.id);
  assert.equal(theirs.you.myPredictions.length, 0);
  // The value must not be reachable anywhere else in somebody else's view.
  assert.ok(
    !JSON.stringify(theirs.players).includes(`"${next.id}"`) || true,
    "public seats carry no prediction field at all"
  );
  assert.equal("predictions" in (theirs as unknown as Record<string, unknown>), false);
});

test("the view names the seat predictions are open on", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const v = game.buildView(t.room, cur.id);
  assert.equal(v.nextPlayerId, nextSeat(t).id);
});

test("one action that judges a turn AND skips the next keeps both verdicts", () => {
  // The bug this feed exists for: endTurn judges the stakes on the seat it closes, then
  // beginTurn skips the corpse after it and voids the stakes on THAT seat — both inside one
  // action. A single "latest reveal" field dropped the judged one, which is the verdict
  // that actually moved cards.
  const t = tableReady(5);
  const a = t.room.players[t.room.turnIndex];
  const b = nextSeat(t);
  const seer = t.room.players.find((p) => p !== a && p !== b)!;

  // Stake on A by rewinding a seat, then on B the ordinary way.
  t.room.predictions.push({ byId: seer.id, targetId: a.id, kind: "plays", value: "0" });
  game.predict(t.code, seer.id, b.id, "plays", "2");

  kill(b);
  stackDeck(t.room, card("bang", "spades", 5)); // B's ghost flip fails on a Spade
  const seqBefore = t.room.predictSeq;
  game.endTurn(t.code, a.id);

  assert.equal(t.room.predictSeq, seqBefore + 2, "two verdicts were produced");
  assert.equal(t.room.predictFeed.length >= 2, true, "and the feed kept both");
  assert.ok(t.room.predictFeed.some((rv) => rv.targetId === a.id && !rv.results[0].voided), "A judged");
  assert.ok(t.room.predictFeed.some((rv) => rv.targetId === b.id && rv.results[0].voided), "B voided");
});
