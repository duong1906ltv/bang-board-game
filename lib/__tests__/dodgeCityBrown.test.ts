// 7 lá nâu Dodge City. Năm trong số đó chỉ là MỘT cơ chế — "bỏ thêm 1 lá trên tay" —
// nên phần lớn test ở đây là về cơ chế đó, không phải về từng lá.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as game from "../game";
import { card, equip, hand, kill, setCharacter, startTable, turnTo } from "./helpers/table";

// Bắn bằng Schofield vì bộ vai xếp Sheriff đầu bảng nên Outlaw ngồi cách hai ghế.
function armed(p: game.Player) {
  equip(p, card("schofield", "clubs", 11));
}

test("lá phải trả giá bị từ chối khi trên tay chỉ còn đúng nó", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  turnTo(room, a);
  a.hp = a.maxHp - 2;
  const whisky = card("whisky", "hearts", 12);
  hand(a, whisky);

  const res = game.playCard(code, a.id, whisky.id, undefined, undefined, []);
  assert.equal(res.ok, false);
  assert.equal(res.error?.code, "need-cards-to-pay");
  assert.equal(a.hand.length, 1, "và lá vẫn nằm nguyên trên tay");
  assert.ok(
    game.viewFor(room, a.id).you.blockedDefIds.includes("whisky"),
    "client cũng thấy nó bị chặn, không mời người chơi bấm vào chỗ sẽ bị từ chối",
  );
});

test("lá đang đánh không trả giá cho chính nó", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  turnTo(room, a);
  a.hp = a.maxHp - 2;
  const whisky = card("whisky", "hearts", 12);
  hand(a, whisky, card("bang", "clubs", 5));

  const res = game.playCard(code, a.id, whisky.id, undefined, undefined, [whisky.id]);
  assert.equal(res.ok, false);
  assert.equal(res.error?.code, "pay-cards-invalid");
  assert.equal(a.hand.length, 2, "không lá nào rời tay");
});

test("giá không bị tiêu khi nước đi bị từ chối", () => {
  // Thứ tự là toàn bộ vấn đề: trả giá rồi mới phát hiện mục tiêu sai thì người chơi mất
  // hai lá mà chẳng được gì, và không có đường hoàn.
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  turnTo(room, a);
  b.hp = b.maxHp; // Tequila lên người đầy máu là nước phí
  const tequila = card("tequila", "clubs", 9);
  const pay = card("bang", "clubs", 5);
  hand(a, tequila, pay);

  const res = game.playCard(code, a.id, tequila.id, b.id, undefined, [pay.id]);
  assert.equal(res.ok, false);
  assert.equal(a.hand.length, 2, "cả lá đánh lẫn lá trả giá đều còn nguyên");
});

test("Whisky: bỏ thêm 1 lá, hồi 2 máu", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  turnTo(room, a);
  a.hp = a.maxHp - 3;
  const whisky = card("whisky", "hearts", 12);
  const pay = card("bang", "clubs", 5);
  hand(a, whisky, pay);

  assert.ok(game.playCard(code, a.id, whisky.id, undefined, undefined, [pay.id]).ok);
  assert.equal(a.hp, a.maxHp - 1);
  assert.equal(a.hand.length, 0, "cả hai lá đều đi");
});

test("Tequila hồi 1 máu cho người khác, mọi khoảng cách", () => {
  const { code, room, players } = startTable(5);
  const [a, , , d] = players; // ghế xa nhất, ngoài tầm mọi khẩu súng mặc định
  turnTo(room, a);
  d.hp = d.maxHp - 2;
  const tequila = card("tequila", "clubs", 9);
  const pay = card("bang", "clubs", 5);
  hand(a, tequila, pay);

  assert.ok(game.playCard(code, a.id, tequila.id, d.id, undefined, [pay.id]).ok);
  assert.equal(d.hp, d.maxHp - 1);
});

test("Rag Time cướp bài ở mọi khoảng cách", () => {
  const { code, room, players } = startTable(5);
  const [a, , , d] = players;
  turnTo(room, a);
  hand(d, card("beer", "hearts", 6));
  const rag = card("rag-time", "hearts", 9);
  const pay = card("bang", "clubs", 5);
  hand(a, rag, pay);

  assert.ok(game.playCard(code, a.id, rag.id, d.id, undefined, [pay.id]).ok);
  assert.equal(room.pending?.kind, "taken", "nạn nhân được xác nhận, y như Panic!");
  assert.ok(game.respond(code, d.id, "pass").ok);
  assert.equal(d.hand.length, 0);
  assert.equal(a.hand.length, 1, "lá cướp được về tay");
});

test("Springfield bắn được người ngoài tầm, nhưng Missed! vẫn chống được", () => {
  const { code, room, players } = startTable(5);
  const [a, , , d] = players;
  turnTo(room, a);
  const spring = card("springfield", "spades", 13);
  const pay = card("beer", "hearts", 6);
  hand(a, spring, pay);
  hand(d, card("missed", "spades", 3));

  assert.equal(game.distanceBetween(room, a, d), 2);
  assert.equal(game.rangeOf(a, room), 1, "tay không, tầm 1 — Bang! thường không với tới");
  assert.ok(game.playCard(code, a.id, spring.id, d.id, undefined, [pay.id]).ok);
  assert.equal(room.pending?.kind, "bang");

  assert.ok(game.respond(code, d.id, "missed", d.hand[0].id).ok);
  assert.equal(d.hp, d.maxHp, "Barrel và Mancato! vẫn ăn được nó");
});

test("Punch chỉ với tới khoảng cách 1, và súng không kéo dài nó", () => {
  const { code, room, players } = startTable(5);
  const [a, b, c] = players;
  turnTo(room, a);
  armed(a); // Schofield tầm 2
  const punch = card("punch", "spades", 10);
  hand(a, punch);

  assert.equal(game.distanceBetween(room, a, c), 2);
  const far = game.playCard(code, a.id, punch.id, c.id);
  assert.equal(far.ok, false, "súng không cộng tầm cho Punch");
  assert.equal(far.error?.code, "panic-needs-distance-1");

  assert.ok(game.playCard(code, a.id, punch.id, b.id).ok);
  assert.equal(room.pending?.kind, "bang");
});

test("Punch và Springfield không tiêu hạn mức Bang!/lượt", () => {
  const { code, room, players } = startTable(5);
  const [a, b] = players;
  turnTo(room, a);
  const bang = card("bang", "clubs", 5);
  const punch = card("punch", "spades", 10);
  const spring = card("springfield", "spades", 13);
  const pay = card("beer", "hearts", 6);
  hand(a, bang, punch, spring, pay);

  assert.ok(game.playCard(code, a.id, bang.id, b.id).ok);
  game.respond(code, b.id, "pass");
  assert.equal(game.bangBudget(room, a), 0, "hạn mức đã hết");

  assert.ok(game.playCard(code, a.id, punch.id, b.id).ok, "Rule 5: Punch vẫn đánh được");
  game.respond(code, b.id, "pass");
  assert.ok(game.playCard(code, a.id, spring.id, b.id, undefined, [pay.id]).ok, "Springfield cũng vậy");
  assert.equal(room.bangsThisTurn, 1, "bộ đếm không nhúc nhích");
});

test("Dodge tính là Missed! và rút thêm 1 lá", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  turnTo(room, a);
  armed(a);
  const bang = card("bang", "clubs", 5);
  hand(a, bang);
  const dodge = card("dodge", "diamonds", 7);
  hand(b, dodge);
  room.deck = [card("beer", "hearts", 6)];

  assert.ok(game.playCard(code, a.id, bang.id, b.id).ok);
  assert.ok(game.respond(code, b.id, "missed", dodge.id).ok);
  assert.equal(b.hp, b.maxHp, "đỡ được");
  assert.equal(b.hand.length, 1, "và rút lại 1 lá");
  assert.equal(b.hand[0].defId, "beer");
});

test("Slab the Killer: hai lá Dodge đỡ được, và rút về hai lá", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, a, "slab-the-killer");
  turnTo(room, a);
  armed(a);
  const bang = card("bang", "clubs", 5);
  hand(a, bang);
  const [d1, d2] = [card("dodge", "diamonds", 7), card("dodge", "hearts", 13)];
  hand(b, d1, d2);
  room.deck = [card("beer", "hearts", 6), card("beer", "hearts", 7)];

  assert.ok(game.playCard(code, a.id, bang.id, b.id).ok);
  assert.equal(room.pending?.kind === "bang" && room.pending.missedNeeded, 2);
  assert.ok(game.respond(code, b.id, "missed", d1.id).ok);
  assert.ok(game.respond(code, b.id, "missed", d2.id).ok);
  assert.equal(b.hp, b.maxHp);
  assert.equal(b.hand.length, 2, "mỗi lá Dodge rút lại một lá");
});

test("Brawl: mỗi người khác tự chọn lá của mình, tay hoặc bàn", () => {
  const { code, room, players } = startTable(4);
  const [a, b, c, d] = players;
  turnTo(room, a);
  const brawl = card("brawl", "spades", 11);
  const pay = card("bang", "clubs", 5);
  hand(a, brawl, pay);
  const bCard = card("beer", "hearts", 6);
  hand(b, bCard);
  const cGun = card("remington", "diamonds", 6);
  hand(c, card("missed", "spades", 3));
  equip(c, cGun);
  // d tay trắng bàn trắng — không có gì để bỏ.
  hand(d);
  equip(d);

  assert.ok(game.playCard(code, a.id, brawl.id, undefined, undefined, [pay.id]).ok);
  assert.equal(room.pending?.kind, "toss");
  assert.equal(a.hand.length, 0, "cả lá đánh lẫn lá trả giá đều đi");

  const waiting = () => game.viewFor(room, b.id).pending?.waiting ?? [];
  assert.ok(!waiting().includes(d.name), "người không còn gì được cho qua ngay");

  assert.ok(game.respond(code, b.id, "toss", bCard.id).ok);
  assert.equal(b.hand.length, 0);
  assert.equal(room.pending?.kind, "toss", "vẫn chờ người còn lại");

  // c chọn bỏ đồ TRÊN BÀN thay vì lá trên tay — bản in cho phép cả hai.
  assert.ok(game.respond(code, c.id, "toss", cGun.id).ok);
  assert.equal(c.equipment.length, 0);
  assert.equal(c.hand.length, 1, "lá trên tay của c còn nguyên");
  assert.equal(room.pending, null, "xong hết thì cửa đóng");
});

test("Brawl không mở cửa nào khi cả bàn đều trắng tay", () => {
  const { code, room, players } = startTable(4);
  const [a, b, c, d] = players;
  turnTo(room, a);
  for (const p of [b, c, d]) {
    hand(p);
    equip(p);
  }
  const brawl = card("brawl", "spades", 11);
  const pay = card("bang", "clubs", 5);
  hand(a, brawl, pay);

  assert.ok(game.playCard(code, a.id, brawl.id, undefined, undefined, [pay.id]).ok);
  assert.equal(room.pending, null, "không ai có gì để bỏ, cửa không được phép mở — mở là treo bàn");
});

test("Brawl bỏ qua người đã chết", () => {
  const { code, room, players } = startTable(5);
  const [a, b, c] = players;
  turnTo(room, a);
  kill(c);
  hand(b, card("beer", "hearts", 6));
  const brawl = card("brawl", "spades", 11);
  const pay = card("bang", "clubs", 5);
  hand(a, brawl, pay);

  assert.ok(game.playCard(code, a.id, brawl.id, undefined, undefined, [pay.id]).ok);
  const waitingIds = room.pending?.kind === "toss" ? room.pending.responders.map((r) => r.id) : [];
  assert.ok(!waitingIds.includes(c.id));
});

test("sự kiện cấm hồi máu chặn cả Whisky và Tequila", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  turnTo(room, a);
  a.hp = a.maxHp - 2;
  game.setEventLevel(code, "on");
  room.events = [{ defId: "prohibition", seq: 1, turnsLeft: 9 }];
  const whisky = card("whisky", "hearts", 12);
  const pay = card("bang", "clubs", 5);
  hand(a, whisky, pay);

  const res = game.playCard(code, a.id, whisky.id, undefined, undefined, [pay.id]);
  assert.equal(res.ok, false);
  assert.equal(res.error?.code, "event-forbids-heal");
  assert.equal(a.hand.length, 2, "và giá chưa bị tiêu");
});
