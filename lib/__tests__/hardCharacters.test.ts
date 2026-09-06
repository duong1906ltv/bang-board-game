// 4 nhân vật khó. Không phải một nhóm — bốn việc độc lập tình cờ cùng là "nhân vật", mỗi
// người đụng một chỗ khác nhau trong engine.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as game from "../game";
import { card, equip, hand, setCharacter, stackDeck, startTable, turnTo } from "./helpers/table";

// ─── Pat Brennan ─────────────────────────────────────────────────────────────

test("Pat Brennan lấy 1 lá trên bàn người khác THAY CHO cả phần rút", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, a, "pat-brennan");
  const barrel = card("barrel", "clubs", 1);
  equip(b, barrel);
  stackDeck(room, card("bang", "clubs", 2), card("bang", "clubs", 3));
  turnTo(room, a);
  room.turnPhase = "draw";
  a.hand = [];

  assert.ok(game.drawCards(code, a.id, "equipment", b.id, barrel.id));
  assert.ok(game.respond(code, b.id, "pass").ok);
  assert.equal(a.hand.length, 1, "MỘT lá, không phải một lá rồi rút thêm như Jesse Jones");
  assert.equal(a.hand[0].defId, "barrel");
  assert.equal(b.equipment.length, 0);
  assert.equal(room.turnPhase, "play", "và draw phase đóng lại");
});

test("Pat Brennan vẫn rút nọc bình thường khi cả bàn trống trơn", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  setCharacter(room, a, "pat-brennan");
  for (const p of players) equip(p);
  stackDeck(room, card("bang", "clubs", 2), card("bang", "clubs", 3));
  turnTo(room, a);
  room.turnPhase = "draw";
  a.hand = [];

  assert.equal(game.viewFor(room, a.id).you.legalDrawTargets.length, 0);
  assert.ok(game.drawCards(code, a.id, "deck"));
  assert.equal(a.hand.length, 2);
});

// ─── Molly Stark ─────────────────────────────────────────────────────────────

test("Molly Stark rút 1 lá khi đỡ Bang! ngoài lượt mình", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, b, "molly-stark");
  turnTo(room, a);
  equip(a, card("schofield", "clubs", 11));
  hand(a, card("bang", "clubs", 5));
  hand(b, card("missed", "spades", 3));
  room.deck = [card("beer", "hearts", 6)];

  assert.ok(game.playCard(code, a.id, a.hand[0].id, b.id).ok);
  assert.ok(game.respond(code, b.id, "missed", b.hand[0].id).ok);
  assert.equal(b.hand.length, 1, "tiêu 1 lá Né, rút lại 1 lá");
  assert.equal(b.hand[0].defId, "beer");
});

test("Molly Stark KHÔNG rút khi bị cướp bài — bị lấy không phải chủ động", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, b, "molly-stark");
  turnTo(room, a);
  hand(b, card("missed", "spades", 3));
  const cb = card("cat-balou", "clubs", 8);
  hand(a, cb);
  room.deck = [card("beer", "hearts", 6)];

  assert.ok(game.playCard(code, a.id, cb.id, b.id).ok);
  assert.ok(game.respond(code, b.id, "pass").ok);
  assert.equal(b.hand.length, 0, "mất lá và không được đền gì");
});

test("Molly Stark KHÔNG rút khi bị Brawl ép bỏ — ép cũng không phải chủ động", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, b, "molly-stark");
  turnTo(room, a);
  const target = card("missed", "spades", 3);
  hand(b, target);
  const brawl = card("brawl", "spades", 11);
  const pay = card("bang", "clubs", 5);
  hand(a, brawl, pay);
  room.deck = [card("beer", "hearts", 6)];

  assert.ok(game.playCard(code, a.id, brawl.id, undefined, undefined, [pay.id]).ok);
  assert.ok(game.respond(code, b.id, "toss", target.id).ok);
  assert.equal(b.hand.length, 0);
});

test("Molly Stark KHÔNG rút khi bỏ bài trong chính lượt mình", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  setCharacter(room, a, "molly-stark");
  turnTo(room, a);
  const junk = card("missed", "spades", 3);
  hand(a, junk, card("bang", "clubs", 5));
  a.hp = 1; // giới hạn tay = 1, nên phải bỏ bớt
  room.deck = [card("beer", "hearts", 6)];

  assert.ok(game.discardCard(code, a.id, junk.id));
  assert.equal(a.hand.length, 1, "bỏ 1 lá, không rút lại lá nào");
});

// ─── Belle Star ──────────────────────────────────────────────────────────────

test("Belle Star bắn xuyên Mustang của người khác trong lượt cô ta", () => {
  const { code, room, players } = startTable(5);
  const [a, b] = players;
  setCharacter(room, a, "belle-star");
  equip(b, card("mustang", "hearts", 8));
  turnTo(room, a);

  assert.equal(game.distanceBetween(room, a, b), 1, "Mustang bị vô hiệu");
  hand(a, card("bang", "clubs", 5));
  assert.ok(game.playCard(code, a.id, a.hand[0].id, b.id).ok);
});

test("nhưng Mustang trở lại có tác dụng ngay khi hết lượt cô ta", () => {
  const { room, players } = startTable(5);
  const [a, b, c] = players;
  setCharacter(room, a, "belle-star");
  equip(b, card("mustang", "hearts", 8));

  turnTo(room, a);
  assert.equal(game.distanceBetween(room, a, b), 1);
  turnTo(room, c);
  assert.equal(game.distanceBetween(room, c, b), 2, "ngoài lượt Belle Star thì yên ngựa lại chạy");
});

test("Belle Star vô hiệu Barrel người khác, nhưng KHÔNG vô hiệu nhân vật", () => {
  const { room, players } = startTable(5);
  const [a, b] = players;
  setCharacter(room, a, "belle-star");
  equip(b, card("barrel", "clubs", 1));
  turnTo(room, a);
  assert.equal(game.barrelAttempts(room, b), 0, "lá Barrel trên bàn mất tác dụng");

  // Jourdonnais mang Barrel bẩm sinh — đó là con người ông ta, không phải lá trên bàn.
  setCharacter(room, b, "jourdonnais");
  equip(b);
  assert.equal(game.barrelAttempts(room, b), 1);

  // Paul Regret cũng vậy: khoảng cách +1 của anh ta là người, không phải yên ngựa.
  const [, , c] = players;
  setCharacter(room, c, "paul-regret");
  equip(c);
  assert.equal(game.distanceBetween(room, a, c), 3, "2 ghế + 1 của Paul Regret");
});

test("Belle Star bắn xuyên cả Iron Plate của người khác", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, a, "belle-star");
  // Đặt Iron Plate xuống bàn của b từ lượt trước cho nó chín.
  turnTo(room, b);
  const plate = card("iron-plate", "diamonds", 1);
  hand(b, plate);
  assert.ok(game.playCard(code, b.id, plate.id).ok);
  room.turnCounter += 1;

  turnTo(room, a);
  equip(a, card("schofield", "clubs", 11));
  hand(a, card("bang", "clubs", 5));
  hand(b);
  assert.ok(game.playCard(code, a.id, a.hand[0].id, b.id).ok);
  assert.equal(game.respond(code, b.id, "missed", plate.id).ok, false, "tấm thép nằm đó cho có");
});

// ─── Vera Custer ─────────────────────────────────────────────────────────────

test("Vera Custer mượn năng lực, và phải chọn TRƯỚC khi rút bài", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, a, "vera-custer");
  setCharacter(room, b, "pixie-pete"); // rút 3 thay vì 2
  stackDeck(room, ...Array.from({ length: 5 }, (_, i) => card("bang", "clubs", i + 2)));
  turnTo(room, a);
  room.turnPhase = "draw";
  a.hand = [];
  room.pending = { kind: "copy", playerId: a.id };

  assert.equal(game.drawCards(code, a.id, "deck"), false, "chưa chọn thì chưa rút được");
  assert.ok(game.respond(code, a.id, "pass", b.id).ok);
  assert.equal(room.copiedAbilityFrom, b.id);

  assert.ok(game.drawCards(code, a.id, "deck"));
  assert.equal(a.hand.length, 3, "rút theo kiểu Pixie Pete, không phải 2 lá thường");
});

test("Vera Custer trả lại năng lực khi hết lượt", () => {
  const { room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, a, "vera-custer");
  setCharacter(room, b, "willy-the-kid"); // Bang! không giới hạn
  turnTo(room, a);
  room.copiedAbilityFrom = b.id;
  assert.equal(game.bangBudget(room, a), 99, "trong lượt cô ta thì mượn được");

  turnTo(room, b);
  assert.equal(game.bangBudget(room, a), 1, "ngoài lượt thì trả lại");
});

test("Vera Custer không mượn được chính mình, và không mượn người đã chết", () => {
  const { code, room, players } = startTable(4);
  const [a, , c] = players;
  setCharacter(room, a, "vera-custer");
  turnTo(room, a);
  room.pending = { kind: "copy", playerId: a.id };

  assert.equal(game.respond(code, a.id, "pass", a.id).error?.code, "invalid-target");
  c.alive = false;
  assert.equal(game.respond(code, a.id, "pass", c.id).error?.code, "invalid-target");
  assert.equal(room.pending?.kind, "copy", "cửa vẫn mở, không đóng bằng một lựa chọn sai");
});

test("Vera mượn Vera thì ra năng lực rỗng, không gọi vòng", () => {
  // Trên bàn thật không xảy ra được — pool chỉ có một Vera — nhưng charEffect là hàm cả
  // engine gọi, và một hàm như thế không được phép có đường vòng nào.
  const { room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, a, "vera-custer");
  setCharacter(room, b, "vera-custer");
  turnTo(room, a);
  room.copiedAbilityFrom = b.id;

  assert.deepEqual(game.effectiveEffect(room, a), {});
});
