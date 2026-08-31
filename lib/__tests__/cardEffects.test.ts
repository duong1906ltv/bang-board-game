// Cards that take, bin or pin something rather than deal damage. Split from
// cardResolution.test.ts to keep both files inside the project's 200-line limit.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as game from "../game";
import { startTable, card, hand, turnTo } from "./helpers/table";

test("Cat Balou bins a card; Panic! takes it", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  turnTo(room, a);
  const balou = card("cat-balou", "hearts", 11);
  const victimCard = card("bang", "spades", 4);
  hand(a, balou);
  hand(b, victimCard);

  assert.ok(game.playCard(code, a.id, balou.id, b.id, victimCard.id).ok);
  // The card is not gone yet: the victim gets a beat to see what is being taken.
  assert.equal(room.pending?.kind, "taken");
  game.respond(code, b.id, "pass");

  assert.equal(b.hand.length, 0);
  assert.ok(room.discard.some((c) => c.id === victimCard.id), "it goes to the discard");
  assert.ok(!a.hand.some((c) => c.id === victimCard.id), "Cat Balou keeps nothing");
});

test("Panic! takes the card into the taker's own hand", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  turnTo(room, a);
  const panic = card("panic", "hearts", 11);
  const loot = card("bang", "spades", 4);
  hand(a, panic);
  hand(b, loot);

  assert.ok(game.playCard(code, a.id, panic.id, b.id, loot.id).ok);
  game.respond(code, b.id, "pass");
  assert.equal(b.hand.length, 0);
  assert.ok(a.hand.some((c) => c.id === loot.id), "Panic! keeps what Cat Balou would bin");
});

test("Jail stays off the Sheriff and off a player already holding one", () => {
  const { code, room, players } = startTable(4);
  const a = players.find((p) => p.role !== "sheriff")!;
  const sheriff = players.find((p) => p.role === "sheriff")!;
  const other = players.find((p) => p !== a && p !== sheriff)!;
  turnTo(room, a);
  const j1 = card("jail", "spades", 10);
  const j2 = card("jail", "hearts", 4);
  hand(a, j1, j2);

  assert.equal(game.playCard(code, a.id, j1.id, sheriff.id).error?.code, "cannot-jail-sheriff");
  assert.ok(game.playCard(code, a.id, j1.id, other.id).ok);
  turnTo(room, a); // a later turn, so the one-card-of-a-kind house rule is not what refuses
  assert.equal(game.playCard(code, a.id, j2.id, other.id).error?.code, "already-jailed");
});

test("the house rule allows one card of a kind per turn, and exempts Bang!", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  turnTo(room, a);
  a.hp = 1;
  const b1 = card("beer", "hearts", 6);
  const b2 = card("beer", "hearts", 7);
  hand(a, b1, b2);

  assert.ok(game.playCard(code, a.id, b1.id).ok);
  assert.equal(
    game.playCard(code, a.id, b2.id).error?.code,
    "card-already-used-this-turn",
    "a second Beer waits for the next turn"
  );
});
