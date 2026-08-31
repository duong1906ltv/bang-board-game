// Turn prediction — the house layer that gives everyone something to do while it is NOT
// their turn.
//
// While somebody takes their turn, everybody else may quietly stake a guess on ONE thing:
// how many cards that player will end up playing this turn (0 / 1 / 2 / 3+). The window to
// stake is short and closes on a clock; the verdict lands when their turn ends, +1 card for
// a hit and -1 for a miss. Guessing is always optional and costs nothing to skip.
//
// Design: this file is PURE. It holds the definitions, the constants that carry the odds
// and the pacing, and the adjudication — and it never touches a Room. The engine feeds it a
// TurnOutcome and applies the verdict through the deck primitives, which is what keeps a
// prediction from ever bending a rule, the same way lib/events.ts keeps an event honest.
//
// Import discipline: `import type` ONLY, from ./game/state. lib/i18n.ts is a client module
// and imports the constants below, while the engine reaches node:crypto through
// escapeReward — a value import from the engine would drag that into the browser bundle.
// lib/events.ts follows the same rule for the same reason.
//
// ─── Why ONE question, and why it is this one ─────────────────────────────────
//
// There used to be a second question, "who will they shoot". Measured over 14,118 real
// turns (7 seats, events on), the two questions have very different shapes:
//
//   who will they shoot   nobody 41.2%  ·  any one named person 13.3% (avg, ~4.4 alive)
//   how many cards        0: 21.6%   1: 41.9%   2: 22.5%   3+: 14.0%
//
// At a flat ±1 the break-even is 50%. So "shoot" had exactly one answer worth clicking
// (nobody, 41.2%) and four-to-six answers worth -0.73 cards each — five of its seven
// buttons were traps, and the rational line was to always click the same one, at which
// point it stopped being a question. "How many cards" tops out at 41.9% for the laziest
// possible strategy, close enough to 50% that actually reading the table (hand size, gun in
// front of them, whether they must dump before the hand limit) is what decides it. That is
// the whole reason a betting question exists.
//
// ─── Why the CURRENT player, and why there is a clock ─────────────────────────
//
// The subject is the player whose turn is running RIGHT NOW, so a stake is something you do
// during somebody else's turn rather than during your own. That is the better seat for it —
// you are watching the thing you bet on — and it is the shape the game was asked for.
//
// It costs something real, and the number is worth writing down. Betting on a turn already
// in progress means waiting is informative:
//
//   stake before they play anything   best answer 41.9%   4 buckets live
//   stake after 1 card played         best answer 53.5%   3 buckets live   ← past break-even
//   stake after 2 cards played        best answer 61.7%   2 buckets live
//   stake after 3 cards played        best answer 100.0%  1 bucket  live   ← free money
//
// The window is the countermeasure: PREDICT_WINDOW_MS from the moment the turn opens, and
// nothing may be staked after it. It does NOT fully close the hole — a bot finishes a whole
// turn well inside the window, so on a bot's turn a patient player can still watch two cards
// go down and then bet. That is a known, accepted trade: the alternative was a window short
// enough (under a second) that nobody could ever use the feature at all.
//
// The number is a usability call, not a balance one. It started at 15s, which measured badly
// in practice: the table sits in a `pending` — somebody owing a Missed!, a Duel, a General
// Store, a Draw! to acknowledge — for about a quarter of all engine steps, and while a
// player is reading that they are not deciding anything. 30s leaves room for a turn to be
// interrupted once or twice and still be bettable.
//
// The window SHRINKS as the game does — PREDICT_WINDOW_PER_DEATH_MS off for every player
// already dead — so the late game, when turns are fast and the reads are sharp, gives less
// time to sit on the decision.
//
// It is a TIMESTAMP, never a timer. Nothing in this engine uses setTimeout, on purpose: the
// server only schedules the next bot action when the previous one succeeded, so anything
// waiting on a callback that has not fired is how a table freezes permanently (see
// scripts/sim-events.ts, which exists for that one bug class). A deadline that is only ever
// compared needs nobody to fire it.
//
// There is deliberately NO per-game cap. The ±1 symmetry IS the cap: the best blind
// strategy is 41.9%, so staking every single turn bleeds cards, and only somebody selective
// comes out ahead. A cap would have taxed the careful player and the reckless one alike.

import type { ErrorCode } from "./errors";
import type { Player } from "./game/state";

export const PLAYS_BUCKETS = ["0", "1", "2", "3+"] as const;

export const REWARD_CARDS = 1; // a hit pays this many
export const PENALTY_CARDS = 1; // a miss costs this many

// How long the staking window stays open, measured from the moment a turn opens.
export const PREDICT_WINDOW_MS = 30_000;
// Taken off the window for every player already dead, so the late game decides faster.
export const PREDICT_WINDOW_PER_DEATH_MS = 2_000;
// A floor, because the subtraction above would otherwise reach zero on a long game and
// retire the feature without ever saying so. Three seconds is enough to open the panel and
// press one bucket you had already decided on.
export const PREDICT_WINDOW_MIN_MS = 3_000;

export function predictWindowMs(deadCount: number): number {
  return Math.max(
    PREDICT_WINDOW_MIN_MS,
    PREDICT_WINDOW_MS - PREDICT_WINDOW_PER_DEATH_MS * deadCount
  );
}

// One staked guess. Stores IDs, never seat indices: disconnect and removeBot splice
// players[], and every index after the gap shifts down one — an index would quietly start
// pointing at somebody else.
//
// At most one of these per (staker, subject): the single question IS the whole stake, which
// is why judging never has to group or sum anything.
export interface Prediction {
  byId: string; // who staked it
  targetId: string; // whose turn it is about
  value: string; // a PLAYS_BUCKETS entry
}

// What the engine accumulated during the predicted turn, handed over to be judged.
export interface TurnOutcome {
  plays: number; // room.playsThisTurn as the turn ended
}

// One judged prediction, for the reveal. `voided` means the turn never resolved (they left,
// they died holding it, the game ended) — neither paid nor punished.
export interface PredictionResult {
  byId: string;
  value: string;
  correct: boolean;
  voided?: boolean;
}

export function playsBucket(n: number): string {
  if (n <= 0) return "0";
  if (n === 1) return "1";
  if (n === 2) return "2";
  return "3+";
}

export function isCorrect(p: Prediction, o: TurnOutcome): boolean {
  return playsBucket(o.plays) === p.value;
}

// Why this guess may not be staked, or null if it may. Covers only what belongs to the
// prediction rules; the engine checks what belongs to the Room (phase, pending, whose turn
// it is, whether the window is still open).
export function predictionProblem(args: {
  by: Player;
  subject: Player;
  // Omitted when the caller is only asking "may I stake anything at all right now" rather
  // than offering a value — which is what predictBlock does to drive the panel. It used to
  // pass a placeholder instead, and the placeholder was silently invalid, so the panel
  // greyed every button out on a turn the engine would have accepted.
  value?: string;
  locked: Prediction[]; // what `by` has already staked on this same subject
}): ErrorCode | null {
  const { by, subject, value, locked } = args;
  // You always know what you are about to do, so predicting yourself is not a read. This is
  // also what makes the feature something you do on OTHER people's turns.
  //
  // A BOT may be predicted, deliberately. Its strategy is a published algorithm, so reading
  // one is easier than reading a person, and whoever watches a bot therefore earns more.
  // That is a real unfairness, and it is still the better trade: the rule that forbade it
  // made the whole feature UNREACHABLE at the tables people actually sit at — one human plus
  // three bots was 0 legal predictions out of 8 turns.
  if (by.id === subject.id || !subject.alive) return "bad-predict-target";
  if (!by.alive || by.ghost) return "bad-predict-target";
  if (locked.length > 0) return "already-predicted";
  // You must be able to pay for a miss. Without this, an empty-handed player stakes every
  // turn at pure profit — a miss takes a card they do not have — and refills for free at
  // exactly their weakest moment.
  if (by.hand.length < PENALTY_CARDS) return "predict-needs-a-card";
  if (value !== undefined && !(PLAYS_BUCKETS as readonly string[]).includes(value)) {
    return "invalid-prediction";
  }
  return null;
}
