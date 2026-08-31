// Prediction against a real table: staking on the running turn, the clock that closes the
// window, taking a guess back, payout, the reveal channel, and the paths where a prediction
// has to be thrown away instead of judged.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as game from "../game";
import { PREDICT_WINDOW_MS, PREDICT_WINDOW_PER_DEATH_MS } from "../predictions";
import { card, hand, kill, startTable, stackDeck, turnTo, type Table } from "./helpers/table";

// Whose turn guesses are open on: the seat playing right now.
function subjectOf(t: Table): game.Player {
  const id = game.buildView(t.room, t.sheriff.id).predictSubjectId;
  return t.room.players.find((p) => p.id === id)!;
}

// A table with the turn on the Sheriff. Everybody gets a couple of cards: staking a guess
// requires being able to pay for a miss, and the payout needs a deck to draw from.
function tableReady(n = 4) {
  const t = startTable(n);
  for (const p of t.room.players) hand(p, card("beer", "hearts", 6), card("beer", "hearts", 7));
  stackDeck(t.room, ...Array.from({ length: 8 }, (_, i) => card("beer", "hearts", 6 + (i % 6))));
  return t;
}

// Somebody who is not the one playing, so they may legally stake.
const watcherIn = (t: Table, subject: game.Player) =>
  t.room.players.find((p) => p !== subject && p.alive)!;

test("the subject of a guess is the seat playing right now, not the next one", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  assert.equal(subjectOf(t).id, cur.id);
  game.endTurn(t.code, cur.id);
  assert.notEqual(subjectOf(t).id, cur.id, "it follows the turn");
  assert.equal(subjectOf(t).id, t.room.players[t.room.turnIndex].id);
});

test("a correct read pays one card", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const seer = watcherIn(t, cur);
  const before = seer.hand.length;

  // They will play exactly one card, so "1" is the right bucket.
  assert.equal(game.predict(t.code, seer.id, cur.id, "1").ok, true);
  hand(cur, card("mustang", "hearts", 8));
  game.playCard(t.code, cur.id, cur.hand.at(-1)!.id);
  assert.equal(t.room.playsThisTurn, 1);
  game.endTurn(t.code, cur.id);

  assert.equal(seer.hand.length, before + 1);
});

test("a wrong read costs one card", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const seer = watcherIn(t, cur);
  const before = seer.hand.length;

  // They will play nothing, so "2" is wrong.
  game.predict(t.code, seer.id, cur.id, "2");
  game.endTurn(t.code, cur.id);

  assert.equal(seer.hand.length, before - 1);
});

test("bucket 0 is right on a turn where nothing is played", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const seer = watcherIn(t, cur);
  const before = seer.hand.length;

  game.predict(t.code, seer.id, cur.id, "0");
  game.endTurn(t.code, cur.id);
  assert.equal(seer.hand.length, before + 1);
});

test("3+ covers everything from three cards up", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const seer = watcherIn(t, cur);
  const before = seer.hand.length;

  game.predict(t.code, seer.id, cur.id, "3+");
  // Three different blue self-equips: the once-per-card-type-per-turn house rule means they
  // have to be distinct card types, which is exactly why the buckets stop at 3+.
  hand(cur, card("mustang", "hearts", 8), card("scope", "spades", 1), card("barrel", "spades", 12));
  for (const c of [...cur.hand].filter((c) => c.defId !== "beer")) {
    game.playCard(t.code, cur.id, c.id);
  }
  assert.equal(t.room.playsThisTurn, 3);
  game.endTurn(t.code, cur.id);

  assert.equal(seer.hand.length, before + 1);
});

test("the staking window closes on the clock, and a late press is refused", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const seer = watcherIn(t, cur);
  const before = seer.hand.length;

  // The engine reads a timestamp, never a timer, so a test moves the clock by moving the
  // deadline. Nothing else in the game has to be wound forward.
  t.room.predictEndsAt = Date.now() - 1;
  assert.equal(game.predict(t.code, seer.id, cur.id, "1").error?.code, "predict-window-closed");
  assert.equal(t.room.predictions.length, 0);
  assert.equal(seer.hand.length, before, "a refused stake costs nothing");

  // ...and the panel is told the same thing, so it greys out rather than letting somebody
  // press into a refusal.
  const v = game.buildView(t.room, seer.id);
  assert.equal(v.you.canPredict, false);
  assert.equal(v.you.predictBlockReason, "predict-window-closed");
  assert.equal(v.predictMsLeft, 0);
});

test("a new turn opens a fresh window, and it narrows as the table empties", () => {
  // TWO tables, not two turns on one: beginTurn leaves the new turn in the draw phase, so a
  // second endTurn on the same table is refused with must-draw-first and the deadline never
  // moves — which is how this test first passed while measuring nothing at all.
  const full = tableReady(5);
  const curFull = full.room.players[full.room.turnIndex];
  const atFull = Date.now();
  assert.equal(game.endTurn(full.code, curFull.id).ok, true);
  const openMs = full.room.predictEndsAt - atFull;
  assert.ok(openMs > 0, "the new turn re-opened the window");
  assert.ok(openMs <= PREDICT_WINDOW_MS, `a fresh window is at most the full one, got ${openMs}`);

  // Same shape, two corpses already on the table: two steps off the clock. Measured against
  // the deadline rather than the view's remaining-ms so the assertion cannot race the wall
  // clock between two reads.
  const thin = tableReady(5);
  const curThin = thin.room.players[thin.room.turnIndex];
  const heir = thin.room.players[(thin.room.turnIndex + 1) % thin.room.players.length];
  for (const p of thin.room.players.filter((p) => p !== curThin && p !== heir).slice(0, 2)) kill(p);
  const atThin = Date.now();
  assert.equal(game.endTurn(thin.code, curThin.id).ok, true);
  const narrowed = thin.room.predictEndsAt - atThin;
  assert.ok(
    narrowed <= PREDICT_WINDOW_MS - 2 * PREDICT_WINDOW_PER_DEATH_MS,
    `two deaths should have taken ${2 * PREDICT_WINDOW_PER_DEATH_MS}ms off, got ${narrowed}`
  );
});

test("a table waiting on a reaction does NOT block staking", () => {
  // This used to be blocked, and it was the single biggest reason a player found the panel
  // dead: measured over 150 games the table sits in a pending for 26% of all engine steps.
  // It hid nothing either — playsThisTurn moves in playCard alone, and the Bang! that opened
  // this pending was counted before the pending existed.
  const t = tableReady(5);
  const cur = t.room.players[t.room.turnIndex];
  // The seat immediately clockwise: distance 1, so a default range-1 Bang! reaches it. Any
  // other seat is out of range and playCard would simply refuse, leaving no pending at all.
  const victim = t.room.players[(t.room.turnIndex + 1) % t.room.players.length];
  const seer = t.room.players.find((p) => p !== cur && p !== victim && p.alive)!;

  hand(cur, card("bang", "spades", 5));
  game.playCard(t.code, cur.id, cur.hand.at(-1)!.id, victim.id);
  assert.ok(t.room.pending, "the Bang! is waiting on an answer");
  assert.equal(t.room.playsThisTurn, 1, "and the card was already counted");

  const v = game.buildView(t.room, seer.id);
  assert.equal(v.you.canPredict, true, "the panel stays live");
  assert.equal(v.you.predictBlockReason, null);
  assert.equal(game.predict(t.code, seer.id, cur.id, "1").ok, true);

  // ...and it is judged normally once the turn actually ends.
  game.respond(t.code, victim.id, "pass");
  const before = seer.hand.length;
  game.endTurn(t.code, cur.id);
  assert.equal(seer.hand.length, before + 1, "one card played, bucket 1, paid");
});

test("a guess can be taken back while the table waits on a reaction", () => {
  const t = tableReady(5);
  const cur = t.room.players[t.room.turnIndex];
  const victim = t.room.players[(t.room.turnIndex + 1) % t.room.players.length];
  const seer = t.room.players.find((p) => p !== cur && p !== victim && p.alive)!;

  game.predict(t.code, seer.id, cur.id, "0");
  hand(cur, card("bang", "spades", 5));
  game.playCard(t.code, cur.id, cur.hand.at(-1)!.id, victim.id);
  assert.ok(t.room.pending);
  // Seeing the Bang! go down is exactly when you want out of bucket "0". The clock is the
  // only thing that closes the door, not the pending.
  assert.equal(game.cancelPrediction(t.code, seer.id, cur.id).ok, true);
  assert.equal(game.predict(t.code, seer.id, cur.id, "1").ok, true);
});

test("a guess can be taken back while the clock runs, and not after", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const seer = watcherIn(t, cur);
  const before = seer.hand.length;

  assert.equal(game.predict(t.code, seer.id, cur.id, "1").ok, true);
  assert.equal(game.cancelPrediction(t.code, seer.id, cur.id).ok, true);
  assert.equal(t.room.predictions.length, 0);
  // Nothing is charged at stake time, so undoing one moves no cards and refunds nothing.
  assert.equal(seer.hand.length, before);

  // Cancelling twice is a no-op, not a crash.
  assert.equal(game.cancelPrediction(t.code, seer.id, cur.id).error?.code, "no-prediction-to-cancel");

  // Re-stake, then let the window shut: now it is final. Otherwise "confirm" would mean
  // nothing — you could stake a bucket, watch a card go down, and swap to the true one.
  assert.equal(game.predict(t.code, seer.id, cur.id, "0").ok, true);
  t.room.predictEndsAt = Date.now() - 1;
  assert.equal(game.cancelPrediction(t.code, seer.id, cur.id).error?.code, "predict-window-closed");
  assert.equal(t.room.predictions.length, 1, "the stake stands");
});

test("cancelling frees the slot, so a different bucket can be staked instead", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const seer = watcherIn(t, cur);

  game.predict(t.code, seer.id, cur.id, "1");
  assert.equal(game.predict(t.code, seer.id, cur.id, "2").error?.code, "already-predicted");
  game.cancelPrediction(t.code, seer.id, cur.id);
  assert.equal(game.predict(t.code, seer.id, cur.id, "2").ok, true);
  assert.equal(t.room.predictions.length, 1);
  assert.equal(t.room.predictions[0].value, "2");
});

test("one player's cancel does not touch anybody else's stake", () => {
  const t = tableReady(5);
  const cur = t.room.players[t.room.turnIndex];
  const others = t.room.players.filter((p) => p !== cur);
  for (const p of others) game.predict(t.code, p.id, cur.id, "1");
  assert.equal(t.room.predictions.length, others.length);

  game.cancelPrediction(t.code, others[0].id, cur.id);
  assert.equal(t.room.predictions.length, others.length - 1);
  assert.ok(!t.room.predictions.some((p) => p.byId === others[0].id));
  for (const p of others.slice(1)) assert.ok(t.room.predictions.some((x) => x.byId === p.id));
});

test("you may not predict yourself or a corpse — a bot is fine", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const other = watcherIn(t, cur);

  // Yourself: you decide the answer, so it is not a read. This is also what makes the
  // feature something you do on other people's turns.
  assert.equal(game.predict(t.code, cur.id, cur.id, "1").error?.code, "bad-predict-target");
  // Somebody who is not the one playing is not the subject either.
  assert.equal(game.predict(t.code, cur.id, other.id, "1").error?.code, "bad-predict-target");
  // A bot IS predictable, deliberately: forbidding it made the feature unreachable for one
  // human at a table of bots.
  cur.isBot = true;
  assert.equal(game.predict(t.code, other.id, cur.id, "1").ok, true);
});

test("an empty hand cannot stake, because it cannot pay for a miss", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const seer = watcherIn(t, cur);

  seer.hand = [];
  assert.equal(game.predict(t.code, seer.id, cur.id, "1").error?.code, "predict-needs-a-card");
  hand(seer, card("beer", "hearts", 6));
  assert.equal(game.predict(t.code, seer.id, cur.id, "1").ok, true);
});

test("only one guess per turn, and a refusal is not charged", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const seer = watcherIn(t, cur);
  const before = seer.hand.length;

  assert.equal(game.predict(t.code, seer.id, cur.id, "1").ok, true);
  assert.equal(game.predict(t.code, seer.id, cur.id, "2").error?.code, "already-predicted");
  assert.equal(t.room.predictions.filter((p) => p.byId === seer.id).length, 1);
  assert.equal(seer.hand.length, before);
});

test("only a real bucket is accepted over the wire", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const seer = watcherIn(t, cur);
  for (const bad of ["4", "", "none", "-1", "3"]) {
    const res = game.predict(t.code, seer.id, cur.id, bad);
    if (bad === "3") continue; // "3" is not a bucket label; "3+" is
    assert.equal(res.error?.code, "invalid-prediction", `value ${JSON.stringify(bad)}`);
  }
  assert.equal(t.room.predictions.length, 0);
});

test("the reveal goes to its own channel and never lengthens the shared log", () => {
  const t = tableReady(5);
  const cur = t.room.players[t.room.turnIndex];
  const seers = t.room.players.filter((p) => p !== cur);
  for (const s of seers) game.predict(t.code, s.id, cur.id, "0");

  const logBefore = t.room.log.length;
  const seqBefore = t.room.predictSeq;
  game.endTurn(t.code, cur.id);

  // Six verdicts a turn would flood a 40-entry log within a few turns, so the reveal rides
  // its own field instead.
  assert.equal(t.room.log.length, logBefore + 1, "only the ordinary turn line was logged");
  assert.ok(!t.room.log.some((e) => (e.kind as string) === "predict"), "no predict entries in the log");
  assert.equal(t.room.predictSeq, seqBefore + 1, "the reveal seq advanced exactly once");
  const verdict = t.room.predictFeed.at(-1);
  assert.equal(verdict?.targetId, cur.id);
  assert.equal(verdict?.results.length, seers.length);
  assert.equal(t.room.predictions.length, 0, "judged predictions are cleared");
});

test("a subject who quits mid-turn voids the stakes instead of judging them", () => {
  // This is the void path as it exists now. Under the old design (guesses on the NEXT seat)
  // a whole skipped turn could carry stakes; now you can only stake on the seat already
  // playing, so the only way to reach the void is a hand-off that BYPASSES endTurn —
  // surrender and disconnect. Both funnel through advanceToNextSeat, which is where the
  // void lives.
  const t = tableReady(5);
  // The turn has to sit on somebody whose exit does not end the game: surrender only hands
  // the turn on while the game is still running, and a Sheriff leaving ends it outright.
  const subject = t.room.players.find((p) => p.role === "outlaw")!;
  turnTo(t.room, subject);
  const seer = watcherIn(t, subject);
  const before = seer.hand.length;

  game.predict(t.code, seer.id, subject.id, "2");
  game.surrender(t.code, subject.id);
  assert.equal(t.room.phase, "playing", "the game has to still be running for a hand-off");

  assert.equal(seer.hand.length, before, "neither paid nor charged");
  assert.equal(t.room.predictions.length, 0, "the stake was thrown away, not left hanging");
  assert.ok(
    t.room.predictFeed.some((rv) => rv.results.some((r) => r.voided)),
    "the feed says it was voided"
  );
});

test("a subject who dies but whose turn still ends is JUDGED, not voided", () => {
  // The other half of the rule, pinned because it is the surprising half and it was found by
  // a test that expected the opposite. endTurn judges whatever turn it closes; being dead is
  // not the same as the turn never resolving. They held the turn and played nothing, so "0"
  // is a correct read and gets paid.
  const t = tableReady(5);
  const cur = t.room.players[t.room.turnIndex];
  const right = watcherIn(t, cur);
  const wrong = t.room.players.find((p) => p !== cur && p !== right && p.alive)!;
  const beforeRight = right.hand.length;
  const beforeWrong = wrong.hand.length;

  game.predict(t.code, right.id, cur.id, "0");
  game.predict(t.code, wrong.id, cur.id, "2");
  kill(cur);
  assert.equal(game.endTurn(t.code, cur.id).ok, true);

  assert.equal(right.hand.length, beforeRight + 1, "the correct read was paid");
  assert.equal(wrong.hand.length, beforeWrong - 1, "the wrong one was charged");
  assert.ok(!t.room.predictFeed.at(-1)?.results.some((r) => r.voided));
});

test("the end of the game clears every outstanding prediction", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const seer = watcherIn(t, cur);
  game.predict(t.code, seer.id, cur.id, "1");

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
  const seer = watcherIn(t, cur);
  game.predict(t.code, seer.id, cur.id, "3+");

  const mine = game.buildView(t.room, seer.id);
  assert.equal(mine.you.myPredictions.length, 1);
  assert.equal(mine.you.myPredictions[0].value, "3+");

  const theirs = game.buildView(t.room, cur.id);
  assert.equal(theirs.you.myPredictions.length, 0);
  // ...and the value is not reachable anywhere else in a view that is not the staker's.
  assert.ok(
    !JSON.stringify({ players: theirs.players, log: theirs.log }).includes('"value":"3+"'),
    "no stake leaks through the public seats or the log"
  );
  assert.equal("predictions" in (theirs as unknown as Record<string, unknown>), false);
});

test("the view names the subject and the time left", () => {
  const t = tableReady();
  const cur = t.room.players[t.room.turnIndex];
  const v = game.buildView(t.room, cur.id);
  assert.equal(v.predictSubjectId, cur.id);
  assert.ok(v.predictMsLeft > 0 && v.predictMsLeft <= PREDICT_WINDOW_MS);
});

test("one action that judges a turn AND skips the next keeps both verdicts", () => {
  // The bug this feed exists for: endTurn judges the stakes on the seat it closes, then
  // beginTurn skips the corpse after it and voids the stakes on THAT seat — both inside one
  // action. A single "latest reveal" field dropped the judged one, which is the verdict
  // that actually moved cards.
  const t = tableReady(5);
  const a = t.room.players[t.room.turnIndex];
  const b = t.room.players[(t.room.turnIndex + 1) % t.room.players.length];
  const seer = t.room.players.find((p) => p !== a && p !== b)!;

  // On A the ordinary way; on B by hand, since B is not the subject yet.
  game.predict(t.code, seer.id, a.id, "0");
  t.room.predictions.push({ byId: seer.id, targetId: b.id, value: "0" });

  kill(b);
  stackDeck(t.room, card("bang", "spades", 5)); // B's ghost flip fails on a Spade
  const seqBefore = t.room.predictSeq;
  game.endTurn(t.code, a.id);

  assert.equal(t.room.predictSeq, seqBefore + 2, "two verdicts were produced");
  assert.ok(t.room.predictFeed.length >= 2, "and the feed kept both");
  assert.ok(t.room.predictFeed.some((rv) => rv.targetId === a.id && !rv.results[0].voided), "A judged");
  assert.ok(t.room.predictFeed.some((rv) => rv.targetId === b.id && rv.results[0].voided), "B voided");
});

test("you.canPredict never disagrees with what the engine will accept", () => {
  // The gap that let a real bug ship: predictionProblem and predict were both tested, but
  // nothing checked the view flag the panel actually reads. predictBlock probed availability
  // with a placeholder value, that placeholder was invalid, and so every button greyed out on
  // turns the engine would have taken. A disagreement here is invisible in the engine and
  // total in the UI.
  const t = tableReady(4);
  for (let lap = 0; lap < t.room.players.length * 2; lap++) {
    const v = game.buildView(t.room, t.sheriff.id);
    const res = game.predict(t.code, t.sheriff.id, v.predictSubjectId ?? "", "1");
    assert.equal(
      v.you.canPredict,
      res.ok,
      `turn ${lap}: view said canPredict=${v.you.canPredict} but the engine said ${res.ok ? "ok" : res.error?.code}`
    );
    t.room.predictions = [];
    turnTo(t.room, t.room.players[(t.room.turnIndex + 1) % t.room.players.length]);
  }
});

test("canPredict agrees with the engine once the window has shut, too", () => {
  // The window is the one block reason the panel can hit without anything else changing, so
  // it gets its own agreement check rather than riding on the lap above.
  const t = tableReady(4);
  t.room.predictEndsAt = Date.now() - 1;
  const v = game.buildView(t.room, t.sheriff.id);
  const res = game.predict(t.code, t.sheriff.id, v.predictSubjectId ?? "", "1");
  assert.equal(v.you.canPredict, false);
  assert.equal(res.ok, false);
});

test("a lone human at a table of bots can stake on every turn but their own", () => {
  // The rule that forbade predicting a bot left exactly 0 legal predictions out of 8 turns
  // for a lone human. That made the whole feature unreachable in the setup the game is
  // actually played in.
  const t = tableReady(4);
  for (const p of t.room.players) if (p !== t.sheriff) p.isBot = true;
  let legal = 0;
  for (let lap = 0; lap < t.room.players.length * 2; lap++) {
    const subjectId = game.buildView(t.room, t.sheriff.id).predictSubjectId;
    if (game.predict(t.code, t.sheriff.id, subjectId ?? "", "1").ok) legal++;
    t.room.predictions = [];
    turnTo(t.room, t.room.players[(t.room.turnIndex + 1) % t.room.players.length]);
  }
  // Every turn but the two where the lone human is the one playing.
  assert.equal(legal, 6);
});
