// Headless soak test for turn prediction: run many all-bot games with bots staking
// RANDOM guesses, and assert the table never freezes, nothing leaks, and the economy
// behaves the way the ±1 symmetry says it must.
//
// Why this exists, on top of the unit tests: `predict` is a new network entry point, and
// nothing in this game has a timeout. The server only schedules the next bot action when
// the previous one succeeded (see scheduleBots in server.ts), so a bot that keeps
// attempting something the engine rejects freezes the table permanently. sim-events.ts is
// the tripwire for that whole class of bug; this is the same tripwire with predictions in
// the loop.
//
// The bots guess at RANDOM on purpose. That makes the accuracy figure a measurement of the
// blind rate, and the net-cards figure a check on the calibration: if guessing blind is
// PROFITABLE, then "±1, break-even at 50%, blind rate ~25%" is wrong somewhere and the
// whole no-cap argument collapses. lib/bot.ts is deliberately not touched — a bot that
// understood predictions would stop measuring the blind rate.
//
//   npm run sim:predict              # 200 games, 7 players
//   npm run sim:predict -- 50 5      # 50 games, 5 players

import * as game from "../lib/game";
import * as bot from "../lib/bot";
import { NO_SHOT, PLAYS_BUCKETS, type PredictionKind } from "../lib/predictions";

const GAMES = Number(process.argv[2] || 200);
const PLAYERS = Number(process.argv[3] || 7);
const STEP_CAP = 6000;
// Chance that a given living seat stakes a guess when a fresh turn opens. Well above what
// a person would do, so a 200-game run gathers thousands of samples. Pass 0 as the third
// argument for the baseline: same harness, nobody staking, which is how the effect of
// predictions on average hand size gets measured rather than guessed at.
const STAKE_CHANCE = process.argv[4] !== undefined ? Number(process.argv[4]) : 0.5;

interface Stats {
  games: number;
  frozen: number;
  overCap: number;
  staked: number;
  hits: number;
  misses: number;
  voided: number;
  netCards: number;
  logLeak: number; // prediction entries that reached the shared action log
  viewLeak: number; // somebody's stake visible in somebody else's view
  stranded: number; // predictions still outstanding once the game was over
  handSum: number;
  handSamples: number;
}

const newStats = (): Stats => ({
  games: 0, frozen: 0, overCap: 0, staked: 0, hits: 0, misses: 0, voided: 0,
  netCards: 0, logLeak: 0, viewLeak: 0, stranded: 0, handSum: 0, handSamples: 0,
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
  return room.code;
}

// Bots have no missions and no opinions: they name a target and a bucket at random. The
// engine refuses most of these (wrong seat, no cards, already staked) and a refusal must
// never stall anything — which is half of what this harness is checking.
function stakeRandomGuesses(room: game.Room, code: string, stats: Stats) {
  const nextId = game.nextSeatId(room);
  const target = room.players.find((p) => p.id === nextId);
  if (!target) return;
  const alive = room.players.filter((p) => p.alive);

  // No isBot juggling needed: the engine allows predicting a bot, so this harness exercises
  // exactly the rule a person plays under rather than a lifted version of it.
  for (const p of alive) {
    if (p.id === target.id || Math.random() > STAKE_CHANCE) continue;
    const kind: PredictionKind = Math.random() < 0.5 ? "shoot" : "plays";
    const value =
      kind === "plays"
        ? PLAYS_BUCKETS[Math.floor(Math.random() * PLAYS_BUCKETS.length)]
        : Math.random() < 0.25
          ? NO_SHOT
          : alive[Math.floor(Math.random() * alive.length)].id;
    if (game.predict(code, p.id, nextId!, kind, value).ok) stats.staked++;
  }
}

// Nobody may see anybody else's outstanding stake. This is the General Store class of bug
// (f80434e) and the only place it could reappear.
function auditViews(room: game.Room, stats: Stats) {
  if (room.predictions.length === 0) return;
  for (const viewer of room.players) {
    const v = game.buildView(room, viewer.id);
    for (const p of v.you.myPredictions) if (p.byId !== viewer.id) stats.viewLeak++;
    const others = room.predictions.filter((p) => p.byId !== viewer.id);
    const blob = JSON.stringify({ players: v.players, log: v.log });
    for (const p of others) {
      // A stake is only ever identifiable by the pairing of its kind and value; a bare id
      // shows up all over a view legitimately, so match the pair.
      if (blob.includes(`"kind":"${p.kind}","value":"${p.value}"`)) stats.viewLeak++;
    }
  }
}

function runGame(stats: Stats): "done" | "frozen" | "cap" {
  const code = setupRoom();
  const room = game.getRoom(code)!;
  const seenReveals = new Set<number>();
  let lastTurn = -1;

  for (let step = 0; step < STEP_CAP; step++) {
    if (room.phase === "result") {
      // Nothing may outlive the game: a stake left outstanding would be judged against a
      // completely different turn if the room were replayed.
      stats.stranded += room.predictions.length;
      return "done";
    }
    game.refillEmptyHands(room);

    // A fresh turn opened: everybody gets one chance to stake on the seat after it.
    if (room.turnCounter !== lastTurn) {
      lastTurn = room.turnCounter;
      stakeRandomGuesses(room, code, stats);
      auditViews(room, stats);
      for (const p of room.players) if (p.alive) { stats.handSum += p.hand.length; stats.handSamples++; }
    }

    // Tally each verdict once, off the reveal's own seq — the same reason sim-events reads
    // eventFeed instead of the log.
    for (const r of room.predictFeed) {
      if (seenReveals.has(r.seq)) continue;
      seenReveals.add(r.seq);
      for (const res of r.results) {
        if (res.voided) stats.voided++;
        else if (res.correct) { stats.hits++; stats.netCards += 1; }
        else { stats.misses++; stats.netCards -= 1; }
      }
    }
    // Predictions must never reach the shared 40-entry log — twelve verdicts a turn would
    // push every shot, death and event out of it within a few turns.
    stats.logLeak += room.log.filter((e) => (e.kind as string) === "predict").length;

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
  console.error(`\n❌ ${why} in room ${code} · turns=${room.turnCounter}`);
  console.error(`   phase=${room.phase} turnPhase=${room.turnPhase} turn=${cur?.name}`);
  console.error(`   pending=${room.pending ? room.pending.kind : "none"} deck=${room.deck.length} discard=${room.discard.length}`);
  console.error(`   nextSeat=${game.nextSeatId(room)} outstanding=${room.predictions.length}`);
  console.error(`   predictions=${JSON.stringify(room.predictions)}`);
  console.error(`   alive=${room.players.filter((p) => p.alive).length}/${room.players.length}`);
  console.error(`   log tail:\n${room.log.slice(-8).map((e) => `     ${e.kind} ${e.a ?? ""} ${e.card ?? ""}`).join("\n")}`);
}

const stats = newStats();
let failed = false;
for (let i = 0; i < GAMES; i++) {
  stats.games++;
  const res = runGame(stats);
  if (res === "frozen") { stats.frozen++; failed = true; break; }
  if (res === "cap") { stats.overCap++; failed = true; }
}

const judged = stats.hits + stats.misses;
const acc = judged ? (stats.hits / judged) * 100 : 0;
const perGuess = judged ? stats.netCards / judged : 0;
const avgHand = stats.handSamples ? stats.handSum / stats.handSamples : 0;

console.log(
  `games=${stats.games} frozen=${stats.frozen} overCap=${stats.overCap}\n` +
    `staked=${stats.staked} judged=${judged} voided=${stats.voided}\n` +
    `blind accuracy=${acc.toFixed(1)}%  net cards=${stats.netCards} (${perGuess.toFixed(2)}/guess)\n` +
    `avg hand=${avgHand.toFixed(2)}  logLeak=${stats.logLeak} viewLeak=${stats.viewLeak} stranded=${stats.stranded}`
);

// --- hard gates ---
const fail = (msg: string) => { console.error(`❌ ${msg}`); failed = true; };
if (stats.logLeak > 0) fail(`${stats.logLeak} prediction entries reached the shared log — it must stay clean`);
if (stats.viewLeak > 0) fail(`${stats.viewLeak} stakes were visible in another player's view`);
if (stats.stranded > 0) fail(`${stats.stranded} predictions outlived their game`);
if (judged === 0 && STAKE_CHANCE > 0) fail("no prediction was ever judged — the harness is not exercising the feature");
// The calibration claim the whole no-cap design rests on: guessing blind must LOSE cards.
if (judged > 0 && perGuess >= 0) fail(`blind guessing nets ${perGuess.toFixed(2)} cards/guess — it must be negative`);

if (failed) {
  console.error("\nSIM FAILED — see above.");
  process.exit(1);
}
console.log("\n✅ predictions never froze a table, never leaked, and blind guessing loses cards");
