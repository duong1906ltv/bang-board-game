// Bộ mở rộng có THẬT SỰ tới được tay người chơi không.
//
// Câu hỏi khác với sim-events.ts. Ở đó là "bàn có treo không". Ở đây là "một tính năng đã
// viết xong có bao giờ chạy không": nhân vật mới có được chia ra không, và ba nút năng lực
// có bao giờ được bấm không.
//
// KHÔNG nudge. Không ép bot chọn nhân vật nào, không mớm lá bài nào. Nếu một năng lực
// không bao giờ chạy thì đó là engine hoặc bot chưa tới được nó, và vá bằng cách mớm chỉ
// giấu đi đúng cái lỗi cần thấy.
//
//   npx tsx scripts/sim-dodge-city.ts          # 200 ván, 6 người
//   npx tsx scripts/sim-dodge-city.ts 50 8     # 50 ván, 8 người

import * as game from "../lib/game";
import * as bot from "../lib/bot";
import { ALL_ABILITY_KINDS, AbilityKind, CHARACTERS } from "../lib/types";

const GAMES = Number(process.argv[2] || 200);
const PLAYERS = Number(process.argv[3] || 6);
const STEP_CAP = 6000;

const drafted = new Map<string, number>();
const picked = new Map<string, number>();
const abilityUses = new Map<AbilityKind, number>();
let frozen = 0;
let overCap = 0;
let turns = 0;

function setupRoom(): string {
  const { room, player } = game.createRoom("sim-host", "");
  player.isBot = true;
  player.socketId = null;
  for (let i = 1; i < PLAYERS; i++) {
    const res = game.addBot(room.code);
    if (!res.ok) throw new Error(`addBot failed: ${res.error}`);
  }
  game.setEventLevel(room.code, "off"); // sự kiện là biến số khác, đo riêng ở sim-events
  if (!game.setDodgeCityOn(room.code, true)) throw new Error("toggle refused");
  const started = game.startGame(room.code);
  if (!started.ok) throw new Error(`startGame failed: ${JSON.stringify(started.error)}`);
  return room.code;
}

function runGame(): "done" | "frozen" | "cap" {
  const code = setupRoom();
  const room = game.getRoom(code)!;

  for (const p of room.players) {
    for (const c of p.draftChoices) drafted.set(c.id, (drafted.get(c.id) ?? 0) + 1);
  }

  // Đếm bằng cách so bộ đếm lượt trước và sau mỗi nhịp: nó reset mỗi lượt, nên chỉ cộng
  // phần TĂNG và bỏ qua lúc nó tụt về 0.
  let before: Partial<Record<AbilityKind, number>> = {};

  for (let step = 0; step < STEP_CAP; step++) {
    if (room.phase === "result") {
      turns += room.turnCounter;
      for (const p of room.players) {
        if (p.character) picked.set(p.character.id, (picked.get(p.character.id) ?? 0) + 1);
      }
      return "done";
    }
    game.refillEmptyHands(room);
    if (!bot.step(code)) {
      report(room, "FREEZE");
      return "frozen";
    }
    for (const kind of ALL_ABILITY_KINDS) {
      const now = room.abilityUsesThisTurn[kind] ?? 0;
      const was = before[kind] ?? 0;
      if (now > was) abilityUses.set(kind, (abilityUses.get(kind) ?? 0) + (now - was));
    }
    before = { ...room.abilityUsesThisTurn };
  }
  report(room, "NO CONVERGENCE");
  return "cap";
}

function report(room: game.Room, why: string) {
  const cur = room.players[room.turnIndex];
  console.error(`\n❌ ${why} · turns=${room.turnCounter} phase=${room.phase}/${room.turnPhase}`);
  console.error(`   turn=${cur?.name} (${cur?.character?.id}) hp=${cur?.hp} hand=${cur?.hand.map((c) => c.defId).join(",")}`);
  console.error(`   pending=${room.pending?.kind ?? "none"} deck=${room.deck.length} discard=${room.discard.length}`);
  console.error(`   log tail:\n${room.log.slice(-8).map((e) => `     ${e.kind} ${e.a ?? ""} ${e.card ?? ""}`).join("\n")}`);
}

for (let i = 0; i < GAMES; i++) {
  const outcome = runGame();
  if (outcome === "frozen") frozen++;
  if (outcome === "cap") overCap++;
}

const done = GAMES - frozen - overCap;
console.log(`\n${GAMES} ván · ${PLAYERS} người · Dodge City BẬT`);
console.log(`  tới đích ${done}/${GAMES} · đóng băng ${frozen} · vượt trần ${overCap} · trung bình ${(turns / Math.max(1, done)).toFixed(1)} lượt\n`);

// ── nhân vật nào chưa bao giờ ra bàn ────────────────────────────────────────
const neverDrafted = CHARACTERS.filter((c) => !drafted.has(c.id));
const neverPicked = CHARACTERS.filter((c) => !picked.has(c.id));
console.log(`  ${CHARACTERS.length} nhân vật trong pool`);
console.log(`  chưa bao giờ được chia: ${neverDrafted.length ? neverDrafted.map((c) => c.id).join(", ") : "không ai"}`);
console.log(`  chưa bao giờ được chọn: ${neverPicked.length ? neverPicked.map((c) => c.id).join(", ") : "không ai"}\n`);

// ── năng lực nào chưa bao giờ được bấm ──────────────────────────────────────
console.log("  năng lực bấm nút:");
let dead = 0;
for (const kind of ALL_ABILITY_KINDS) {
  const n = abilityUses.get(kind) ?? 0;
  if (n === 0) dead++;
  console.log(`    ${n === 0 ? "✗" : "✓"} ${kind.padEnd(20)} ${n} lần`);
}

const bad = frozen > 0 || overCap > 0 || neverDrafted.length > 0 || dead > 0;
console.log(
  bad
    ? "\n❌ có thứ chưa tới được tay người chơi — xem dấu ✗ ở trên. ĐỪNG vá bằng cách mớm bài."
    : "\n✅ mọi nhân vật đều ra bàn và mọi năng lực đều được dùng, không cần mớm gì",
);
process.exit(bad ? 1 : 0);
