// The card branches, which are the densest part of the engine and the ones a split
// would break silently: the game keeps running, the rules just quietly differ.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as game from "../game";
import { startTable, card, hand, equip, turnTo } from "./helpers/table";

// The Sheriff starts on one more life point than everybody else, so damage is
// asserted against each player's own maximum rather than against a fixed number.
const unhurt = (p: game.Player) => assert.equal(p.hp, p.maxHp, `${p.name} should be untouched`);
const hurt = (p: game.Player, n = 1) => assert.equal(p.hp, p.maxHp - n, `${p.name} should be down ${n}`);

test("Bang! takes a life point when the target has no answer", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  turnTo(room, a);
  const bang = card("bang", "clubs", 5);
  hand(a, bang);

  assert.ok(game.playCard(code, a.id, bang.id, b.id).ok);
  assert.equal(room.pending?.kind, "bang", "the shot waits on the target");
  assert.ok(game.respond(code, b.id, "pass").ok);
  hurt(b);
  assert.equal(room.pending, null);
});

test("Missed! answers a Bang! and nobody loses anything", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  turnTo(room, a);
  const bang = card("bang", "clubs", 5);
  const missed = card("missed", "hearts", 10);
  hand(a, bang);
  hand(b, missed);

  game.playCard(code, a.id, bang.id, b.id);
  assert.ok(game.respond(code, b.id, "missed", missed.id).ok);
  unhurt(b);
  assert.equal(b.hand.length, 0, "the Missed! is spent");
  assert.equal(room.pending, null);
});

test("one Bang! per turn, unless a gun says otherwise", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  turnTo(room, a);
  const first = card("bang", "clubs", 5);
  const second = card("bang", "hearts", 6);
  hand(a, first, second);

  game.playCard(code, a.id, first.id, b.id);
  game.respond(code, b.id, "pass");
  const res = game.playCard(code, a.id, second.id, b.id);
  assert.equal(res.ok, false);
  assert.equal(res.error?.code, "bang-limit-reached");
});

test("a Volcanic lifts the one-Bang! limit", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  turnTo(room, a);
  equip(a, card("volcanic", "spades", 10));
  const first = card("bang", "clubs", 5);
  const second = card("bang", "hearts", 6);
  hand(a, first, second);

  game.playCard(code, a.id, first.id, b.id);
  game.respond(code, b.id, "pass");
  assert.ok(game.playCard(code, a.id, second.id, b.id).ok, "the second shot is allowed");
  game.respond(code, b.id, "pass");
  hurt(b, 2);
});

test("Beer restores a life point but never past the maximum", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  turnTo(room, a);
  a.hp = a.maxHp - 2;
  const beer = card("beer", "hearts", 6);
  const another = card("beer", "hearts", 7);
  hand(a, beer, another);

  assert.ok(game.playCard(code, a.id, beer.id).ok);
  hurt(a);
  a.hp = a.maxHp;
  assert.equal(game.playCard(code, a.id, another.id).ok, false, "a full player cannot drink");
});

test("a Duel is traded Bang! for Bang!, and whoever runs dry pays", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  turnTo(room, a);
  const duel = card("duel", "diamonds", 8);
  hand(a, duel);
  hand(b); // no Bang! to answer with

  assert.ok(game.playCard(code, a.id, duel.id, b.id).ok);
  assert.equal(room.pending?.kind, "duel");
  assert.ok(game.respond(code, b.id, "pass").ok);
  hurt(b, 1);
  unhurt(a);
});

test("Indians! costs everyone else a Bang! or a life point", () => {
  const { code, room, players } = startTable(4);
  const [a, b, c, d] = players;
  turnTo(room, a);
  const indians = card("indians", "diamonds", 13);
  const bBang = card("bang", "clubs", 2);
  hand(a, indians);
  hand(b, bBang);

  assert.ok(game.playCard(code, a.id, indians.id).ok);
  assert.equal(room.pending?.kind, "multi");
  game.respond(code, b.id, "bang", bBang.id);
  game.respond(code, c.id, "pass");
  game.respond(code, d.id, "pass");

  unhurt(a); // the one who called it stands outside their own Indians!
  unhurt(b); // answering with a Bang! costs nothing but the card
  hurt(c);
  hurt(d);
});

test("Gatling shoots the whole table, and a Missed! still answers it", () => {
  const { code, room, players } = startTable(4);
  const [a, b, c, d] = players;
  turnTo(room, a);
  const gat = card("gatling", "hearts", 10);
  const missed = card("missed", "clubs", 3);
  hand(a, gat);
  hand(b, missed);

  assert.ok(game.playCard(code, a.id, gat.id).ok);
  game.respond(code, b.id, "missed", missed.id);
  game.respond(code, c.id, "pass");
  game.respond(code, d.id, "pass");

  // Damage lands once everybody has answered, not one seat at a time.
  unhurt(b);
  hurt(c);
  hurt(d);
  unhurt(a);
});
