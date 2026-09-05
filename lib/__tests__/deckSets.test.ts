// A mistyped suit still builds, still shuffles, still deals — the game just quietly
// becomes a different game with different Draw! odds, and `count` cannot catch it
// because the totals still add up. So these tests check SHAPE, not only size.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeck, CARD_DEFS, rankLabel, SUIT_SYMBOL, type Card, type Suit } from "../cards";
import * as game from "../game";
import { startTable, card, equip, sock } from "./helpers/table";

const SUITS: Suit[] = ["spades", "clubs", "hearts", "diamonds"];

const printedValue = (c: Card) => `${rankLabel(c.rank)}${SUIT_SYMBOL[c.suit]}`;

// Multiset difference, not a set or id difference: buildDeck renumbers ids on every call,
// and Dodge City reprints 5♣/6♣ as Bang!s the base deck already holds.
function dodgeCityHalf(): Card[] {
  const key = (c: Card) => `${c.defId}|${c.rank}|${c.suit}`;
  const budget = new Map<string, number>();
  for (const c of buildDeck()) budget.set(key(c), (budget.get(key(c)) ?? 0) + 1);
  const extra: Card[] = [];
  for (const c of buildDeck({ dodgeCity: true })) {
    const left = budget.get(key(c)) ?? 0;
    if (left > 0) budget.set(key(c), left - 1);
    else extra.push(c);
  }
  return extra;
}

test("the base deck stays 80 cards, expansion off", () => {
  assert.equal(buildDeck().length, 80);
  assert.equal(buildDeck({ dodgeCity: false }).length, 80);
});

// A tripwire, not a target: 18 -> 26 with the new brown cards (phase 04), 26 -> 40 with
// the green ones (phase 05). An unintended change here is the drift these tests exist for.
const DC_CARDS_SO_FAR = 18;

test("Dodge City contributes exactly the cards transcribed so far", () => {
  assert.equal(dodgeCityHalf().length, DC_CARDS_SO_FAR);
  assert.equal(buildDeck({ dodgeCity: true }).length, 80 + DC_CARDS_SO_FAR);
});

test("the suit spread stays even as the expansion is transcribed", () => {
  // Barrel reads Hearts, Dynamite reads [2-9] Spades — a lopsided expansion moves every
  // Draw! in the game. Only the COMPLETE 40 balance 10 to a suit; until then just check
  // nothing has run away.
  const bySuit = Object.fromEntries(
    SUITS.map((s) => [s, dodgeCityHalf().filter((c) => c.suit === s).length])
  );
  const total = dodgeCityHalf().length;
  for (const [suit, n] of Object.entries(bySuit)) {
    assert.ok(n * 2 <= total, `${suit} holds ${n} of ${total} — the expansion is listing`);
  }
  if (total === 40) {
    assert.deepEqual(bySuit, { spades: 10, clubs: 10, hearts: 10, diamonds: 10 });
  }
});

test("no two Dodge City cards carry the same printed value", () => {
  // The check that caught the published list printing Whisky as Q♦ while Pony Express
  // held it. Uniqueness is WITHIN the expansion — 5♣/6♣ are deliberate reprints.
  const seen = new Map<string, string>();
  for (const c of dodgeCityHalf()) {
    const v = printedValue(c);
    const prev = seen.get(v);
    assert.equal(prev, undefined, `${v} is printed on both ${prev} and ${c.defId}`);
    seen.set(v, c.defId);
  }
});

test("every set's spec is checked against its OWN count, never a pooled total", () => {
  const twoSet = CARD_DEFS.filter((d) => d.sets.base && d.sets.dodgeCity);
  assert.equal(twoSet.length, 12, "12 base cards get extra copies in Dodge City");
  assert.doesNotThrow(() => buildDeck({ dodgeCity: true }));
});

test("Hideout is a second Mustang and Binocular a second Scope, and they stack", () => {
  const { room, players } = startTable(5);
  const [a, b] = players;
  assert.equal(game.distanceBetween(room, a, b), 1);

  equip(b, card("mustang", "hearts", 8), card("hideout", "diamonds", 13));
  assert.equal(game.distanceBetween(room, a, b), 3);

  equip(a, card("scope", "spades", 1), card("binocular", "diamonds", 10));
  assert.equal(game.distanceBetween(room, a, b), 1);
  assert.equal(game.distanceBetween(room, b, a), 1, "neither viewer's lenses reach back");
});

test("the expansion is a room rule: off by default, and lobby only", () => {
  const { room, code } = startTable(4); // leaves the table mid-game
  assert.equal(room.dodgeCityOn, false, "a new room plays the base game");
  assert.equal(room.phase, "playing");
  assert.equal(game.setDodgeCityOn(code, true), false, "refused outside the lobby");
  assert.equal(room.dodgeCityOn, false, "and the refusal changed nothing");
});

test("a Dodge City room deals from the thicker deck", () => {
  // Built by hand rather than through startTable, which exists to empty the deck.
  const { room } = game.createRoom("P0", sock());
  for (let i = 1; i < 4; i++) game.addPlayer(room.code, `P${i}`, sock());
  game.setEventLevel(room.code, "off"); // the opening round would shuffle cards between piles

  assert.equal(game.setDodgeCityOn(room.code, true), true, "settable in the lobby");
  assert.ok(game.startGame(room.code).ok);
  for (const p of room.players) game.pickCharacter(room.code, p.id, p.draftChoices[0].id);

  const held = room.players.reduce((n, p) => n + p.hand.length + p.equipment.length, 0);
  assert.equal(room.deck.length + room.discard.length + held, 80 + DC_CARDS_SO_FAR);
});
