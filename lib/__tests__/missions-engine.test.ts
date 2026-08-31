// Nhiệm vụ phụ trên bàn thật: MỘT test cho MỖI nhiệm vụ, dựng đúng thế rồi chứng minh nó
// hoàn thành được và trả thưởng đúng.
//
// Đây là câu trả lời dứt điểm cho rủi ro tệ nhất của cả tính năng: một nhiệm vụ ẩn bất khả thi
// là lỗi IM LẶNG — người chơi mất tính năng cả ván và không biết để mà cãi, vì nhiệm vụ là bí
// mật. Thống kê sim không phân biệt được "bất khả thi" với "cần chủ ý" (bot không có chủ ý).
// 13 test tất định thì phân biệt được.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as game from "../game";
import { MISSIONS, MISSION_BY_ID } from "../missions";
import { card, equip, hand, kill, startTable, stackDeck, turnTo, withMission, type Table } from "./helpers/table";

// Bàn sẵn sàng: một ghế giữ nhiệm vụ cần thử, deck có bài để trả thưởng.
function forMission(missionId: string, n = 4): { t: Table; me: game.Player } {
  const t = startTable(n);
  const me = t.sheriff;
  withMission(t.room, me, missionId);
  stackDeck(t.room, ...Array.from({ length: 6 }, (_, i) => card("beer", "hearts", ((i % 9) + 2) as number)));
  turnTo(t.room, me);
  return { t, me };
}

const doneWithReward = (t: Table, me: game.Player, missionId: string) => {
  assert.equal(me.missionDone, true, `${missionId}: phải hoàn thành`);
  const r = t.room.missionFeed.find((x) => x.playerId === me.id && x.missionId === missionId);
  assert.ok(r, `${missionId}: phải có màn lộ trong missionFeed`);
  const def = MISSION_BY_ID[missionId];
  const paid = (r!.cards ?? 0) + (r!.hp ?? 0);
  assert.ok(paid > 0, `${missionId}: phải trả thưởng thật, nhận được ${paid}`);
  assert.ok((def.reward.cards ?? 0) + (def.reward.hp ?? 0) >= paid, `${missionId}: không trả quá mức`);
};

test("13 nhiệm vụ, và mỗi cái đều có một test riêng ở file này", () => {
  // Lưới chống việc thêm nhiệm vụ mà quên chứng minh nó khả thi.
  assert.equal(MISSIONS.length, 13);
});

test("all-in — kết thúc lượt với tay trắng", () => {
  const { t, me } = forMission("all-in");
  me.hand = [];
  game.endTurn(t.code, me.id);
  doneWithReward(t, me, "all-in");
});

test("no-shield — chịu trúng Bang! khi tay đang có Missed!", () => {
  const { t, me } = forMission("no-shield");
  const shooter = t.room.players.find((p) => p !== me)!;
  hand(me, card("missed", "hearts", 6)); // có lưới mà không dùng
  turnTo(t.room, shooter);
  hand(shooter, card("bang", "spades", 5));
  game.playCard(t.code, shooter.id, shooter.hand[0].id, me.id);
  game.respond(t.code, me.id, "pass"); // cố ý ăn đòn
  doneWithReward(t, me, "no-shield");
});

test("throw-it-away — tự bỏ Missed! khi chưa quá giới hạn tay", () => {
  const { t, me } = forMission("throw-it-away");
  hand(me, card("missed", "hearts", 6));
  assert.ok(me.hand.length <= game.handLimitOf(t.room, me), "phải chưa quá giới hạn");
  game.discardCard(t.code, me.id, me.hand[0].id);
  doneWithReward(t, me, "throw-it-away");
});

test("reckless — Gatling lúc đang 1 HP", () => {
  const { t, me } = forMission("reckless");
  me.hp = 1;
  hand(me, card("gatling", "spades", 10));
  game.playCard(t.code, me.id, me.hand[0].id);
  for (const p of t.room.players) if (p !== me && p.alive) game.respond(t.code, p.id, "pass");
  doneWithReward(t, me, "reckless");
});

test("no-cover — kết thúc lượt ở ≤2 HP, không che trên bàn, mà tay đang giữ che", () => {
  const { t, me } = forMission("no-cover");
  me.hp = 2;
  me.equipment = [];
  hand(me, card("barrel", "hearts", 6), card("bang", "spades", 5));
  game.endTurn(t.code, me.id);
  doneWithReward(t, me, "no-cover");
});

test("mercy — bỏ trọn một lượt khi tay có ≥3 lá", () => {
  const { t, me } = forMission("mercy");
  hand(me, card("bang", "spades", 5), card("beer", "hearts", 6), card("missed", "hearts", 7));
  game.endTurn(t.code, me.id); // không đánh gì
  doneWithReward(t, me, "mercy");
});

test("last-bullet — Bang! là lá cuối cùng trên tay", () => {
  const { t, me } = forMission("last-bullet");
  const victim = t.room.players.find((p) => p !== me)!;
  hand(me, card("bang", "spades", 5));
  game.playCard(t.code, me.id, me.hand[0].id, victim.id);
  doneWithReward(t, me, "last-bullet");
});

test("spendthrift — 4 lá trong cùng một lượt", () => {
  const { t, me } = forMission("spendthrift");
  me.hp = 2; // để Beer đánh được (playBeer từ chối khi đủ máu)
  hand(
    me,
    card("bang", "spades", 5),
    card("beer", "hearts", 6),
    card("mustang", "hearts", 8),
    card("scope", "spades", 9)
  );
  const victim = t.room.players.find((p) => p !== me)!;
  game.playCard(t.code, me.id, me.hand.find((c) => c.defId === "bang")!.id, victim.id);
  game.respond(t.code, victim.id, "pass");
  game.playCard(t.code, me.id, me.hand.find((c) => c.defId === "beer")!.id);
  game.playCard(t.code, me.id, me.hand.find((c) => c.defId === "mustang")!.id);
  game.playCard(t.code, me.id, me.hand.find((c) => c.defId === "scope")!.id);
  assert.equal(t.room.playsThisTurn, 4, "phải đánh được đúng 4 lá");
  game.endTurn(t.code, me.id);
  doneWithReward(t, me, "spendthrift");
});

test("duel-me — Duel vào người đang nhiều bài hơn mình", () => {
  const { t, me } = forMission("duel-me");
  const rich = t.room.players.find((p) => p !== me)!;
  hand(me, card("duel", "spades", 5));
  hand(rich, card("bang", "hearts", 6), card("bang", "hearts", 7), card("bang", "hearts", 8));
  game.playCard(t.code, me.id, me.hand[0].id, rich.id);
  doneWithReward(t, me, "duel-me");
});

test("two-birds — bắn trúng 2 người khác nhau trong cùng một lượt", () => {
  const { t, me } = forMission("two-birds");
  const [a, b] = t.room.players.filter((p) => p !== me);
  // Gatling nhắm cả bàn nên nó KHÔNG ghi shot cho ai; phải là hai phát Bang! riêng. Đường
  // hoàn thành thật cần HAI thứ: bỏ trần Bang!/lượt (Volcanic hoặc Willy the Kid) VÀ đủ tầm
  // để với tới người thứ hai — tầm mặc định là 1, nên người không ngồi cạnh thì ngoài tầm.
  me.character = { ...me.character!, effect: { unlimitedBang: true } };
  equip(me, card("winchester", "spades", 8)); // tầm 5, với tới cả bàn
  hand(me, card("bang", "spades", 5), card("bang", "spades", 6));
  game.playCard(t.code, me.id, me.hand[0].id, a.id);
  game.respond(t.code, a.id, "pass");
  game.playCard(t.code, me.id, me.hand[0].id, b.id);
  game.respond(t.code, b.id, "pass");
  doneWithReward(t, me, "two-birds");
});

test("pacifist — 3 lượt liên tiếp không đánh Bang!", () => {
  const { t, me } = forMission("pacifist");
  for (let i = 0; i < 3; i++) {
    turnTo(t.room, me);
    me.hand = [];
    game.endTurn(t.code, me.id);
  }
  doneWithReward(t, me, "pacifist");
});

test("on-the-brink — kết thúc 2 lượt liên tiếp ở đúng 1 HP", () => {
  const { t, me } = forMission("on-the-brink");
  for (let i = 0; i < 2; i++) {
    turnTo(t.room, me);
    me.hp = 1;
    me.hand = [];
    game.endTurn(t.code, me.id);
  }
  doneWithReward(t, me, "on-the-brink");
});

test("dry-spell — 3 lượt của mình trong lúc thiếu máu mà không hồi điểm nào", () => {
  const { t, me } = forMission("dry-spell");
  for (let i = 0; i < 3; i++) {
    turnTo(t.room, me);
    me.hp = 2; // thiếu máu, và không hồi
    me.hand = [];
    game.endTurn(t.code, me.id);
  }
  doneWithReward(t, me, "dry-spell");
});

// ─── Guard ───────────────────────────────────────────────────────────────────

test("ghost không tiến triển nhiệm vụ", () => {
  const { t, me } = forMission("all-in");
  me.alive = false;
  me.ghost = true;
  me.hand = [];
  game.endTurn(t.code, me.id);
  assert.equal(me.missionDone, false, "một lượt ghost là quà của house rule, không phải lượt để gặt");
  assert.equal(me.missionProgress, 0);
});

test("người đang trong deathQueue chưa nhận thưởng", () => {
  const { t, me } = forMission("all-in");
  me.hand = [];
  t.room.deathQueue.push({ id: me.id, needed: 1, sourceId: null, creditId: null, saveable: true });
  game.endTurn(t.code, me.id);
  assert.equal(me.missionDone, false, "chưa biết họ sống hay chết thì chưa phải lúc trả thưởng");
});

test("thưởng máu bình thường thì hồi máu thật", () => {
  const { t, me } = forMission("dry-spell"); // nhiệm vụ duy nhất thưởng HP
  const def = MISSION_BY_ID["dry-spell"];
  assert.ok(def.reward.hp, "test này chỉ có nghĩa khi dry-spell còn thưởng HP");
  for (let i = 0; i < 3; i++) {
    turnTo(t.room, me);
    me.hp = 2;
    me.hand = [];
    game.endTurn(t.code, me.id);
  }
  const r = t.room.missionFeed.find((x) => x.missionId === "dry-spell")!;
  assert.equal(r.hp, 1, "hồi được 1 máu thật");
  assert.equal(r.converted, undefined, "không quy đổi khi không bị cấm");
});

test("thưởng máu dưới event cấm hồi máu được quy đổi thành bài, và NÓI RA", () => {
  const { t, me } = forMission("dry-spell");
  // survival: noHeal cả bàn. Đúng cái event làm dry-spell dễ hoàn thành hơn mà lại chặn thưởng
  // của chính nó — nên đây là ca thật, không phải ca dựng.
  t.room.events = [{ seq: 1, defId: "survival", turnsLeft: 99 }] as typeof t.room.events;
  assert.equal(game.activeEffect(t.room).noHeal, true, "event phải đang cấm hồi máu");

  for (let i = 0; i < 3; i++) {
    turnTo(t.room, me);
    me.hp = 2;
    me.hand = [];
    game.endTurn(t.code, me.id);
  }
  const r = t.room.missionFeed.find((x) => x.missionId === "dry-spell")!;
  const def = MISSION_BY_ID["dry-spell"];
  assert.equal(r.hp, 0, "không hồi được máu nào");
  assert.equal(r.converted, true, "phải NÓI RA là đã quy đổi, không âm thầm xoá công người chơi");
  assert.equal(r.cards, (def.reward.cards ?? 0) + (def.reward.hp ?? 0), "máu quy đổi thành bài");
});

test("nhiệm vụ CÒN ẨN không rời khỏi view của chính chủ", () => {
  const { t, me } = forMission("all-in");
  const other = t.room.players.find((p) => p !== me)!;

  const own = game.buildView(t.room, me.id);
  assert.equal(own.you.mission?.id, "all-in", "chính chủ phải thấy");

  const theirs = game.buildView(t.room, other.id);
  assert.equal(theirs.you.mission, null, "người khác không có nhiệm vụ của mình để thấy");
  // Và không lọt ra qua players[] — đúng chỗ bug General Store từng nằm.
  assert.ok(
    !JSON.stringify(theirs.players).includes("all-in"),
    "id nhiệm vụ còn ẩn không được xuất hiện trong players[]"
  );
  assert.equal(theirs.players.find((p) => p.id === me.id)?.revealedMissionId ?? null, null);
});

test("xong rồi thì lộ công khai qua revealedMissionId", () => {
  const { t, me } = forMission("all-in");
  const other = t.room.players.find((p) => p !== me)!;
  me.hand = [];
  game.endTurn(t.code, me.id);
  const theirs = game.buildView(t.room, other.id);
  assert.equal(theirs.players.find((p) => p.id === me.id)?.revealedMissionId, "all-in");
});

test("nhiệm vụ không đi vào room.log, và feed giữ được cả hai khi hai người xong cùng lúc", () => {
  const t = startTable(4);
  const [a, b] = t.room.players;
  withMission(t.room, a, "all-in");
  withMission(t.room, b, "all-in");
  stackDeck(t.room, ...Array.from({ length: 8 }, () => card("beer", "hearts", 6)));

  const logBefore = t.room.log.length;
  const seqBefore = t.room.missionSeq;
  for (const p of [a, b]) {
    turnTo(t.room, p);
    p.hand = [];
    game.endTurn(t.code, p.id);
  }
  assert.ok(
    !t.room.log.some((e) => (e.kind as string) === "mission"),
    "log 40 dòng phải sạch — màn lộ đi kênh riêng"
  );
  assert.equal(t.room.log.length - logBefore, 2, "chỉ hai dòng `turn` thường của hai lượt");
  assert.equal(t.room.missionSeq, seqBefore + 2, "feed nhận CẢ HAI màn lộ");
  assert.equal(t.room.missionFeed.length, 2);
});

test("tắt toggle thì không ai được chia nhiệm vụ", () => {
  const t = startTable(4);
  // startTable đã tắt sẵn; đây là kiểm rằng finalizeDraft tôn trọng cờ đó.
  assert.ok(t.room.players.every((p) => p.missionId === null), "tắt thì không chia");
  assert.equal(game.buildView(t.room, t.sheriff.id).you.mission, null);
});

test("bot không nhận nhiệm vụ", () => {
  const { room } = game.createRoom("người", "sock-h");
  for (let i = 1; i < 4; i++) game.addBot(room.code);
  game.setEventLevel(room.code, "off");
  room.missionsOn = true;
  game.startGame(room.code);
  for (const p of room.players) game.pickCharacter(room.code, p.id, p.draftChoices[0].id);
  const bots = room.players.filter((p) => p.isBot);
  assert.ok(bots.length === 3 && bots.every((p) => p.missionId === null), "bot nhận thưởng cho việc nó không hiểu thì chỉ là bơm bài cho bot");
  assert.ok(room.players.filter((p) => !p.isBot).every((p) => p.missionId !== null), "người thật phải có");
});

test("kill() không làm ai đó vẫn còn nhiệm vụ đang chạy", () => {
  const { t, me } = forMission("all-in");
  kill(me);
  me.hand = [];
  // Không crash, và không tiến triển cho một người đã chết.
  game.endTurn(t.code, t.room.players[t.room.turnIndex].id);
  assert.equal(me.missionDone, false);
});

test("equip không ảnh hưởng nhiệm vụ không liên quan", () => {
  const { t, me } = forMission("all-in");
  equip(me, card("mustang", "hearts", 8));
  me.hand = [];
  game.endTurn(t.code, me.id);
  doneWithReward(t, me, "all-in");
});

// ─── Toggle bật/tắt (luật phòng, như eventLevel) ─────────────────────────────

function lobby() {
  const { room } = game.createRoom("host", "sock-host");
  for (let i = 1; i < 4; i++) game.addPlayer(room.code, `P${i}`, `sock-${i}`);
  game.setEventLevel(room.code, "off");
  return room;
}

test("bật/tắt được ở lobby", () => {
  const room = lobby();
  assert.equal(room.missionsOn, true, "mặc định BẬT");
  assert.equal(game.setMissionsOn(room.code, false), true);
  assert.equal(room.missionsOn, false);
  assert.equal(game.setMissionsOn(room.code, true), true);
  assert.equal(room.missionsOn, true);
});

test("đổi bị TỪ CHỐI khi ván đang chạy", () => {
  // Đây là chỗ nhiệm vụ khác eventLevel: event roll lại mỗi round nên bật giữa ván vô hại,
  // còn nhiệm vụ chia đúng một lần ở finalizeDraft — bật giữa ván để lại một bàn mà ai đã chia
  // thì không có và ai chưa thì có.
  const room = lobby();
  game.startGame(room.code);
  for (const p of room.players) game.pickCharacter(room.code, p.id, p.draftChoices[0].id);
  assert.equal(room.phase, "playing");
  const before = room.missionsOn;
  assert.equal(game.setMissionsOn(room.code, !before), false, "phải từ chối");
  assert.equal(room.missionsOn, before, "và không đổi gì");
});

test("missionsOn sống qua restart(), như eventLevel", () => {
  const room = lobby();
  game.setMissionsOn(room.code, false);
  game.startGame(room.code);
  for (const p of room.players) game.pickCharacter(room.code, p.id, p.draftChoices[0].id);
  game.restart(room.code);
  assert.equal(room.missionsOn, false, "luật phòng không được reset mỗi ván");
  assert.equal(room.phase, "lobby");
  // Và đổi lại được vì đã về lobby
  assert.equal(game.setMissionsOn(room.code, true), true);
});

test("tắt rồi bắt đầu ván thì không ai có nhiệm vụ, và view báo null", () => {
  const room = lobby();
  game.setMissionsOn(room.code, false);
  game.startGame(room.code);
  for (const p of room.players) game.pickCharacter(room.code, p.id, p.draftChoices[0].id);
  assert.ok(room.players.every((p) => p.missionId === null));
  for (const p of room.players) {
    const v = game.buildView(room, p.id);
    assert.equal(v.you.mission, null);
    assert.equal(v.missionsOn, false, "view phải mang cờ để UI ẩn chip");
  }
});

test("bật thì mọi người thật đều có nhiệm vụ, và không ai trùng ai", () => {
  const room = lobby();
  game.setMissionsOn(room.code, true);
  game.startGame(room.code);
  for (const p of room.players) game.pickCharacter(room.code, p.id, p.draftChoices[0].id);
  const ids = room.players.map((p) => p.missionId);
  assert.ok(ids.every((id) => id !== null), "ai cũng có");
  assert.equal(new Set(ids).size, ids.length, "không ai trùng ai");
});
