// Draw! checks: Dynamite, Jail and Barrel all turn on the suit and rank of one
// flipped card, so stacking the deck makes every outcome here exact.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as game from "../game";
import { startTable, card, hand, equip, stackDeck, turnTo } from "./helpers/table";

// Hand the turn to `from` and end it, so `to` runs its upkeep — which is the only
// place Dynamite and Jail are ever checked.
function passTurnTo(code: string, room: game.Room, from: game.Player) {
  turnTo(room, from);
  from.hand = [];
  return game.endTurn(code, from.id);
}

test("Dynamite blows up on spades 2 through 9, for three life points", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  equip(b, card("dynamite", "spades", 5));
  stackDeck(room, card("bang", "spades", 5)); // the flip that decides it
  const before = b.hp;

  passTurnTo(code, room, a);
  assert.equal(b.hp, before - 3);
  assert.ok(!b.equipment.some((c) => c.defId === "dynamite"), "it is spent, not passed on");
  assert.equal(room.checks.at(-1)?.outcome, "blast");
});

test("a Dynamite that does not go off drifts to the next seat", () => {
  const { code, room, players } = startTable(4);
  const [a, b, c] = players;
  equip(b, card("dynamite", "spades", 5));
  stackDeck(room, card("beer", "hearts", 6)); // a Heart is safe
  const before = b.hp;

  passTurnTo(code, room, a);
  assert.equal(b.hp, before, "nobody is hurt");
  assert.ok(!b.equipment.some((x) => x.defId === "dynamite"));
  assert.ok(c.equipment.some((x) => x.defId === "dynamite"), "it moves along the table");
  assert.equal(room.checks.at(-1)?.outcome, "safe");
});

test("spades outside 2..9 are safe — the boundary is the whole rule", () => {
  for (const [rank, outcome] of [[1, "safe"], [2, "blast"], [9, "blast"], [10, "safe"]] as const) {
    const { code, room, players } = startTable(4);
    const [a, b] = players;
    equip(b, card("dynamite", "spades", 5));
    stackDeck(room, card("bang", "spades", rank));
    passTurnTo(code, room, a);
    assert.equal(room.checks.at(-1)?.outcome, outcome, `spades ${rank} should be ${outcome}`);
  }
});

test("Jail opens on a Heart and holds on anything else", () => {
  for (const [suit, outcome] of [["hearts", "free"], ["spades", "skip"]] as const) {
    const { code, room, players } = startTable(4);
    const [a, b] = players;
    equip(b, card("jail", "spades", 10));
    stackDeck(room, card("beer", suit, 7));

    passTurnTo(code, room, a);
    assert.equal(room.checks.at(-1)?.kind, "jail");
    assert.equal(room.checks.at(-1)?.outcome, outcome, `a ${suit} flip`);
    assert.ok(!b.equipment.some((c) => c.defId === "jail"), "the card is spent either way");
    assert.ok(room.discard.some((c) => c.defId === "jail"));
  }
});

test("a jailed player still discards down to the hand limit", () => {
  // Jail costs the turn but must not shelter a hand from the limit — otherwise
  // being jailed would be a way to sit on a full hand indefinitely.
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  equip(b, card("jail", "spades", 10));
  stackDeck(room, card("beer", "spades", 7)); // held
  hand(b, ...Array.from({ length: b.hp + 2 }, (_, i) => card("bang", "clubs", i + 2)));

  passTurnTo(code, room, a);
  assert.equal(room.jailedTurn, true);
  assert.equal(room.turnPhase, "discard");
  assert.equal(room.players[room.turnIndex], b, "it is still their turn, just a spent one");
});

test("a Barrel answers a Bang! on a Heart, and does nothing otherwise", () => {
  for (const [suit, saved] of [["hearts", true], ["clubs", false]] as const) {
    const { code, room, players } = startTable(4);
    const [a, b] = players;
    turnTo(room, a);
    equip(b, card("barrel", "spades", 12));
    stackDeck(room, card("beer", suit, 7));
    const bang = card("bang", "clubs", 5);
    hand(a, bang);

    game.playCard(code, a.id, bang.id, b.id);
    if (room.pending) game.respond(code, b.id, "pass");
    assert.equal(b.hp, saved ? b.maxHp : b.maxHp - 1, `a ${suit} barrel flip`);
    assert.equal(room.checks.at(-1)?.kind, "barrel");
  }
});

test("every check leaves a record for the table to read", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  equip(b, card("dynamite", "spades", 5));
  stackDeck(room, card("bang", "spades", 4));
  passTurnTo(code, room, a);

  const chk = room.checks.at(-1)!;
  assert.equal(chk.name, b.name);
  assert.equal(chk.kind, "dynamite");
  assert.equal(chk.card?.suit, "spades");
  assert.equal(chk.card?.rank, 4);
});
