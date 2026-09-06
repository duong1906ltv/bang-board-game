// 13 lá green. Chúng chia đôi, và đó là chỗ dễ sót nhất của cả bộ mở rộng: 9 lá kích
// hoạt trong lượt mình, 4 lá mang ký hiệu Mancato! và trả lời cửa phản ứng NGOÀI lượt.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as game from "../game";
import type { Card } from "../cards";
import { card, equip, hand, setCharacter, startTable, turnTo } from "./helpers/table";

// Đặt một lá green xuống bàn qua đúng đường người chơi đi, rồi cho qua một lượt để nó
// chín. Không gán thẳng vào equipment: `playedOnTurn` do playCard đặt, và một test tự gán
// tay sẽ bỏ qua đúng cái luật nó định kiểm.
function placeGreen(code: string, room: game.Room, p: game.Player, c: Card) {
  turnTo(room, p);
  p.hand = [c, ...p.hand];
  assert.ok(game.playCard(code, p.id, c.id).ok, `đặt ${c.defId} xuống bàn`);
  return c;
}

function nextTurn(room: game.Room) {
  room.turnCounter += 1;
}

test("green đặt xuống rồi KHÔNG dùng được trong chính lượt đó", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  a.hp = a.maxHp - 1;
  const canteen = placeGreen(code, room, a, card("canteen", "hearts", 7));

  assert.equal(a.equipment.length, 1, "nó nằm trước mặt như lá xanh");
  const res = game.useEquip(code, a.id, canteen.id);
  assert.equal(res.ok, false);
  assert.equal(res.error?.code, "green-not-ready");
  assert.ok(
    !game.viewFor(room, a.id).you.usableGreenIds.includes(canteen.id),
    "và nút của nó cũng không sáng",
  );
});

test("lượt sau thì dùng được, dùng xong lá vào chồng bỏ", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  a.hp = a.maxHp - 1;
  const canteen = placeGreen(code, room, a, card("canteen", "hearts", 7));

  nextTurn(room);
  turnTo(room, a);
  assert.ok(game.viewFor(room, a.id).you.usableGreenIds.includes(canteen.id));
  assert.ok(game.useEquip(code, a.id, canteen.id).ok);
  assert.equal(a.hp, a.maxHp);
  assert.equal(a.equipment.length, 0, "green dùng MỘT lần rồi biến mất, khác lá xanh");
  assert.equal(room.discard.at(-1)?.defId, "canteen");
});

test("green bị cướp rồi đánh lại thì phải chờ lại từ đầu", () => {
  // Đây là lý do playedOnTurn nằm trên INSTANCE lá chứ không phải trên người chơi: một cờ
  // trên người chơi thì lá đổi chủ xong vẫn còn "chín".
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  const knife = placeGreen(code, room, a, card("knife", "hearts", 8));
  nextTurn(room);

  // b cướp nó bằng Cat Balou lên bàn của a, rồi... thực ra Cat Balou bỏ đi. Dùng Panic
  // để nó về tay b.
  turnTo(room, b);
  const panic = card("panic", "hearts", 11);
  hand(b, panic);
  assert.ok(game.playCard(code, b.id, panic.id, a.id, knife.id).ok);
  assert.ok(game.respond(code, a.id, "pass").ok);
  assert.ok(b.hand.some((c) => c.id === knife.id), "lá về tay b");

  // b đánh lại nó xuống bàn mình, trong lượt của b.
  assert.ok(game.playCard(code, b.id, knife.id).ok);
  const res = game.useEquip(code, b.id, knife.id);
  assert.equal(res.error?.code, "green-not-ready", "đếm lại từ đầu, không kế thừa của a");
});

test("Cat Balou cướp được green chưa chín", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  const bible = placeGreen(code, room, a, card("bible", "hearts", 10));

  turnTo(room, b);
  const cb = card("cat-balou", "clubs", 8);
  hand(b, cb);
  assert.ok(game.playCard(code, b.id, cb.id, a.id, bible.id).ok);
  assert.ok(game.respond(code, a.id, "pass").ok);
  assert.equal(a.equipment.length, 0, "green trên bàn là bài trên bàn, cướp như mọi lá khác");
});

// ─── Nhóm kích hoạt trong lượt ───────────────────────────────────────────────

test("Pony Express rút 3 lá, Howitzer bắn cả bàn", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  const pony = placeGreen(code, room, a, card("pony-express", "diamonds", 12));
  room.deck = [card("bang", "clubs", 2), card("bang", "clubs", 3), card("bang", "clubs", 4)];
  nextTurn(room);
  turnTo(room, a);
  a.hand = [];

  assert.ok(game.useEquip(code, a.id, pony.id).ok);
  assert.equal(a.hand.length, 3);

  const howitzer = placeGreen(code, room, a, card("howitzer", "spades", 9));
  nextTurn(room);
  turnTo(room, a);
  assert.ok(game.useEquip(code, a.id, howitzer.id).ok);
  assert.equal(room.pending?.kind, "multi", "giống hệt Gatling");
});

test("Knife với tới khoảng cách 1, Buffalo Rifle với tới mọi khoảng cách", () => {
  const { code, room, players } = startTable(5);
  const [a, b, , d] = players;
  const knife = placeGreen(code, room, a, card("knife", "hearts", 8));
  const buffalo = placeGreen(code, room, a, card("buffalo-rifle", "clubs", 12));
  nextTurn(room);
  turnTo(room, a);

  assert.equal(game.distanceBetween(room, a, d), 2);
  assert.equal(game.useEquip(code, a.id, knife.id, d.id).ok, false, "Knife không với tới");
  assert.ok(game.useEquip(code, a.id, knife.id, b.id).ok);
  assert.equal(room.pending?.kind, "bang");
  game.respond(code, b.id, "pass");

  assert.ok(game.useEquip(code, a.id, buffalo.id, d.id).ok, "Buffalo Rifle thì có");
});

test("Pepperbox bắn trong tầm BÌNH THƯỜNG, không phải vô hạn", () => {
  // Chỗ dễ hiểu nhầm nhất của cả nhóm. Giá trị của nó là không tốn lá Bang! trên tay,
  // không phải với xa hơn.
  const { code, room, players } = startTable(5);
  const [a, b, , d] = players;
  const pepper = placeGreen(code, room, a, card("pepperbox", "hearts", 1));
  nextTurn(room);
  turnTo(room, a);

  assert.equal(game.rangeOf(a, room), 1, "tay không, tầm 1");
  assert.equal(game.useEquip(code, a.id, pepper.id, d.id).ok, false, "khoảng cách 2, ngoài tầm");
  assert.ok(game.useEquip(code, a.id, pepper.id, b.id).ok);

  // Đeo súng vào thì tầm rộng ra, và Pepperbox rộng theo. push chứ không equip(): helper
  // equip() THAY cả hàng trang bị, và làm thế thì nó gạt luôn lá green vừa đặt xuống.
  const pepper2 = placeGreen(code, room, a, card("pepperbox", "hearts", 1));
  a.equipment.push(card("schofield", "clubs", 11));
  nextTurn(room);
  turnTo(room, a);
  assert.equal(game.rangeOf(a, room), 2);
  assert.ok(game.useEquip(code, a.id, pepper2.id, d.id).ok, "Schofield tầm 2 thì với tới");
});

test("Derringer bắn rồi rút 1 lá", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  const derringer = placeGreen(code, room, a, card("derringer", "spades", 7));
  nextTurn(room);
  turnTo(room, a);
  a.hand = [];
  room.deck = [card("beer", "hearts", 6)];

  assert.ok(game.useEquip(code, a.id, derringer.id, b.id).ok);
  assert.equal(room.pending?.kind, "bang");
  assert.equal(a.hand.length, 1, "rút bù ngay, không chờ kết quả cú bắn");
});

test("Conestoga cướp bài, Can Can bắt bỏ bài, cả hai ở mọi khoảng cách", () => {
  const { code, room, players } = startTable(5);
  const [a, , , d] = players;
  const cone = placeGreen(code, room, a, card("conestoga", "diamonds", 9));
  const canCan = placeGreen(code, room, a, card("can-can", "clubs", 11));
  nextTurn(room);
  turnTo(room, a);
  a.hand = [];
  hand(d, card("beer", "hearts", 6), card("bang", "clubs", 5));

  assert.ok(game.useEquip(code, a.id, cone.id, d.id).ok);
  assert.ok(game.respond(code, d.id, "pass").ok);
  assert.equal(a.hand.length, 1, "lá cướp được về tay");
  assert.equal(d.hand.length, 1);

  assert.ok(game.useEquip(code, a.id, canCan.id, d.id).ok);
  assert.ok(game.respond(code, d.id, "pass").ok);
  assert.equal(d.hand.length, 0, "Can Can thì bỏ đi, không về tay ai");
});

test("năm lá green có hiệu ứng Bang! không tiêu hạn mức Bang!/lượt", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  const knife = placeGreen(code, room, a, card("knife", "hearts", 8));
  nextTurn(room);
  turnTo(room, a);
  const bang = card("bang", "clubs", 5);
  hand(a, bang);

  assert.ok(game.playCard(code, a.id, bang.id, b.id).ok);
  game.respond(code, b.id, "pass");
  assert.equal(game.bangBudget(room, a), 0);

  assert.ok(game.useEquip(code, a.id, knife.id, b.id).ok, "Rule 5");
  assert.equal(room.bangsThisTurn, 1, "bộ đếm không nhúc nhích");
});

// ─── Nhóm phản ứng ngoài lượt ────────────────────────────────────────────────

test("Iron Plate đỡ Bang! khi trên tay KHÔNG còn lá nào", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  const plate = placeGreen(code, room, b, card("iron-plate", "diamonds", 1));
  nextTurn(room);
  turnTo(room, a);
  equip(a, card("schofield", "clubs", 11));
  hand(b); // tay trắng
  const bang = card("bang", "clubs", 5);
  hand(a, bang);

  assert.ok(game.playCard(code, a.id, bang.id, b.id).ok);
  assert.ok(game.respond(code, b.id, "missed", plate.id).ok);
  assert.equal(b.hp, b.maxHp);
  assert.equal(b.equipment.length, 0, "dùng xong nó đi");
});

test("Bible đỡ Bang! rồi rút 1 lá", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  const bible = placeGreen(code, room, b, card("bible", "hearts", 10));
  nextTurn(room);
  turnTo(room, a);
  equip(a, card("schofield", "clubs", 11));
  hand(b);
  hand(a, card("bang", "clubs", 5));
  room.deck = [card("beer", "hearts", 6)];

  assert.ok(game.playCard(code, a.id, a.hand[0].id, b.id).ok);
  assert.ok(game.respond(code, b.id, "missed", bible.id).ok);
  assert.equal(b.hp, b.maxHp);
  assert.equal(b.hand.length, 1, "và rút lại 1 lá");
});

test("green mang ký hiệu Mancato! KHÔNG đỡ được khi còn trên tay", () => {
  // Cả thiết kế của loại bài này nằm ở cái giá một lượt chờ. Đỡ được ngay từ tay thì Bible
  // chỉ là một lá Mancato! mạnh hơn, và Rule 4 biến mất.
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  turnTo(room, a);
  equip(a, card("schofield", "clubs", 11));
  const bible = card("bible", "hearts", 10);
  hand(b, bible);
  hand(a, card("bang", "clubs", 5));

  assert.ok(game.playCard(code, a.id, a.hand[0].id, b.id).ok);
  const res = game.respond(code, b.id, "missed", bible.id);
  assert.equal(res.ok, false);
  assert.equal(res.error?.code, "no-valid-card");
  assert.ok(
    !(game.viewFor(room, b.id).pending?.usableCardIds ?? []).includes(bible.id),
    "và client cũng không mời bấm vào nó",
  );
});

test("green chưa chín thì cũng chưa đỡ được", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  const plate = placeGreen(code, room, b, card("iron-plate", "diamonds", 1));
  // KHÔNG nextTurn — b vừa đặt nó xuống trong lượt này.
  turnTo(room, a);
  equip(a, card("schofield", "clubs", 11));
  hand(b);
  hand(a, card("bang", "clubs", 5));

  assert.ok(game.playCard(code, a.id, a.hand[0].id, b.id).ok);
  assert.equal(game.respond(code, b.id, "missed", plate.id).ok, false);
});

test("Slab the Killer: 1 Iron Plate trên bàn + 1 Missed! trên tay là đủ hai lớp", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  const plate = placeGreen(code, room, b, card("iron-plate", "diamonds", 1));
  nextTurn(room);
  setCharacter(room, a, "slab-the-killer");
  turnTo(room, a);
  equip(a, card("schofield", "clubs", 11));
  const missed = card("missed", "spades", 3);
  hand(b, missed);
  hand(a, card("bang", "clubs", 5));

  assert.ok(game.playCard(code, a.id, a.hand[0].id, b.id).ok);
  assert.equal(room.pending?.kind === "bang" && room.pending.missedNeeded, 2);
  // Lá đầu KHÔNG được từ chối vì "không đủ để hoàn thành": phép đếm phải nhìn cả bàn.
  assert.ok(game.respond(code, b.id, "missed", plate.id).ok);
  assert.ok(game.respond(code, b.id, "missed", missed.id).ok);
  assert.equal(b.hp, b.maxHp);
});

test("Elena Fuente không đốt được đồ trên bàn để né", () => {
  // anyAsMissed nói "lá bất kỳ TRÊN TAY". Không siết thì cô ấy bỏ luôn khẩu súng đang đeo.
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, b, "elena-fuente");
  turnTo(room, a);
  equip(a, card("schofield", "clubs", 11));
  const gun = card("remington", "diamonds", 6);
  equip(b, gun);
  hand(b);
  hand(a, card("bang", "clubs", 5));

  assert.ok(game.playCard(code, a.id, a.hand[0].id, b.id).ok);
  assert.equal(game.respond(code, b.id, "missed", gun.id).ok, false);
  assert.equal(b.equipment.length, 1, "khẩu súng còn nguyên");
});
