// Proves the harness itself, since every other test trusts it.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as game from "../game";
import { startTable, card, stackDeck, hand } from "./helpers/table";

test("startTable seats a game that is actually in progress", () => {
  const t = startTable(4);
  assert.equal(t.room.phase, "playing");
  assert.equal(t.players.length, 4);
  assert.ok(t.players.every((p) => p.character), "every seat has a character");
  assert.ok(t.players.every((p) => p.hand.length === 0), "hands start empty");
  assert.equal(t.room.deck.length, 0);
});

test("the Sheriff carries the extra life point and opens play", () => {
  const t = startTable(4);
  const others = t.players.filter((p) => p !== t.sheriff);
  assert.equal(t.sheriff.hp, 5);
  assert.ok(others.every((p) => p.hp === 4));
  assert.equal(t.room.players[t.room.turnIndex], t.sheriff);
  assert.equal(t.room.turnPhase, "play");
});

test("stackDeck hands cards over in the order they were written", () => {
  const t = startTable(4);
  // The engine draws off the end of the array; the helper has to hide that, or every
  // Draw! check test would assert the reverse of what it meant.
  stackDeck(t.room, card("bang", "hearts", 5), card("beer", "spades", 9));
  const first = t.room.deck.pop()!;
  const second = t.room.deck.pop()!;
  assert.equal(first.defId, "bang");
  assert.equal(first.suit, "hearts");
  assert.equal(second.defId, "beer");
});

test("each seat is independent, and rooms do not leak between tables", () => {
  const a = startTable(4);
  const b = startTable(5);
  hand(a.players[1], card("bang", "clubs", 2));
  assert.equal(a.players[1].hand.length, 1);
  assert.equal(b.players[1].hand.length, 0);
  assert.notEqual(a.code, b.code);
  assert.equal(game.getRoom(b.code)!.players.length, 5);
});
