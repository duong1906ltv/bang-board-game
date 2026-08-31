// `you.mission` — cái flag UI thật sự đọc.
//
// Đây là lỗ đã để một bug đắt lọt qua lần trước: predictionProblem có test, predict có test,
// còn canPredict — flag panel đọc — thì không, và nó luôn báo sai trong khi engine chấp nhận.
// Engine không thấy gì, UI chết hoàn toàn. Nên view có test riêng, không dựa vào test engine.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as game from "../game";
import { MISSION_BY_ID } from "../missions";
import { card, hand, startTable, stackDeck, turnTo, withMission } from "./helpers/table";

test("you.mission khớp state engine suốt một vòng tiến độ", () => {
  const t = startTable(4);
  const me = t.sheriff;
  withMission(t.room, me, "pacifist"); // goal 3
  const def = MISSION_BY_ID["pacifist"];

  for (let lap = 0; lap < def.goal; lap++) {
    const before = game.buildView(t.room, me.id).you.mission;
    assert.equal(before?.progress, me.missionProgress, `lượt ${lap}: view lệch engine`);
    assert.equal(before?.goal, def.goal);
    assert.equal(before?.done, me.missionDone);

    turnTo(t.room, me);
    me.hand = [];
    stackDeck(t.room, card("beer", "hearts", 6), card("beer", "hearts", 7));
    game.endTurn(t.code, me.id);
  }

  const after = game.buildView(t.room, me.id).you.mission;
  assert.equal(after?.done, true, "xong rồi view phải báo xong");
  assert.equal(after?.progress, def.goal);
  assert.equal(after?.done, me.missionDone, "và vẫn khớp engine");
});

test("you.mission mang emoji để chip vẽ được mà không phải tra registry", () => {
  const t = startTable(4);
  withMission(t.room, t.sheriff, "no-shield");
  const m = game.buildView(t.room, t.sheriff.id).you.mission;
  assert.equal(m?.id, "no-shield");
  assert.equal(m?.emoji, MISSION_BY_ID["no-shield"].emoji);
});

test("you.mission là null khi tắt toggle, và view mang cờ để UI ẩn chip", () => {
  const t = startTable(4); // startTable tắt sẵn nhiệm vụ
  const v = game.buildView(t.room, t.sheriff.id);
  assert.equal(v.you.mission, null);
  assert.equal(v.missionsOn, false);
});

test("you.mission là null với bot", () => {
  const { room } = game.createRoom("người", "sock-h");
  for (let i = 1; i < 4; i++) game.addBot(room.code);
  game.setEventLevel(room.code, "off");
  room.missionsOn = true;
  game.startGame(room.code);
  for (const p of room.players) game.pickCharacter(room.code, p.id, p.draftChoices[0].id);
  for (const bot of room.players.filter((p) => p.isBot)) {
    assert.equal(game.buildView(room, bot.id).you.mission, null);
  }
});

test("nhiệm vụ của người khác không lọt vào view của mình, kể cả qua missionFeed", () => {
  const t = startTable(4);
  const [a, b] = t.room.players;
  withMission(t.room, a, "all-in");
  withMission(t.room, b, "mercy");

  const mine = game.buildView(t.room, a.id);
  assert.equal(mine.you.mission?.id, "all-in");
  // Nhiệm vụ của b còn ẩn → không được xuất hiện ở đâu trong view của a.
  assert.ok(!JSON.stringify(mine.players).includes("mercy"), "players[] không được mang id còn ẩn");
  assert.ok(!JSON.stringify(mine.missionFeed).includes("mercy"), "feed chỉ có cái ĐÃ xong");
  assert.equal(mine.players.find((p) => p.id === b.id)?.revealedMissionId ?? null, null);
});

test("missionFeed chỉ mang nhiệm vụ ĐÃ xong, và mang đủ số thưởng thật", () => {
  const t = startTable(4);
  const me = t.sheriff;
  withMission(t.room, me, "all-in");
  stackDeck(t.room, card("beer", "hearts", 6), card("beer", "hearts", 7), card("beer", "hearts", 8));
  turnTo(t.room, me);
  me.hand = [];
  game.endTurn(t.code, me.id);

  const v = game.buildView(t.room, t.room.players.find((p) => p !== me)!.id);
  assert.equal(v.missionFeed.length, 1, "người khác cũng thấy màn lộ — nó là sự kiện của bàn");
  const r = v.missionFeed[0];
  assert.equal(r.missionId, "all-in");
  assert.equal(r.playerId, me.id);
  assert.equal(r.cards, MISSION_BY_ID["all-in"].reward.cards, "số lá thật sự rút được");
});

test("chip không có gì để vẽ khi chưa chia nhiệm vụ", () => {
  const t = startTable(4);
  t.room.missionsOn = true; // bật nhưng chưa chia (ván đã bắt đầu với toggle tắt)
  assert.equal(game.buildView(t.room, t.sheriff.id).you.mission, null, "missionId null → không chip");
});

test("hand() không phá liên kết view↔engine", () => {
  const t = startTable(4);
  const me = t.sheriff;
  withMission(t.room, me, "mercy");
  hand(me, card("bang", "spades", 5), card("beer", "hearts", 6), card("missed", "hearts", 7));
  turnTo(t.room, me);
  stackDeck(t.room, card("beer", "hearts", 8), card("beer", "hearts", 9));
  game.endTurn(t.code, me.id);
  const m = game.buildView(t.room, me.id).you.mission;
  assert.equal(m?.done, true);
  assert.equal(m?.done, me.missionDone);
});
