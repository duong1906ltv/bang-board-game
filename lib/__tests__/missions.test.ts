// Luật nhiệm vụ, xét riêng. Mọi thứ ở đây là hàm thuần nên không cần bàn chơi —
// phía engine nằm ở missions-engine.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MISSIONS,
  MISSION_BY_ID,
  advance,
  pickMissions,
  type MissionRoom,
  type MissionSignal,
} from "../missions";
import type { Player } from "../game/state";

const room: MissionRoom = { aliveCount: 4, deadCount: 0, woundedCount: 0 };

// Chỉ những field luật nhiệm vụ thật sự đọc.
function stub(over: Partial<Player> & { id: string }): Player {
  return { hp: 4, maxHp: 4, alive: true, ghost: false, hand: [], equipment: [], ...over } as Player;
}
const cards = (...defIds: string[]) =>
  defIds.map((defId, i) => ({ id: `c${i}`, defId })) as Player["hand"];

const turnEnd = (actor: Player, plays = 0, playedDefIds: string[] = []): MissionSignal => ({
  t: "turnEnd", actor, plays, playedDefIds,
});

test("mọi nhiệm vụ đều khai báo được và không có Tier 3", () => {
  assert.equal(MISSIONS.length, 13);
  for (const m of MISSIONS) {
    assert.ok(m.id && m.emoji, `${m.id}: thiếu id hoặc emoji`);
    assert.ok(m.tier === 1 || m.tier === 2, `${m.id}: tier phải là 1 hoặc 2, không có Tier 3`);
    assert.ok(m.goal >= 1, `${m.id}: goal phải ≥ 1`);
    assert.ok(m.weight > 0, `${m.id}: weight phải > 0`);
    const r = m.reward;
    assert.ok((r.cards ?? 0) > 0 || (r.hp ?? 0) > 0, `${m.id}: phải có thưởng`);
  }
  assert.equal(Object.keys(MISSION_BY_ID).length, MISSIONS.length, "MISSION_BY_ID phải phủ hết");
});

test("Tier 2 đếm số người khác nhau thì ngưỡng không vượt 3", () => {
  // Pool co lại khi người ta chết, nên một ngưỡng cao sẽ hết đường ở cuối ván. Chỉ two-birds
  // thuộc loại này; các Tier 2 khác đếm hành động của chính mình.
  const byDistinctTargets = MISSIONS.filter((m) => m.seenKey);
  assert.ok(byDistinctTargets.length > 0, "phải có ít nhất một cái để kiểm");
  for (const m of byDistinctTargets) assert.ok(m.goal <= 3, `${m.id}: goal ${m.goal} > 3`);
});

test("pickMissions không trả trùng và tôn trọng exclude", () => {
  const picked = pickMissions(7, []);
  assert.equal(picked.length, 7);
  assert.equal(new Set(picked.map((m) => m.id)).size, 7, "không được trùng");

  const excluded = MISSIONS.slice(0, 5).map((m) => m.id);
  const rest = pickMissions(8, excluded);
  assert.ok(rest.every((m) => !excluded.includes(m.id)), "không được chọn cái đã loại");
});

test("pool cạn thì pickMissions trả ít hơn n, không lặp để bù", () => {
  const all = MISSIONS.map((m) => m.id);
  assert.equal(pickMissions(5, all.slice(0, 11)).length, 2, "còn 2 thì trả 2");
  assert.equal(pickMissions(3, all).length, 0, "loại hết thì trả rỗng");
});

test("advance không cho tiến độ vượt goal", () => {
  const pacifist = MISSION_BY_ID["pacifist"]; // goal 3
  const me = stub({ id: "me" });
  let r = advance(pacifist, turnEnd(me), me, room, 2, []);
  assert.equal(r.progress, 3);
  assert.equal(r.done, true);
  // Gọi thêm lần nữa không đẩy quá goal
  r = advance(pacifist, turnEnd(me), me, room, 3, []);
  assert.equal(r.progress, 3);
});

test("breaks xoá CẢ tiến độ lẫn seen", () => {
  const twoBirds = MISSION_BY_ID["two-birds"];
  const me = stub({ id: "me" });
  const r = advance(twoBirds, turnEnd(me), me, room, 1, ["victim-1"]);
  assert.equal(r.progress, 0, "tiến độ về 0");
  assert.deepEqual(r.seen, [], "seen xoá sạch — nếu không, lượt sau sẽ bỏ qua người đã bắn");
  assert.equal(r.done, false);
});

test("breaks chạy TRƯỚC track, vì on-the-brink đọc cả hai trên cùng một signal", () => {
  const brink = MISSION_BY_ID["on-the-brink"]; // goal 2, đếm lượt kết thúc ở đúng 1 HP
  const at1 = stub({ id: "me", hp: 1 });
  const at3 = stub({ id: "me", hp: 3 });
  // Ở 1 HP: cộng tiến độ
  assert.equal(advance(brink, turnEnd(at1), at1, room, 0, []).progress, 1);
  // Không còn ở 1 HP: cùng signal turnEnd, nhưng phải XOÁ chuỗi chứ không cộng tiếp
  assert.equal(advance(brink, turnEnd(at3), at3, room, 1, []).progress, 0);
});

test("two-birds đếm người KHÁC NHAU, không đếm trùng cùng một người", () => {
  const m = MISSION_BY_ID["two-birds"];
  const me = stub({ id: "me" });
  const hit = (targetId: string): MissionSignal => ({
    t: "damage", actor: me, target: stub({ id: targetId }), n: 1,
  });

  const first = advance(m, hit("a"), me, room, 0, []);
  assert.equal(first.progress, 1);
  assert.deepEqual(first.seen, ["a"]);

  // Bắn lại đúng người đó: không cộng gì
  const again = advance(m, hit("a"), me, room, first.progress, first.seen);
  assert.equal(again.progress, 1, "cùng một người không tính lần hai");

  // Người thứ hai: xong
  const second = advance(m, hit("b"), me, room, first.progress, first.seen);
  assert.equal(second.progress, 2);
  assert.equal(second.done, true);
});

test("no-shield chỉ tính khi tay ĐANG có Missed!", () => {
  const m = MISSION_BY_ID["no-shield"];
  const shooter = stub({ id: "them" });
  const hit = (me: Player): MissionSignal => ({ t: "damage", actor: shooter, target: me, n: 1 });

  const armed = stub({ id: "me", hand: cards("missed", "beer") });
  assert.equal(advance(m, hit(armed), armed, room, 0, []).done, true);

  // Không có Missed! thì bị bắn chỉ là bị bắn, không phải hy sinh
  const bare = stub({ id: "me", hand: cards("beer") });
  assert.equal(advance(m, hit(bare), bare, room, 0, []).progress, 0);
});

test("throw-it-away chỉ tính khi bỏ TỰ NGUYỆN", () => {
  const m = MISSION_BY_ID["throw-it-away"];
  const me = stub({ id: "me" });
  const drop = (defId: string, forced: boolean): MissionSignal => ({ t: "discard", actor: me, defId, forced });

  assert.equal(advance(m, drop("missed", false), me, room, 0, []).done, true);
  assert.equal(advance(m, drop("beer", false), me, room, 0, []).done, true);
  // Bỏ vì quá giới hạn tay không phải hy sinh — phải bỏ một lá gì đó dù muốn hay không
  assert.equal(advance(m, drop("missed", true), me, room, 0, []).progress, 0);
  // Lá khác thì không phải lưới an toàn
  assert.equal(advance(m, drop("bang", false), me, room, 0, []).progress, 0);
});

test("no-cover đòi lớp che NẰM TRONG TAY, và chỉ mustang/barrel mới là lớp che", () => {
  const m = MISSION_BY_ID["no-cover"];
  const at = (hand: string[], equipment: string[] = [], hp = 2) =>
    stub({ id: "me", hp, hand: cards(...hand), equipment: cards(...equipment) });

  // Đang yếu, không có che trên bàn, mà tay đang giữ Barrel → từ chối thật
  const refusing = at(["barrel", "bang"]);
  assert.equal(advance(m, turnEnd(refusing), refusing, room, 0, []).done, true);

  // Tay không có che → chẳng từ chối gì, chỉ là không có. Đây là mệnh đề giữ cho nhiệm vụ
  // này khỏi tự hoàn thành một cách tình cờ.
  const empty = at(["bang", "beer"]);
  assert.equal(advance(m, turnEnd(empty), empty, room, 0, []).progress, 0);

  // Jail và Dynamite là lá xanh nhưng KHÔNG phải lớp che — giữ Jail là giữ vũ khí dùng lên
  // người khác, còn Dynamite là thứ muốn tống đi.
  const jail = at(["jail", "dynamite"]);
  assert.equal(advance(m, turnEnd(jail), jail, room, 0, []).progress, 0);

  // Đã có che trên bàn rồi thì không từ chối gì
  const covered = at(["barrel"], ["mustang"]);
  assert.equal(advance(m, turnEnd(covered), covered, room, 0, []).progress, 0);

  // Đủ máu thì không phải "đúng lúc cần nhất"
  const healthy = at(["barrel"], [], 4);
  assert.equal(advance(m, turnEnd(healthy), healthy, room, 0, []).progress, 0);
});

test("dry-spell chỉ ngắt chuỗi khi máu THẬT SỰ lên", () => {
  const m = MISSION_BY_ID["dry-spell"];
  const me = stub({ id: "me", hp: 2 });
  const healed = (n: number): MissionSignal => ({ t: "heal", actor: me, n });

  // Hồi được thật → xoá chuỗi
  assert.equal(advance(m, healed(1), me, room, 2, []).progress, 0);
  // Hồi 0 (đã đủ máu, hoặc event đang cấm hồi) → chuỗi giữ nguyên, vì người chơi đã không
  // hồi được gì. Đây là lý do healPlayer trả về lượng hồi THỰC TẾ.
  assert.equal(advance(m, healed(0), me, room, 2, []).progress, 2);
});
