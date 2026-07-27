// Headless soak test for the random-event system: run many all-bot games at every
// frequency level and assert each one REACHES a winner.
//
// Why this exists: nothing in this game has a timeout. The server only schedules
// the next bot action when the previous one succeeded (see scheduleBots in
// server.ts), so a bot that keeps attempting a play the engine rejects — e.g.
// because an event banned that card type — stops the scheduler and freezes the
// table permanently. This harness is the tripwire for that whole class of bug,
// and it also prints the event pacing so the frequency numbers can be tuned
// against real games instead of guesses.
//
//   npm run sim              # 200 games per level, 7 players
//   npm run sim -- 50 5      # 50 games per level, 5 players

import * as game from "../lib/game";
import * as bot from "../lib/bot";
import { EVENT_BY_ID, EventLevel } from "../lib/events";

const GAMES = Number(process.argv[2] || 200);
const PLAYERS = Number(process.argv[3] || 7);
const LEVELS: EventLevel[] = ["off", "low", "normal", "high", "mayhem"];
// A real 7-player game settles well inside this. Anything above it means the
// events made the table unable to converge, which is a balance bug worth failing.
const STEP_CAP = 6000;

interface Stats {
  games: number;
  frozen: number;
  overCap: number;
  turns: number;
  events: number;
  byId: Map<string, number>;
  winners: Map<string, number>;
}

function newStats(): Stats {
  return { games: 0, frozen: 0, overCap: 0, turns: 0, events: 0, byId: new Map(), winners: new Map() };
}

// Build an all-bot room. createRoom's founder is a human seat with no socket, so
// we flip it to a bot: otherwise nothing would ever act on its turn.
function setupRoom(level: EventLevel): string {
  const { room, player } = game.createRoom("sim-host", "");
  player.isBot = true;
  player.socketId = null;
  for (let i = 1; i < PLAYERS; i++) {
    const res = game.addBot(room.code);
    if (!res.ok) throw new Error(`addBot failed: ${res.error}`);
  }
  game.setEventLevel(room.code, level);
  const started = game.startGame(room.code);
  if (!started.ok) throw new Error(`startGame failed: ${started.error}`);
  return room.code;
}

// Drive one game to completion. Returns why it stopped.
function runGame(level: EventLevel, stats: Stats): "done" | "frozen" | "cap" {
  const code = setupRoom(level);
  const room = game.getRoom(code)!;
  const seenEvents = new Set<number>();

  for (let step = 0; step < STEP_CAP; step++) {
    if (room.phase === "result") {
      stats.turns += room.turnCounter;
      stats.winners.set(room.winner!, (stats.winners.get(room.winner!) ?? 0) + 1);
      return "done";
    }
    // Mirrors the server: Suzy Lafayette refills between every resolved action.
    game.refillEmptyHands(room);
    // Count events as they fire, off the feed rather than a "latest event" field:
    // one action can fire several (table + turn), and the action log is trimmed to
    // the last ~40 entries so tallying it at the end would miss most of a game.
    for (const ev of room.eventFeed) {
      if (seenEvents.has(ev.seq)) continue;
      seenEvents.add(ev.seq);
      stats.events += 1;
      stats.byId.set(ev.defId, (stats.byId.get(ev.defId) ?? 0) + 1);
    }
    if (!bot.step(code)) {
      // No bot could act while the game is still live: that is the freeze.
      report(code, room);
      return "frozen";
    }
  }
  return "cap";
}

// Dump enough state to debug a freeze without re-running under a debugger.
function report(code: string, room: game.Room) {
  const cur = room.players[room.turnIndex];
  console.error(`\n❌ FREEZE in room ${code}`);
  console.error(`   phase=${room.phase} turnPhase=${room.turnPhase} turn=${cur?.name} (${cur?.character?.id})`);
  console.error(`   pending=${room.pending ? room.pending.kind : "none"} deck=${room.deck.length} discard=${room.discard.length}`);
  console.error(`   events=${room.events.map((e) => e.defId).join(",") || "none"}`);
  console.error(`   hand=${cur?.hand.map((c) => c.defId).join(",")} limit=${cur ? game.handLimitOf(room, cur) : "?"} hp=${cur?.hp}`);
  console.error(`   alive=${room.players.filter((p) => p.alive).length}/${room.players.length}`);
  console.error(`   log tail:\n${room.log.slice(-8).map((e) => `     ${e.kind} ${e.a ?? ""} ${e.event ?? e.card ?? ""}`).join("\n")}`);
}

let failed = false;
for (const level of LEVELS) {
  const stats = newStats();
  for (let i = 0; i < GAMES; i++) {
    stats.games++;
    const res = runGame(level, stats);
    if (res === "frozen") { stats.frozen++; failed = true; break; }
    if (res === "cap") { stats.overCap++; failed = true; }
  }
  const avgTurns = stats.turns / Math.max(1, stats.games - stats.frozen - stats.overCap);
  const avgEvents = stats.events / stats.games;
  const wins = [...stats.winners].map(([w, n]) => `${w} ${Math.round((n / stats.games) * 100)}%`).join("  ");
  console.log(
    `${level.padEnd(6)} games=${stats.games} frozen=${stats.frozen} overCap=${stats.overCap} ` +
      `avgTurns=${avgTurns.toFixed(1)} events/game=${avgEvents.toFixed(1)}  [${wins}]`
  );
  // Which events actually show up — a zero here means an event is unreachable
  // (bad minAlive/maxAlive gate) even though it looks fine in the registry.
  if (stats.byId.size) {
    const unseen = Object.keys(EVENT_BY_ID).filter((id) => !stats.byId.has(id));
    if (unseen.length) console.log(`       never fired: ${unseen.join(", ")}`);
  }
}

if (failed) {
  console.error("\nSIM FAILED — see the freeze report above.");
  process.exit(1);
}
console.log("\n✅ every game reached a winner at every event level");
