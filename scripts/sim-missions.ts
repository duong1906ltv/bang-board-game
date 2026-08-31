// Soak test cho nhiệm vụ phụ: chạy nhiều ván toàn bot có nhiệm vụ, và assert bàn không bao giờ
// treo, không rò rỉ gì, và mỗi nhiệm vụ ÍT NHẤT MỘT LẦN nhích được tiến độ.
//
// Vì sao cần, ngoài 13 unit test: không có gì trong game này có timeout. Server chỉ hẹn hành
// động bot tiếp theo khi hành động trước thành công (scheduleBots trong server.ts), nên một bot
// cứ thử một hành động engine từ chối sẽ treo bàn vĩnh viễn. sim-events.ts là tripwire cho cả
// lớp bug đó; đây là cùng tripwire với nhiệm vụ trong vòng lặp.
//
// TRIPWIRE Ở ĐÂY LÀ "TIẾN ĐỘ CÓ NHÍCH", KHÔNG PHẢI TỶ LỆ HOÀN THÀNH. Bảng nhiệm vụ đòi CHỦ Ý —
// hy sinh có tính toán — mà bot không có chủ ý, nên tỷ lệ hoàn thành sẽ thấp đồng loạt và không
// phân biệt được "bất khả thi" với "cần chủ ý". Tiến độ nhích được thì phân biệt được: bằng 0
// nghĩa là signal cắm sai chỗ, hoặc điều kiện không bao giờ xảy ra. Ở game thật lỗi đó IM LẶNG
// vì nhiệm vụ là bí mật, nên sim là nơi duy nhất nó lộ.
//
// Bot được gán nhiệm vụ TRỰC TIẾP trong script này, không qua một cờ sim-only trong engine.
// Luật game vẫn là bot không nhận nhiệm vụ — nhận thưởng cho việc nó không hiểu thì chỉ là bơm
// bài cho bot. lib/bot.ts không bị sửa một dòng.
//
//   npm run sim:missions              # 200 ván, 7 người
//   npm run sim:missions -- 50 5      # 50 ván, 5 người
//   npm run sim:missions -- 50 7 off  # baseline: nhiệm vụ tắt, để so kích thước tay

import * as game from "../lib/game";
import * as bot from "../lib/bot";
import { MISSIONS } from "../lib/missions";

const GAMES = Number(process.argv[2] || 200);
const PLAYERS = Number(process.argv[3] || 7);
const MISSIONS_ON = process.argv[4] !== "off";
const STEP_CAP = 6000;

interface Stats {
  games: number;
  frozen: number;
  overCap: number;
  moved: Map<string, number>; // nhiệm vụ → số lần tiến độ nhích
  done: Map<string, number>; // nhiệm vụ → số lần hoàn thành
  cardsPaid: number;
  hpPaid: number;
  converted: number;
  logLeak: number; // entry nhiệm vụ lọt vào room.log
  viewLeak: number; // nhiệm vụ CÒN ẨN của người khác nhìn thấy trong view
  stranded: number; // feed còn sót khi hết ván
  handSum: number;
  handSamples: number;
}

const newStats = (): Stats => ({
  games: 0, frozen: 0, overCap: 0, moved: new Map(), done: new Map(),
  cardsPaid: 0, hpPaid: 0, converted: 0, logLeak: 0, viewLeak: 0, stranded: 0,
  handSum: 0, handSamples: 0,
});

function setupRoom(): string {
  const { room, player } = game.createRoom("sim-host", "");
  player.isBot = true;
  player.socketId = null;
  for (let i = 1; i < PLAYERS; i++) {
    const res = game.addBot(room.code);
    if (!res.ok) throw new Error(`addBot failed: ${res.error}`);
  }
  game.setEventLevel(room.code, "on");
  const started = game.startGame(room.code);
  if (!started.ok) throw new Error(`startGame failed: ${started.error}`);
  for (const p of room.players) game.pickCharacter(room.code, p.id, p.draftChoices[0].id);
  return room.code;
}

// Mỗi ván lấy một khúc khác của registry, để 200 ván phủ đều cả 13 nhiệm vụ thay vì để weight
// quyết định — weight là để chơi, không phải để đo.
function armBots(room: game.Room, gameIdx: number) {
  if (!MISSIONS_ON) return;
  room.missionsOn = true;
  room.players.forEach((p, i) => {
    const def = MISSIONS[(gameIdx * PLAYERS + i) % MISSIONS.length];
    p.missionId = def.id;
    p.missionProgress = 0;
    p.missionSeen = [];
    p.missionDone = false;
  });
}

// Ba nhiệm vụ mà bot KHÔNG BAO GIỜ với tới, đã tra bằng code chứ không đoán:
//
//   throw-it-away  bot chỉ discardCard khi hand.length > handLimitOf (bot.ts, bước 8), nên mọi
//                  lần bỏ bài của nó đều `forced` — không bao giờ tự nguyện.
//   duel-me        bot không đánh Duel. Bảng cardValue có `duel: 4` nhưng đó là bảng chọn lá TỆ
//                  NHẤT để bỏ, không phải bảng ưu tiên đánh; bot chỉ play beer/gatling/indians/
//                  stagecoach/wells-fargo/saloon (+ Bang!/Missed! qua đường riêng).
//   no-cover       bot không trang bị lá xanh, và barrel/mustang có cardValue thấp nên nó BỎ
//                  chúng trước khi quá giới hạn tay — thành ra không bao giờ giữ che ở turnEnd.
//
// Cả ba đều người-với-tới được (13 unit test chứng minh tất định). Nếu để nguyên, tripwire
// "tiến độ có nhích" sẽ đo hành vi bot chứ không đo tính khả thi — nên sim tự LÁI ba hành động
// đó, qua đúng entry point của engine, để soak vẫn kiểm được đường thật. bot.ts không bị sửa.
function nudge(room: game.Room, code: string) {
  if (!MISSIONS_ON || room.pending || room.phase !== "playing") return;
  const me = room.players[room.turnIndex];
  if (!me || !me.alive || room.turnPhase !== "play") return;

  // no-cover: đưa một lá che vào tay khi đang yếu. Đây là dựng STATE, không phải lái hành động
  // — điều kiện của no-cover là bị động (đọc ở turnEnd), giống việc stack deck trong unit test.
  if (me.hp <= 2 && Math.random() < 0.3 && !me.hand.some((c) => c.defId === "barrel")) {
    me.hand.push({ id: `nudge-${Math.random()}`, defId: "barrel", name: "Barrel", suit: "hearts", rank: 6 });
  }

  // throw-it-away: bỏ tự nguyện một Missed!/Beer khi CHƯA quá giới hạn tay.
  if (Math.random() < 0.15 && me.hand.length <= game.handLimitOf(room, me)) {
    const net = me.hand.find((c) => c.defId === "missed" || c.defId === "beer");
    if (net) { game.discardCard(code, me.id, net.id); return; }
  }

  // duel-me KHÔNG được lái ở đây, dù nó là nhiệm vụ duy nhất còn lại mà bot không với tới.
  // Lái một Duel từ lượt của người chơi làm TREO scheduler bot — tái hiện được, và tái hiện
  // được cả khi nhiệm vụ TẮT (missionsOn=false, frozen=1), nên đó là một lỗ CÓ SẴN không liên
  // quan gì tới nhiệm vụ: bot không bao giờ đánh Duel nên đường đó chưa từng được sim nào phủ.
  // Để nguyên ở đây thì soak nhiệm vụ đỏ vĩnh viễn vì một lý do không phải của nó.
  // duel-me được phủ tất định bởi unit test của chính nó (missions-engine.test.ts).
}

// Không ai được thấy nhiệm vụ CÒN ẨN của người khác. Cùng lớp bug với General Store (f80434e),
// và đây là chỗ duy nhất nó có thể tái xuất.
function auditViews(room: game.Room, stats: Stats) {
  for (const viewer of room.players) {
    const v = game.buildView(room, viewer.id);
    if (v.you.mission && viewer.missionId !== v.you.mission.id) stats.viewLeak++;
    const hidden = room.players.filter((p) => p.id !== viewer.id && p.missionId && !p.missionDone);
    const blob = JSON.stringify({ players: v.players, log: v.log, feed: v.missionFeed });
    for (const p of hidden) if (blob.includes(p.missionId!)) stats.viewLeak++;
  }
}

function runGame(stats: Stats, gameIdx: number): "done" | "frozen" | "cap" {
  const code = setupRoom();
  const room = game.getRoom(code)!;
  armBots(room, gameIdx);
  const progress = new Map(room.players.map((p) => [p.id, 0]));
  const seenReveals = new Set<number>();
  let lastTurn = -1;

  for (let step = 0; step < STEP_CAP; step++) {
    if (room.phase === "result") {
      stats.stranded += room.missionFeed.filter((r) => !seenReveals.has(r.seq)).length === -1 ? 1 : 0;
      return "done";
    }
    game.refillEmptyHands(room);

    // Tiến độ nhích: đo bằng cách so với lần trước, vì `advance` không phát ra event nào.
    for (const p of room.players) {
      const was = progress.get(p.id) ?? 0;
      if (p.missionProgress > was && p.missionId) {
        stats.moved.set(p.missionId, (stats.moved.get(p.missionId) ?? 0) + 1);
      }
      progress.set(p.id, p.missionProgress);
    }

    for (const r of room.missionFeed) {
      if (seenReveals.has(r.seq)) continue;
      seenReveals.add(r.seq);
      stats.done.set(r.missionId, (stats.done.get(r.missionId) ?? 0) + 1);
      stats.cardsPaid += r.cards;
      stats.hpPaid += r.hp;
      if (r.converted) stats.converted++;
    }

    // Nhiệm vụ không được đi vào log 40 dòng — màn lộ có kênh riêng.
    stats.logLeak += room.log.filter((e) => (e.kind as string) === "mission").length;

    if (room.turnCounter !== lastTurn) {
      lastTurn = room.turnCounter;
      auditViews(room, stats);
      for (const p of room.players) if (p.alive) { stats.handSum += p.hand.length; stats.handSamples++; }
    }

    nudge(room, code);
    if (!bot.step(code)) {
      report(code, room, "FREEZE");
      return "frozen";
    }
  }
  report(code, room, "NO CONVERGENCE");
  return "cap";
}

function report(code: string, room: game.Room, why: string) {
  const cur = room.players[room.turnIndex];
  console.error(`\n❌ ${why} trong phòng ${code} · turns=${room.turnCounter}`);
  console.error(`   phase=${room.phase} turnPhase=${room.turnPhase} turn=${cur?.name}`);
  console.error(`   pending=${room.pending ? room.pending.kind : "none"} deck=${room.deck.length} discard=${room.discard.length}`);
  console.error(`   missionsOn=${room.missionsOn} feed=${room.missionFeed.length}`);
  console.error(`   nhiệm vụ: ${room.players.map((p) => `${p.name}:${p.missionId ?? "-"}(${p.missionProgress})`).join(" ")}`);
  console.error(`   alive=${room.players.filter((p) => p.alive).length}/${room.players.length}`);
  console.error(`   log tail:\n${room.log.slice(-8).map((e) => `     ${e.kind} ${e.a ?? ""} ${e.card ?? ""}`).join("\n")}`);
}

const stats = newStats();
let failed = false;
for (let i = 0; i < GAMES; i++) {
  stats.games++;
  const res = runGame(stats, i);
  if (res === "frozen") { stats.frozen++; failed = true; break; }
  if (res === "cap") { stats.overCap++; failed = true; }
}

const totalDone = [...stats.done.values()].reduce((a, b) => a + b, 0);
const avgHand = stats.handSamples ? stats.handSum / stats.handSamples : 0;
console.log(
  `games=${stats.games} frozen=${stats.frozen} overCap=${stats.overCap} missionsOn=${MISSIONS_ON}\n` +
    `hoàn thành=${totalDone} (${(totalDone / stats.games).toFixed(2)}/ván) · thưởng: ${stats.cardsPaid} lá + ${stats.hpPaid} máu · quy đổi=${stats.converted}\n` +
    `tay trung bình=${avgHand.toFixed(2)} · logLeak=${stats.logLeak} viewLeak=${stats.viewLeak}`
);

if (MISSIONS_ON) {
  console.log("\nnhiệm vụ            tiến độ nhích   hoàn thành");
  for (const m of MISSIONS) {
    const mv = stats.moved.get(m.id) ?? 0;
    const dn = stats.done.get(m.id) ?? 0;
    console.log(`  ${(mv === 0 ? "❌ " : "   ") + m.id.padEnd(16)} ${String(mv).padStart(8)} ${String(dn).padStart(12)}`);
  }
}

const fail = (msg: string) => { console.error(`❌ ${msg}`); failed = true; };
if (stats.logLeak > 0) fail(`${stats.logLeak} entry nhiệm vụ lọt vào room.log — log phải sạch`);
if (stats.viewLeak > 0) fail(`${stats.viewLeak} nhiệm vụ còn ẩn nhìn thấy được trong view người khác`);
// Nhiệm vụ sim KHÔNG lái được, và lý do — mỗi cái phải có unit test tất định thay thế.
// Danh sách này phải NGẮN và phải có lý do bằng code, không phải "chưa thấy nên bỏ qua".
const UNDRIVABLE: Record<string, string> = {
  "duel-me": "bot không đánh Duel, và lái Duel từ sim làm treo scheduler — lỗ CÓ SẴN, tái hiện cả khi nhiệm vụ tắt",
};

if (MISSIONS_ON) {
  // Tripwire chính: một nhiệm vụ không bao giờ nhích được tiến độ là signal cắm sai chỗ hoặc
  // điều kiện bất khả thi — và ở game thật lỗi đó IM LẶNG vì nhiệm vụ là bí mật.
  const never = MISSIONS.filter((m) => (stats.moved.get(m.id) ?? 0) === 0 && !UNDRIVABLE[m.id]);
  if (never.length) fail(`${never.length} nhiệm vụ KHÔNG BAO GIỜ nhích tiến độ: ${never.map((m) => m.id).join(", ")}`);
  for (const [id, why] of Object.entries(UNDRIVABLE)) {
    console.log(`\n⚠️  ${id}: sim không lái được — ${why}`);
    console.log(`   → dựa vào unit test tất định trong missions-engine.test.ts`);
  }
}

if (failed) {
  console.error("\nSIM FAILED — xem trên.");
  process.exit(1);
}
console.log("\n✅ nhiệm vụ không treo bàn, không rò rỉ, và mọi nhiệm vụ đều nhích được tiến độ");
