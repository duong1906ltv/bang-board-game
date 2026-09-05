// Turn order, the hand limit, death and the win conditions — the rules that decide
// when a game ends and who it ended for. A split that breaks these leaves a table
// that plays on forever, or crowns the wrong side, with nothing raising an alarm.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as game from "../game";
import { startTable, card, hand, equip, stackDeck, turnTo, kill } from "./helpers/table";

// Roles are seated sheriff-first, so the Outlaws sit two chairs away — out of reach
// of a bare hand. Shoot with a Schofield when the target is not the next seat along.
function shoot(code: string, room: game.Room, from: game.Player, at: game.Player) {
  turnTo(room, from);
  equip(from, card("schofield", "clubs", 11));
  const bang = card("bang", "clubs", 5);
  from.hand = [bang, ...from.hand];
  const played = game.playCard(code, from.id, bang.id, at.id);
  assert.ok(played.ok, `the shot should be legal: ${JSON.stringify(played.error)}`);
  game.respond(code, at.id, "pass"); // no Missed!
  // Dropping to zero opens a last chance to drink; declining it is what kills.
  if (room.pending?.kind === "dying") game.respond(code, at.id, "pass");
}

test("the draw phase yields two cards, and only to whoever's turn it is", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  turnTo(room, a);
  room.turnPhase = "draw";
  stackDeck(room, card("bang", "clubs", 2), card("beer", "hearts", 3), card("missed", "spades", 4));

  assert.equal(game.drawCards(code, b.id), false, "not your turn, not your cards");
  assert.equal(game.drawCards(code, a.id), true);
  assert.equal(a.hand.length, 2);
  assert.equal(room.turnPhase, "play");
  assert.equal(game.drawCards(code, a.id), false, "the draw phase happens once");
});

test("nothing is played before the draw", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  turnTo(room, a);
  room.turnPhase = "draw";
  const bang = card("bang", "clubs", 5);
  hand(a, bang);
  assert.equal(game.playCard(code, a.id, bang.id, b.id).error?.code, "must-draw-first");
});

test("a turn cannot end over the hand limit, which is the player's own life", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  turnTo(room, a);
  hand(a, ...Array.from({ length: a.hp + 1 }, (_, i) => card("bang", "clubs", i + 2)));

  const res = game.endTurn(code, a.id);
  assert.equal(res.ok, false);
  assert.equal(res.error?.code, "hand-over-limit");

  assert.ok(game.discardCard(code, a.id, a.hand[0].id));
  assert.ok(game.endTurn(code, a.id).ok, "down to the limit, the turn passes");
});

test("the turn passes clockwise and steps over the dead", () => {
  const { code, room, players } = startTable(5);
  const [a, b, c] = players;
  turnTo(room, a);
  kill(b);

  assert.ok(game.endTurn(code, a.id).ok);
  assert.equal(room.players[room.turnIndex], c, "the empty chair is not offered a turn");
});

test("ending a turn wipes the per-turn budgets", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  turnTo(room, a);
  const bang = card("bang", "clubs", 5);
  hand(a, bang);
  game.playCard(code, a.id, bang.id, b.id);
  game.respond(code, b.id, "pass");
  assert.equal(room.bangsThisTurn, 1);

  game.endTurn(code, a.id);
  assert.equal(room.bangsThisTurn, 0);
  assert.equal(room.playsThisTurn, 0);
  assert.deepEqual(room.playedDefsThisTurn, []);
});

test("killing an Outlaw pays three cards; a Sheriff who kills a Deputy loses everything", () => {
  const { code, room, players } = startTable(5);
  const sheriff = players.find((p) => p.role === "sheriff")!;
  const outlaw = players.find((p) => p.role === "outlaw")!;
  outlaw.hp = 1;
  stackDeck(room, card("beer", "hearts", 2), card("beer", "hearts", 3), card("beer", "hearts", 4));

  shoot(code, room, sheriff, outlaw);
  assert.equal(outlaw.alive, false);
  assert.equal(sheriff.hand.length, 3, "the bounty on an Outlaw is three cards");
});

test("the Sheriff who shoots a Deputy is stripped of hand and equipment", () => {
  const { code, room, players } = startTable(5);
  const sheriff = players.find((p) => p.role === "sheriff")!;
  const deputy = players.find((p) => p.role === "deputy")!;
  deputy.hp = 1;
  hand(sheriff, card("beer", "hearts", 9));

  shoot(code, room, sheriff, deputy);
  assert.equal(deputy.alive, false);
  assert.equal(sheriff.hand.length, 0, "the penalty costs the Sheriff his whole hand");
  assert.equal(sheriff.equipment.length, 0);
});

test("the law wins when every Outlaw and the Renegade are down", () => {
  const { code, room, players } = startTable(4);
  const sheriff = players.find((p) => p.role === "sheriff")!;
  const last = players.filter((p) => p.role === "outlaw" || p.role === "renegade");
  for (const p of last.slice(1)) kill(p);
  last[0].hp = 1;

  shoot(code, room, sheriff, last[0]);
  assert.equal(room.winner, "sheriff");
  assert.equal(room.phase, "result");
});

test("the Outlaws win when the Sheriff falls with company still standing", () => {
  const { code, room, players } = startTable(5);
  const sheriff = players.find((p) => p.role === "sheriff")!;
  const outlaw = players.find((p) => p.role === "outlaw")!;
  sheriff.hp = 1;

  shoot(code, room, outlaw, sheriff);
  assert.equal(room.winner, "outlaws");
});

test("the Renegade wins only as the last one standing", () => {
  const { code, room, players } = startTable(4);
  const renegade = players.find((p) => p.role === "renegade")!;
  const victim = players.find((p) => p.role === "sheriff")!;
  for (const p of players) if (p !== renegade && p !== victim) kill(p);
  victim.hp = 1;

  shoot(code, room, renegade, victim);
  assert.equal(room.winner, "renegade", "sole survivor, so the table is his");
});

test("the Renegade does not win while anybody else is still standing", () => {
  // The seat order decides who the win check looks at first, so the Renegade is put
  // in the leading chair on purpose: a check that reads "is the first survivor the
  // Renegade" instead of "is the Renegade the ONLY survivor" passes without this.
  const { code, room, players } = startTable(4);
  const [first, second, third, fourth] = players;
  first.role = "renegade";
  second.role = "sheriff";
  third.role = "outlaw";
  fourth.role = "outlaw";
  kill(fourth);
  second.hp = 1;

  shoot(code, room, third, second);
  assert.equal(room.winner, "outlaws", "an Outlaw is still alive, so the table is not the Renegade's");
});

// ─── Eight seats, two Renegades ──────────────────────────────────────────────
// Dodge City's 8-player deal is the only one with a second Renegade, and the win
// check was written when there could only ever be one. It reads every Renegade with
// .every(), so it is already right — these tests are here to keep it that way, since
// nothing else on the table would notice if it stopped being right.
//
// Seats come out in the canonical order roleSetupFor(8) gives:
//   0 sheriff · 1-2 deputy · 3-5 outlaw · 6-7 renegade

test("a Renegade takes an eight-seat table only as the last one standing", () => {
  const { code, room, players } = startTable(8);
  const [sheriff] = players;
  const renegade = players[6];
  for (const p of players) if (p !== sheriff && p !== renegade) kill(p);
  sheriff.hp = 1;

  shoot(code, room, renegade, sheriff);
  assert.equal(room.winner, "renegade", "the other Renegade is down, so he stands alone");
});

test("two Renegades still standing means nobody has won yet", () => {
  const { code, room, players } = startTable(8);
  const lastOutlaw = players[5];
  kill(players[3]);
  kill(players[4]);
  lastOutlaw.hp = 1;

  shoot(code, room, players[2], lastOutlaw); // deputy, one seat away once 3 and 4 are down
  assert.equal(room.winner, null, "every Outlaw is down but both Renegades are not");
  assert.equal(room.phase, "playing");
});

test("the law needs BOTH Renegades down, not just one", () => {
  const { code, room, players } = startTable(8);
  const sheriff = players[0];
  for (const seat of [3, 4, 5, 7]) kill(players[seat]);
  players[6].hp = 1;

  shoot(code, room, sheriff, players[6]);
  assert.equal(room.winner, "sheriff");
  assert.equal(room.phase, "result");
});

test("the Outlaws take the table when the Sheriff falls, even with none of them left alive", () => {
  // Luật gốc, và nó phản trực giác đủ để ai đó "sửa" nhầm: phe Outlaw thắng khi Sheriff
  // chết, kể cả khi outlaw cuối cùng đã nằm xuống từ lâu. Renegade chỉ thắng khi là
  // người sống CUỐI CÙNG — hai renegade còn sống thì chưa ai là người cuối cùng cả.
  const { code, room, players } = startTable(8);
  const sheriff = players[0];
  for (const seat of [3, 4, 5]) kill(players[seat]);
  sheriff.hp = 1;

  shoot(code, room, players[7], sheriff);
  assert.equal(room.winner, "outlaws");
  assert.ok(players[6].alive && players[7].alive, "and both Renegades were standing when it ended");
});

test("surrendering takes a player out of the game like a death", () => {
  const { code, room, players } = startTable(5);
  const [a, b] = players;
  turnTo(room, a);
  assert.ok(game.surrender(code, b.id).ok);
  assert.equal(b.alive, false);
  assert.equal(b.hand.length, 0);
});

test("restart empties the table back into the lobby", () => {
  const { code, room, players } = startTable(4);
  hand(players[0], card("bang", "clubs", 2));
  assert.ok(game.restart(code));
  assert.equal(room.phase, "lobby");
  assert.equal(room.winner, null);
  assert.ok(room.players.every((p) => p.hand.length === 0));
});

test("a dead player flips for the right to rise, and lies back down after the turn", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  turnTo(room, a);
  kill(b);
  // The first flip after dying needs a Heart; anything else leaves them in the ground.
  stackDeck(room, card("beer", "hearts", 6));

  game.endTurn(code, a.id);
  assert.equal(room.players[room.turnIndex], b, "the ghost gets its turn");
  assert.equal(b.ghost, true);
  assert.equal(b.alive, false, "risen is not the same as alive — every win check still counts them dead");
});

test("a ghost that flips wrong is passed over", () => {
  const { code, room, players } = startTable(4);
  const [a, b, c] = players;
  turnTo(room, a);
  kill(b);
  stackDeck(room, card("bang", "clubs", 6)); // a Club: the door stays shut

  game.endTurn(code, a.id);
  assert.equal(b.ghost, false);
  assert.equal(room.players[room.turnIndex], c);
});
