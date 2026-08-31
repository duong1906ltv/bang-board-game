// Seat order IS the distance metric every range check reads, so an off-by-one here
// changes who can shoot whom without any type error to catch it.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as game from "../game";
import { startTable, card, equip, hand, kill, turnTo } from "./helpers/table";

test("distance is the shorter way round the circle, and it is symmetric", () => {
  const { room, players } = startTable(5);
  const [a, b, c, d, e] = players;
  assert.equal(game.distanceBetween(room, a, a), 0);
  assert.equal(game.distanceBetween(room, a, b), 1);
  assert.equal(game.distanceBetween(room, a, c), 2);
  // Going the other way is shorter to d and e, so they are 2 and 1 away, not 3 and 4.
  assert.equal(game.distanceBetween(room, a, d), 2);
  assert.equal(game.distanceBetween(room, a, e), 1);
  for (const other of [b, c, d, e]) {
    assert.equal(
      game.distanceBetween(room, a, other),
      game.distanceBetween(room, other, a),
      "the table cannot be closer one way than the other"
    );
  }
});

test("the dead leave the circle, so their neighbours close ranks", () => {
  const { room, players } = startTable(5);
  const [a, b, c] = players;
  assert.equal(game.distanceBetween(room, a, c), 2);
  kill(b);
  assert.equal(game.distanceBetween(room, a, c), 1, "nobody counts an empty chair");
});

test("Mustang pushes the target away; Scope pulls the viewer closer", () => {
  const { room, players } = startTable(4);
  const [a, b] = players;
  assert.equal(game.distanceBetween(room, a, b), 1);

  equip(b, card("mustang", "hearts", 8));
  assert.equal(game.distanceBetween(room, a, b), 2);

  equip(a, card("scope", "spades", 1));
  assert.equal(game.distanceBetween(room, a, b), 1, "the two cancel out");
  assert.equal(game.distanceBetween(room, b, a), 1, "and neither one reaches back");
});

test("a card and an ability pulling the same way stack", () => {
  const { room, players } = startTable(5);
  const [a, b] = players;
  equip(b, card("mustang", "hearts", 9));
  // Paul Regret: others see him one seat farther away.
  b.character = { ...b.character!, effect: { distanceToDelta: 1 } };
  assert.equal(game.distanceBetween(room, a, b), 3, "1 seat + Mustang + Paul Regret");
});

test("distance never drops below one, however much Scope is stacked", () => {
  const { room, players } = startTable(4);
  const [a, b] = players;
  equip(a, card("scope", "spades", 1));
  a.character = { ...a.character!, effect: { distanceSeenDelta: 2 } };
  assert.equal(game.distanceBetween(room, a, b), 1);
});

test("range is one bare-handed, and each gun states its own reach", () => {
  const { room, players } = startTable(4);
  const p = players[0];
  assert.equal(game.rangeOf(p, room), 1);
  for (const [gun, reach] of [["volcanic", 1], ["schofield", 2], ["remington", 3], ["rev-carabine", 4], ["winchester", 5]] as const) {
    equip(p, card(gun, "clubs", 10));
    assert.equal(game.rangeOf(p, room), reach, `${gun} reaches ${reach}`);
  }
});

test("a second gun replaces the first rather than adding to it", () => {
  const { room, players } = startTable(4);
  const p = players[0];
  equip(p, card("volcanic", "spades", 10), card("winchester", "spades", 8));
  assert.equal(game.rangeOf(p, room), 5, "the last gun laid down is the one that counts");
});

test("Bang! is refused past the shooter's reach and allowed inside it", () => {
  const { room, players } = startTable(5);
  const [a, , c] = players;
  turnTo(room, a);
  assert.equal(game.distanceBetween(room, a, c), 2);
  assert.equal(game.targetProblem(room, a, "bang", c)?.code, "out-of-range");

  equip(a, card("schofield", "clubs", 11));
  assert.equal(game.targetProblem(room, a, "bang", c), null, "a Schofield reaches two seats");
});

test("Panic! only reaches the chair next door", () => {
  const { room, players } = startTable(5);
  const [a, b, c] = players;
  hand(b, card("bang", "hearts", 2));
  hand(c, card("bang", "hearts", 3));
  turnTo(room, a);
  assert.equal(game.targetProblem(room, a, "panic", b), null);
  // A gun lengthens Bang!, not Panic! — the card asks for distance 1 flat.
  equip(a, card("winchester", "spades", 8));
  assert.equal(game.targetProblem(room, a, "panic", c)?.code, "panic-needs-distance-1");
});

test("nobody shoots themselves, and nobody shoots a corpse", () => {
  const { room, players } = startTable(4);
  const [a, b] = players;
  turnTo(room, a);
  assert.ok(game.targetProblem(room, a, "bang", a), "self is not a target for Bang!");
  kill(b);
  assert.ok(game.targetProblem(room, a, "bang", b), "the dead are out of the game");
});

test("a seat leaving the lobby closes the gap in seat order", () => {
  // Seat order is the distance metric, so a departure must compact the list rather
  // than leave a hole — every later seat shifts one place towards the front.
  const room = game.createRoom("A", "geo-a").room;
  for (const n of ["B", "C", "D"]) game.addPlayer(room.code, n, `geo-${n}`);
  game.disconnect("geo-C");
  assert.deepEqual(room.players.map((p) => p.name), ["A", "B", "D"]);
});
