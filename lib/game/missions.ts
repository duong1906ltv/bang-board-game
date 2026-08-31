// Nửa engine của nhiệm vụ phụ: chia, đẩy tiến độ, phát thưởng, mở màn lộ.
//
// Tách khỏi lõi có chủ đích, đúng khuôn lib/game/predictions.ts đã chứng minh. lib/missions.ts
// giữ nửa THUẦN — registry, invariant Tier, `advance` — và không chạm được vào Room; file này
// là chỗ DUY NHẤT sửa Room nhân danh một nhiệm vụ, và chỉ với qua drawInto cùng một primitive
// hồi máu truyền từ ngoài vào. Đó là thứ khiến một nhiệm vụ không thể bẻ luật, y như EventCtx
// giữ một event honest.
//
// Không import ./index: mọi mũi chỉ xuống (state, deck), đó là invariant cả module split dựa
// vào. `healPlayer` sống ở lõi nên nó được TRUYỀN VÀO thay vì import lên — một callback, không
// phải một mũi ngược.

import {
  MISSION_BY_ID,
  advance,
  pickMissions,
  type MissionRoom,
  type MissionSignal,
} from "../missions";
import type { MissionReveal } from "../types";
import { drawInto } from "./deck";
import { type Player, type Room } from "./state";

// Hồi máu, trả về lượng THỰC TẾ hồi được. Lõi truyền healPlayer vào đây.
export type HealFn = (room: Room, p: Player, n: number) => number;

// Chia nhiệm vụ lúc chốt draft. Bot không nhận: không còn ai đoán nhiệm vụ nên không có chuyện
// farm, nhưng một con bot nhận thưởng cho việc nó không hiểu thì chỉ là bơm bài cho bot.
export function dealMissions(room: Room) {
  for (const p of room.players) {
    p.missionId = null;
    p.missionProgress = 0;
    p.missionSeen = [];
    p.missionDone = false;
  }
  room.dealtMissionIds = [];
  room.missionFeed = [];
  if (!room.missionsOn) return;
  const humans = room.players.filter((p) => !p.isBot);
  const picked = pickMissions(humans.length, []);
  humans.forEach((p, i) => {
    const def = picked[i];
    if (!def) return; // pool cạn — không nhiệm vụ, thà không có hơn là chia trùng
    p.missionId = def.id;
    room.dealtMissionIds.push(def.id);
  });
}

function missionRoom(room: Room): MissionRoom {
  let alive = 0;
  let dead = 0;
  let wounded = 0;
  for (const p of room.players) {
    if (p.alive) {
      alive++;
      if (p.hp < p.maxHp) wounded++;
    } else dead++;
  }
  return { aliveCount: alive, deadCount: dead, woundedCount: wounded };
}

// Màn lộ là FEED, không phải một field: hai nhiệm vụ có thể chín trong cùng một action — một
// Gatling hạ hai người, hai người khác nhau xong hai nhiệm vụ khác nhau — và một field đơn sẽ
// âm thầm bỏ mất cái đầu. Đúng lỗi predictReveal đã mắc trước khi thành predictFeed.
function openReveal(room: Room, r: Omit<MissionReveal, "seq">) {
  room.missionFeed.push({ ...r, seq: ++room.missionSeq });
  if (room.missionFeed.length > 8) room.missionFeed.shift();
}

// Trả thưởng cho một nhiệm vụ vừa xong. Chỉ đi qua drawInto và `heal` — không tự sửa hand/hp,
// và không thưởng nào tạo pending, nên một nhiệm vụ không bao giờ để bàn chờ một phản ứng mà
// không có gì resume được.
function payReward(room: Room, p: Player, missionId: string, heal: HealFn) {
  const def = MISSION_BY_ID[missionId];
  if (!def) return;
  let cards = def.reward.cards ?? 0;
  let hp = 0;
  let converted = false;
  if (def.reward.hp) {
    hp = heal(room, p, def.reward.hp);
    // Event đang cấm hồi máu: quy đổi thành bài thay vì âm thầm xoá công người chơi đã bỏ ra.
    // Nhiệm vụ tôn trọng luật event — nó không được là lỗ hổng luật đầu tiên trong game — mà
    // vẫn trả một cái gì đó.
    if (hp === 0) {
      cards += def.reward.hp;
      converted = true;
    }
  }
  const drawn = cards > 0 ? drawInto(room, p.hand, cards) : 0;
  openReveal(room, { playerId: p.id, missionId, cards: drawn, hp, converted: converted || undefined });
}

// Một signal chạy qua nhiệm vụ của mọi người. Lõi gọi hàm này ở 5 chỗ; toàn bộ logic tiến độ,
// thưởng và màn lộ nằm ở đây nên mỗi chỗ gọi chỉ là một dòng.
export function signalMissions(room: Room, s: MissionSignal, heal: HealFn) {
  if (!room.missionsOn || room.phase !== "playing") return;
  const mr = missionRoom(room);
  for (const p of room.players) {
    if (!p.missionId || p.missionDone) continue;
    // Ghost không tiến triển: nó đã chết, và `alive === false` là thứ mọi điều kiện thắng, mọi
    // danh sách mục tiêu và mọi khoảng cách trong engine đang tin. Một lượt ghost là món quà
    // của house rule, không phải một lượt để gặt nhiệm vụ.
    if (!p.alive || p.ghost) continue;
    const def = MISSION_BY_ID[p.missionId];
    if (!def) continue;
    const r = advance(def, s, p, mr, p.missionProgress, p.missionSeen);
    p.missionProgress = r.progress;
    p.missionSeen = r.seen;
    if (!r.done) continue;
    // Người vừa bị hạ bởi chính hành động này còn nằm trong deathQueue chờ Beer — chưa biết họ
    // sống hay chết, nên chưa phải lúc trả thưởng.
    if (room.deathQueue.some((d) => d.id === p.id)) continue;
    p.missionDone = true;
    room.dealtMissionIds.push(def.id);
    payReward(room, p, def.id, heal);
  }
}
