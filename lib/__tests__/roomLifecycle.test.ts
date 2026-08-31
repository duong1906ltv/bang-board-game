// Room lifecycle and the room browser the home page reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as game from "../game";
import { MAX_PLAYERS } from "../types";
import { sock } from "./helpers/table";

// The engine keeps one module-level Map of rooms for the life of the process, so
// every test in this file shares it. Assertions scope themselves to the codes they
// created rather than to the size of the list.
const listing = (...codes: string[]) =>
  game.listLobbies().filter((l) => codes.includes(l.code));

test("a room is listed unless it was opened as private", () => {
  const open = game.createRoom("An", sock()).room;
  const priv = game.createRoom("Riêng", sock(), true).room;
  const seen = listing(open.code, priv.code).map((l) => l.code);
  assert.deepEqual(seen, [open.code]);
});

test("the fullest lobby sorts first, because that is the one about to start", () => {
  const small = game.createRoom("A", sock()).room;
  const big = game.createRoom("B", sock()).room;
  game.addPlayer(big.code, "B2", sock());
  assert.deepEqual(
    listing(small.code, big.code).map((l) => l.code),
    [big.code, small.code]
  );
});

test("a listing carries the players' names and counts bots apart", () => {
  const room = game.createRoom("An", sock()).room;
  game.addPlayer(room.code, "Minh", sock());
  game.addBot(room.code);
  const view = listing(room.code)[0];
  assert.deepEqual(view.players, ["An", "Minh"]);
  assert.equal(view.bots, 1);
  assert.equal(view.max, MAX_PLAYERS);
});

test("a game in progress leaves the browser", () => {
  const room = game.createRoom("An", sock()).room;
  for (let i = 1; i < 4; i++) game.addPlayer(room.code, `P${i}`, sock());
  assert.equal(listing(room.code).length, 1);
  assert.ok(game.startGame(room.code).ok);
  assert.equal(listing(room.code).length, 0);
});

test("a started room refuses newcomers", () => {
  const room = game.createRoom("An", sock()).room;
  for (let i = 1; i < 4; i++) game.addPlayer(room.code, `P${i}`, sock());
  game.startGame(room.code);
  const res = game.addPlayer(room.code, "Late", sock());
  assert.equal(res.ok, false);
  assert.equal(res.error?.code, "game-in-progress");
});

test("a room full of people refuses newcomers", () => {
  const room = game.createRoom("An", sock()).room;
  for (let i = 1; i < MAX_PLAYERS; i++) game.addPlayer(room.code, `P${i}`, sock());
  const res = game.addPlayer(room.code, "Late", sock());
  assert.equal(res.ok, false);
  assert.equal(res.error?.code, "room-full");
});

test("a human takes a bot's chair, and takes it in place", () => {
  const room = game.createRoom("An", sock()).room;
  game.addPlayer(room.code, "Minh", sock());
  while (room.players.length < MAX_PLAYERS) game.addBot(room.code);

  const res = game.addPlayer(room.code, "Chen", sock());
  assert.equal(res.ok, true);
  assert.equal(room.players.length, MAX_PLAYERS, "the table does not grow past its cap");
  // Seat order IS the distance metric, so the arrival must replace the bot rather
  // than be appended — a push would move everyone else's range calculations.
  assert.equal(room.players.findIndex((p) => p.name === "Chen"), 2);
});

test("with no bot left to displace, a full room refuses again", () => {
  const room = game.createRoom("An", sock()).room;
  game.addBot(room.code);
  while (room.players.length < MAX_PLAYERS) game.addPlayer(room.code, "H", sock());
  game.addPlayer(room.code, "Takes the bot", sock());
  assert.ok(!room.players.some((p) => p.isBot));
  assert.equal(game.addPlayer(room.code, "Late", sock()).error?.code, "room-full");
});

test("mySeats offers back a seat of mine that nobody is sitting in", () => {
  const room = game.createRoom("An", sock()).room;
  game.addPlayer(room.code, "Minh", sock());
  const mine = room.players[1];
  mine.connected = false;
  mine.socketId = null;

  const seats = game.mySeats([{ code: room.code, playerId: mine.id }]);
  assert.equal(seats.length, 1);
  assert.equal(seats[0].name, "Minh");
  assert.equal(seats[0].players, 2);
});

test("mySeats never offers a seat somebody is playing from", () => {
  const room = game.createRoom("An", sock()).room;
  const live = room.players[0];
  assert.equal(game.mySeats([{ code: room.code, playerId: live.id }]).length, 0);
});

test("mySeats ignores codes and ids that lead nowhere", () => {
  const room = game.createRoom("An", sock()).room;
  const seats = game.mySeats([
    { code: "ZZZZ", playerId: "x" },
    { code: room.code, playerId: "not-a-player" },
  ]);
  assert.deepEqual(seats, []);
});

test("leaving a lobby removes the seat; the last one out closes the room", () => {
  const host = sock();
  const guest = sock();
  const room = game.createRoom("An", host).room;
  game.addPlayer(room.code, "Minh", guest);
  assert.equal(game.disconnect(guest)?.players.length, 1);
  assert.equal(game.disconnect(host), null, "an empty lobby is reaped");
  assert.equal(game.getRoom(room.code), undefined);
});

test("the host title passes to a real player, not to a bot", () => {
  const founder = sock();
  const room = game.createRoom("An", founder).room;
  game.addPlayer(room.code, "Minh", sock());
  game.addBot(room.code);
  game.disconnect(founder);
  const host = room.players.find((p) => p.isHost)!;
  assert.equal(host.name, "Minh");
  assert.equal(room.hostId, host.id);
});

test("who may start: the host always, anyone seated in a public room, host only in a private one", () => {
  const open = game.createRoom("An", sock()).room;
  game.addPlayer(open.code, "Minh", sock());
  assert.ok(game.mayStart(open, open.players[0]));
  assert.ok(game.mayStart(open, open.players[1]), "a public room is nobody's property");

  const priv = game.createRoom("An", sock(), true).room;
  game.addPlayer(priv.code, "Minh", sock());
  assert.ok(game.mayStart(priv, priv.players[0]));
  assert.ok(!game.mayStart(priv, priv.players[1]), "a private room starts when its host says");
});

test("role distribution is fixed per headcount", () => {
  const flat = (n: number) =>
    game.roleSetupFor(n).flatMap(({ role, count }) => Array(count).fill(role));
  assert.deepEqual(flat(4), ["sheriff", "outlaw", "outlaw", "renegade"]);
  assert.deepEqual(flat(5), ["sheriff", "deputy", "outlaw", "outlaw", "renegade"]);
  assert.deepEqual(flat(6), ["sheriff", "deputy", "outlaw", "outlaw", "outlaw", "renegade"]);
  assert.deepEqual(flat(7), ["sheriff", "deputy", "deputy", "outlaw", "outlaw", "outlaw", "renegade"]);
  assert.deepEqual(game.roleSetupFor(3), [], "outside 4–7 there is no legal deal");
  assert.deepEqual(game.roleSetupFor(8), []);
});

test("a game needs four to eight seats", () => {
  const room = game.createRoom("An", sock()).room;
  game.addPlayer(room.code, "B", sock());
  assert.equal(game.startGame(room.code).error?.code, "need-players");
});
