// 11 nhân vật Dodge City. Mỗi người phải chạm đúng một checkpoint trong engine, và
// checkpoint đó là chỗ duy nhất được biết tới họ — không nhân vật nào được sinh ra một
// nhánh `if (character.id === ...)`.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as bot from "../bot";
import * as game from "../game";
import { DRAFT_PER_PLAYER } from "../game";
import { charAbility } from "../i18n";
import { CHARACTERS, MAX_PLAYERS } from "../types";
import type { Suit } from "../cards";
import { card, equip, hand, kill, setCharacter, sock, stackDeck, startTable, turnTo } from "./helpers/table";

const dodgeCityIds = new Set(
  CHARACTERS.filter((c) => c.set === "dodgeCity").map((c) => c.id),
);

test("cả 15 nhân vật Dodge City đều có trong pool", () => {
  assert.equal(dodgeCityIds.size, 15);
  assert.equal(CHARACTERS.filter((c) => c.set === "base").length, 16);
  assert.equal(CHARACTERS.length, 31);
});

test("a base-game room never deals a Dodge City character", () => {
  // Bốc ngẫu nhiên, nên một phòng lẻ có thể tình cờ toàn người cũ. Mở nhiều phòng:
  // 8 lá rút từ 27 người mà không dính ai mới chỉ có xác suất ~0.6%, nên 40 phòng
  // liên tiếp sạch bong thì bộ lọc thật sự có làm việc chứ không phải may.
  for (let i = 0; i < 40; i++) {
    const { room } = game.createRoom("P0", sock());
    for (let j = 1; j < 4; j++) game.addPlayer(room.code, `P${j}`, sock());
    assert.equal(room.dodgeCityOn, false);
    assert.ok(game.startGame(room.code).ok);

    for (const p of room.players) {
      for (const c of p.draftChoices) {
        assert.ok(!dodgeCityIds.has(c.id), `${c.name} lọt vào bàn chơi bộ gốc`);
      }
    }
  }
});

test("a Dodge City room deals from the wider pool", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const { room } = game.createRoom("P0", sock());
    for (let j = 1; j < 4; j++) game.addPlayer(room.code, `P${j}`, sock());
    assert.equal(game.setDodgeCityOn(room.code, true), true);
    assert.ok(game.startGame(room.code).ok);
    for (const p of room.players) for (const c of p.draftChoices) seen.add(c.id);
  }
  // 40 phòng × 8 lựa chọn = 320 lượt bốc từ 27 người; không thấy ai mới thì bộ lọc
  // đang chặn nhầm chiều.
  assert.ok(
    [...dodgeCityIds].some((id) => seen.has(id)),
    "bật toggle rồi mà không nhân vật Dodge City nào được chia",
  );
});

test("the base pool alone still fills the biggest table", () => {
  // startGame chia shuffle(pool).slice(0, n * DRAFT_PER_PLAYER) — pool ngắn hơn thì
  // slice trả về ít lá hơn và người ngồi cuối chỉ còn 1 lựa chọn, LẶNG LẼ. Bàn 8 người
  // chơi bộ gốc cần đúng 16, mà bộ gốc có đúng 16: vừa khít, không dư một ai.
  const base = CHARACTERS.filter((c) => c.set === "base").length;
  assert.ok(
    base >= MAX_PLAYERS * DRAFT_PER_PLAYER,
    `${base} nhân vật bộ gốc cho ${MAX_PLAYERS} chỗ × ${DRAFT_PER_PLAYER} lựa chọn`,
  );
});

// ─── 8 nhân vật một-checkpoint ───────────────────────────────────────────────

// Bắn bằng Schofield vì bộ vai xếp Sheriff đầu bảng nên Outlaw ngồi cách hai ghế.
// `suit` mở ra để thử miễn nhiễm của Apache Kid — mọi test khác không quan tâm.
function shoot(
  code: string,
  room: game.Room,
  from: game.Player,
  at: game.Player,
  suit: Suit = "clubs",
) {
  turnTo(room, from);
  equip(from, card("schofield", "clubs", 11));
  const bang = card("bang", suit, 5);
  from.hand = [bang, ...from.hand];
  return game.playCard(code, from.id, bang.id, at.id);
}

// Bắn cho trúng: bỏ qua cửa Né, và bỏ qua cả cửa Birra lúc hấp hối.
function shootThrough(code: string, room: game.Room, from: game.Player, at: game.Player) {
  assert.ok(shoot(code, room, from, at).ok);
  game.respond(code, at.id, "pass");
  if (room.pending?.kind === "dying") game.respond(code, at.id, "pass");
}

test("Pixie Pete rút 3 lá thay vì 2", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  setCharacter(room, a, "pixie-pete");
  turnTo(room, a);
  room.turnPhase = "draw";
  stackDeck(room, card("bang", "clubs", 2), card("beer", "hearts", 3), card("missed", "spades", 4));

  assert.equal(game.drawCards(code, a.id), true);
  assert.equal(a.hand.length, 3);
});

test("Bill Noface rút 1 lá, cộng 1 cho mỗi vết thương", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  setCharacter(room, a, "bill-noface");
  stackDeck(room, ...Array.from({ length: 6 }, (_, i) => card("bang", "clubs", i + 2)));

  turnTo(room, a);
  room.turnPhase = "draw";
  assert.equal(game.drawCards(code, a.id), true);
  assert.equal(a.hand.length, 1, "đầy máu thì chỉ 1 lá — đó là cái giá của năng lực");

  a.hand = [];
  a.hp = a.maxHp - 2;
  turnTo(room, a);
  room.turnPhase = "draw";
  assert.equal(game.drawCards(code, a.id), true);
  assert.equal(a.hand.length, 3, "2 vết thương → 1 + 2");
});

test("Sean Mallory giữ tới 10 lá bất kể còn bao nhiêu máu", () => {
  const { room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, a, "sean-mallory");
  a.hp = 1;
  assert.equal(game.handLimitOf(room, a), 10, "trần phẳng, không theo máu");
  assert.equal(game.handLimitOf(room, b), b.hp, "người thường vẫn một lá mỗi máu");
});

test("Tequila Joe hồi 2 máu mỗi Birra uống chủ động", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  setCharacter(room, a, "tequila-joe");
  a.hp = a.maxHp - 3;
  turnTo(room, a);
  const beer = card("beer", "hearts", 6);
  hand(a, beer);

  assert.ok(game.playCard(code, a.id, beer.id).ok);
  assert.equal(a.hp, a.maxHp - 1, "hồi 2 chứ không phải 1");
});

test("Tequila Joe cũng hồi 2 khi uống lúc hấp hối, nên cần ít chai hơn", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, b, "tequila-joe");
  b.hp = 1;
  hand(b, card("beer", "hearts", 6));

  assert.ok(shoot(code, room, a, b).ok);
  game.respond(code, b.id, "pass"); // không né
  assert.equal(room.pending?.kind, "dying");
  assert.ok(game.respond(code, b.id, "beer", b.hand[0].id).ok);

  assert.equal(b.alive, true);
  assert.equal(b.hp, 2, "một chai kéo anh ta lên 2, người thường chỉ lên 1");
  assert.equal(room.pending, null, "và cửa hấp hối đóng luôn, không đòi thêm chai");
});

test("Greg Digger hồi 2 máu mỗi khi có người chết", () => {
  const { code, room, players } = startTable(5);
  const [a, b, c] = players;
  setCharacter(room, c, "greg-digger");
  c.hp = 1;
  b.hp = 1;

  shootThrough(code, room, a, b);
  assert.equal(b.alive, false);
  assert.equal(c.hp, 3, "1 + 2");
});

test("Herb Hunter rút 2 lá mỗi khi có người chết", () => {
  const { code, room, players } = startTable(5);
  const [a, b, c] = players;
  setCharacter(room, c, "herb-hunter");
  b.hp = 1;
  stackDeck(room, card("beer", "hearts", 3), card("missed", "spades", 4));

  shootThrough(code, room, a, b);
  assert.equal(b.alive, false);
  assert.equal(c.hand.length, 2);
});

test("Elena Fuente đỡ Bang! bằng lá bất kỳ", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, b, "elena-fuente");
  const beer = card("beer", "hearts", 6);
  hand(b, beer);

  assert.ok(shoot(code, room, a, b).ok);
  const before = b.hp;
  assert.ok(game.respond(code, b.id, "missed", beer.id).ok, "một chai Birra cũng là Né");
  assert.equal(b.hp, before, "và cô ấy không dính đòn");
});

test("nhưng Elena Fuente KHÔNG biến lá bất kỳ thành Bang!", () => {
  // anyAsMissed chỉ một chiều. Duel đòi Bang! thật, và đó là chỗ dễ lẫn nhất.
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, b, "elena-fuente");
  turnTo(room, a);
  const duel = card("duel", "spades", 7);
  hand(a, duel);
  const beer = card("beer", "hearts", 6);
  hand(b, beer);

  assert.ok(game.playCard(code, a.id, duel.id, b.id).ok);
  assert.equal(room.pending?.kind, "duel");
  assert.equal(game.respond(code, b.id, "bang", beer.id).ok, false, "Birra không phải Bang!");
});

test("Apache Kid miễn nhiễm bài Rô của NGƯỜI KHÁC", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, b, "apache-kid");

  const blocked = shoot(code, room, a, b, "diamonds");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error?.code, "immune-suit");
  // Đọc qua biến: assert.equal(x, null) thu hẹp kiểu của x xuống null cho tới hết hàm,
  // nên đọc thẳng room.pending lần sau sẽ không compile.
  assert.equal(room.pending === null, true, "và không có cửa phản ứng nào mở ra");

  const lands = shoot(code, room, a, b, "clubs");
  assert.ok(lands.ok, "chất khác thì vẫn trúng như thường");
  assert.equal(room.pending?.kind, "bang");
});

test("Apache Kid vẫn dính Dynamite Rô — đó không phải bài ai đánh vào anh ta", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, b, "apache-kid");
  equip(b, card("dynamite", "diamonds", 5));
  stackDeck(room, card("bang", "spades", 5)); // lá lật quyết định, ♠5 là nổ
  const before = b.hp;

  turnTo(room, a);
  a.hand = [];
  game.endTurn(code, a.id);
  assert.equal(b.hp, before - 3, "miễn nhiễm là với lá NGƯỜI KHÁC đánh, không phải mọi lá Rô");
});

test("crosshair theo từng lá, không theo tên bài", () => {
  // Hai lá Bang! khác chất trên cùng bàn tay có mục tiêu hợp lệ khác nhau khi trên bàn
  // có Apache Kid. legalTargets khoá theo defId thì hai lá đó dùng chung một câu trả lời
  // và một trong hai chắc chắn sai.
  const { room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, b, "apache-kid");
  turnTo(room, a);
  equip(a, card("schofield", "clubs", 11));
  const red = card("bang", "diamonds", 5);
  const black = card("bang", "clubs", 5);
  hand(a, red, black);

  const targets = game.viewFor(room, a.id).you.legalTargets;
  assert.ok(!targets[red.id]?.includes(b.id), "Bang! Rô không ngắm được Apache Kid");
  assert.ok(targets[black.id]?.includes(b.id), "Bang! Chuồn thì có");
});

// ─── 3 nút năng lực ──────────────────────────────────────────────────────────

test("Chuck Wengam trả 1 máu lấy 2 lá, và làm được nhiều lần trong một lượt", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  setCharacter(room, a, "chuck-wengam");
  turnTo(room, a);
  stackDeck(room, ...Array.from({ length: 6 }, (_, i) => card("bang", "clubs", i + 2)));
  const full = a.hp;

  assert.ok(game.useAbility(code, a.id, "lose-life-to-draw").ok);
  assert.equal(a.hp, full - 1);
  assert.equal(a.hand.length, 2);

  assert.ok(game.useAbility(code, a.id, "lose-life-to-draw").ok, "không giới hạn số lần");
  assert.equal(a.hp, full - 2);
  assert.equal(a.hand.length, 4);
});

test("Chuck Wengam không tự sát được ở 1 máu", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  setCharacter(room, a, "chuck-wengam");
  a.hp = 1;
  turnTo(room, a);

  const res = game.useAbility(code, a.id, "lose-life-to-draw");
  assert.equal(res.ok, false);
  assert.equal(res.error?.code, "ability-unavailable");
  assert.equal(a.alive, true);
  assert.equal(a.hp, 1);
  assert.ok(
    !game.viewFor(room, a.id).you.abilities.includes("lose-life-to-draw"),
    "và nút cũng không sáng — client không được mời làm điều server sẽ từ chối",
  );
});

test("Doc Holyday bỏ 2 lá bắn 1 Bang!, 1 lần mỗi lượt", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, a, "doc-holyday");
  turnTo(room, a);
  equip(a, card("schofield", "clubs", 11));
  const [x, y, z] = [card("beer", "hearts", 6), card("beer", "hearts", 7), card("beer", "hearts", 8)];
  hand(a, x, y, z);

  assert.ok(game.useAbility(code, a.id, "burn-two-to-shoot", { cardIds: [x.id, y.id], targetId: b.id }).ok);
  assert.equal(room.pending?.kind, "bang", "cửa phản ứng mở ra như một Bang! thật");
  assert.equal(a.hand.length, 1, "hai lá đã đi");

  game.respond(code, b.id, "pass");
  const again = game.useAbility(code, a.id, "burn-two-to-shoot", { cardIds: [z.id, z.id], targetId: b.id });
  assert.equal(again.error?.code, "ability-used-up", "hết lượt dùng");
});

test("Doc Holyday bắn được cả khi đã tiêu hết hạn mức Bang! trong lượt", () => {
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, a, "doc-holyday");
  turnTo(room, a);
  equip(a, card("schofield", "clubs", 11));
  const bang = card("bang", "clubs", 5);
  const [x, y] = [card("beer", "hearts", 6), card("beer", "hearts", 7)];
  hand(a, bang, x, y);

  assert.ok(game.playCard(code, a.id, bang.id, b.id).ok);
  game.respond(code, b.id, "pass");
  assert.equal(room.bangsThisTurn, 1);
  assert.equal(game.bangBudget(room, a), 0, "hạn mức đã hết");

  assert.ok(game.useAbility(code, a.id, "burn-two-to-shoot", { cardIds: [x.id, y.id], targetId: b.id }).ok);
  assert.equal(room.bangsThisTurn, 1, "và phát này KHÔNG tính vào hạn mức");
});

test("José Delgado đốt lá xanh lấy 2 lá, 2 lần mỗi lượt — súng cũng tính là xanh", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  setCharacter(room, a, "jose-delgado");
  turnTo(room, a);
  stackDeck(room, ...Array.from({ length: 8 }, (_, i) => card("bang", "clubs", i + 2)));
  const barrel = card("barrel", "clubs", 1);
  const gun = card("winchester", "spades", 8);
  const brown = card("beer", "hearts", 6);
  hand(a, barrel, gun, brown);

  assert.ok(game.useAbility(code, a.id, "burn-blue-to-draw", { cardIds: [barrel.id] }).ok);
  assert.ok(game.useAbility(code, a.id, "burn-blue-to-draw", { cardIds: [gun.id] }).ok, "súng in viền xanh ở bản gốc");

  const third = game.useAbility(code, a.id, "burn-blue-to-draw", { cardIds: [brown.id] });
  assert.equal(third.error?.code, "ability-used-up", "hạn mức chặn trước, chất bài chặn sau");
});

test("José Delgado không đốt được lá nâu", () => {
  const { code, room, players } = startTable(4);
  const [a] = players;
  setCharacter(room, a, "jose-delgado");
  turnTo(room, a);
  const brown = card("beer", "hearts", 6);
  const barrel = card("barrel", "clubs", 1);
  hand(a, brown, barrel);

  const res = game.useAbility(code, a.id, "burn-blue-to-draw", { cardIds: [brown.id] });
  assert.equal(res.error?.code, "need-a-blue-card");
  assert.equal(a.hand.length, 2, "và không lá nào rời tay");
});

test("nút năng lực chỉ sáng khi engine thật sự nhận — không có cuốn luật thứ hai", () => {
  const { room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, a, "jose-delgado");
  turnTo(room, a);
  hand(a, card("beer", "hearts", 6));

  assert.ok(
    !game.viewFor(room, a.id).you.abilities.includes("burn-blue-to-draw"),
    "trên tay không có lá xanh nào thì nút tắt",
  );
  hand(a, card("barrel", "clubs", 1));
  assert.ok(game.viewFor(room, a.id).you.abilities.includes("burn-blue-to-draw"));

  turnTo(room, b);
  assert.ok(
    !game.viewFor(room, a.id).you.abilities.includes("burn-blue-to-draw"),
    "và tắt luôn khi không phải lượt anh ta",
  );
});

test("Sid Ketchum vẫn uống được ngoài lượt mình, kể cả lúc hấp hối", () => {
  // Đường cũ đi qua sidHeal(); giờ đi qua useAbility. Cái khác biệt của Sid — không bị
  // cửa lượt chặn — là thứ dễ mất nhất khi gộp bốn năng lực vào một hàm.
  const { code, room, players } = startTable(4);
  const [a, b] = players;
  setCharacter(room, b, "sid-ketchum");
  b.hp = 1;
  const [x, y] = [card("beer", "hearts", 6), card("beer", "hearts", 7)];
  hand(b, x, y);

  assert.ok(shoot(code, room, a, b).ok);
  game.respond(code, b.id, "pass");
  assert.equal(room.pending?.kind, "dying");
  assert.ok(
    game.viewFor(room, b.id).you.abilities.includes("burn-two-to-heal"),
    "nút sáng ngay trong lượt người khác, giữa cửa hấp hối",
  );

  assert.ok(game.useAbility(code, b.id, "burn-two-to-heal", { cardIds: [x.id, y.id] }).ok);
  assert.equal(b.alive, true);
  assert.equal(b.hp, 1);
  assert.equal(room.pending, null, "cửa hấp hối đóng lại vì anh ta đã đứng dậy");
});

test("mọi nhân vật đều có mô tả năng lực ở cả hai ngôn ngữ", () => {
  // Thiếu dòng i18n không lỗi gì — panel nhân vật chỉ hiện một khoảng trắng, và không ai
  // biết người đó làm được gì. Đúng thứ trôi đi khi thêm nhân vật mới.
  for (const c of CHARACTERS) {
    for (const locale of ["vi", "en"] as const) {
      assert.ok(charAbility(locale, c.id).length > 0, `${c.id} thiếu mô tả ${locale}`);
    }
  }
});

test("bot không tự treo bàn khi trên bàn có Apache Kid", () => {
  // Hồi quy của một lỗi sim bắt được, không phải test giả định: bot lọc nước đi qua
  // playBlock, mà playBlock KHÔNG kiểm mục tiêu. Nó chọn Bang! ♦ nhắm Apache Kid, engine
  // từ chối, step() trả false — và vì không chỗ nào trong game có timeout, bàn đứng vĩnh
  // viễn. 19/200 ván đóng băng trước khi bot chuyển sang ngắm bằng legalTargetIds.
  const { room, players } = startTable(4);
  const [a, b] = players;
  for (const p of players) p.isBot = true;
  setCharacter(room, b, "apache-kid");
  // Chỉ b là địch còn sống, và trên tay a chỉ có Bang! chất Rô.
  for (const p of players.slice(2)) kill(p);
  turnTo(room, a);
  equip(a, card("schofield", "clubs", 11));
  hand(a, card("bang", "diamonds", 5));

  assert.equal(game.legalTargetIds(room, a, "bang", a.hand[0]).includes(b.id), false);
  assert.equal(bot.step(room.code), true, "bot phải tìm được nước khác, không được kẹt");
  assert.equal(b.hp, b.maxHp, "và Apache Kid không dính phát nào");
});
