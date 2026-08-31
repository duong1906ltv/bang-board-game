// Turn prediction — the house layer that gives everyone something to read while it is
// NOT their turn.
//
// While the current player takes their turn, everybody else may quietly stake a guess on
// what the NEXT player will do: who they will shoot, and how many cards they will play.
// When that turn ends, every guess about it is revealed at once and paid out. Guessing is
// always optional and costs nothing to skip.
//
// Design: this file is PURE. It holds the definitions, the constants that carry the odds,
// and the adjudication — and it never touches a Room. The engine feeds it a TurnOutcome
// and applies whatever `settle` returns through the deck primitives, which is what keeps a
// prediction from ever bending a rule, the same way lib/events.ts keeps an event honest.
//
// Import discipline: `import type` ONLY, from ./game/state. lib/i18n.ts is a client module
// and imports the constants below, while the engine reaches node:crypto through
// escapeReward — a value import from the engine would drag that into the browser bundle.
// lib/events.ts follows the same rule for the same reason.
//
// There is deliberately NO per-game cap. The ±1 symmetry IS the cap: blind accuracy is
// ~20-25%, so a blind guess is worth 0.25*(+1) + 0.75*(-1) = -0.5 cards. Whoever stakes
// every single turn bleeds cards; only somebody selective — staking on the reads that are
// actually clear — comes out ahead. A cap would have taxed the careful player and the
// reckless one alike, and it would have needed a counter plus refund bookkeeping on every
// path that voids a prediction.

import type { ErrorCode } from "./errors";
import type { Player } from "./game/state";

// What can be predicted. Two kinds on purpose: one reads the table socially (who is the
// threat), one reads resources (how big is that hand). A third would not add an axis.
export type PredictionKind = "shoot" | "plays";

export const PLAYS_BUCKETS = ["0", "1", "2", "3+"] as const;

// The `shoot` value meaning "they will not shoot anybody at all".
export const NO_SHOT = "none";

export const REWARD_CARDS = 1; // per correct question
export const PENALTY_CARDS = 1; // per wrong question

// One staked guess. Stores IDs, never seat indices: disconnect and removeBot splice
// players[], and every index after the gap shifts down one — an index would quietly
// start pointing at somebody else.
export interface Prediction {
  byId: string; // who staked it
  targetId: string; // whose turn it is about
  kind: PredictionKind;
  value: string; // shoot: a player id or NO_SHOT · plays: a PLAYS_BUCKETS entry
}

// What the engine accumulated during the predicted turn, handed over to be judged.
export interface TurnOutcome {
  shotIds: string[]; // everyone a Bang! of theirs was aimed at, in order
  plays: number; // room.playsThisTurn as the turn ended
}

// One judged prediction, for the reveal. `voided` means the turn never happened the way
// it needed to (they left, the ghost flip failed, the game ended) — neither paid nor punished.
export interface PredictionResult {
  byId: string;
  kind: PredictionKind;
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
  if (p.kind === "plays") return playsBucket(o.plays) === p.value;
  // `includes`, not shotIds[0]: Willy the Kid and a Volcanic both fire more than once in a
  // turn, and naming ANY of the people who got shot is a correct read.
  if (p.value === NO_SHOT) return o.shotIds.length === 0;
  return o.shotIds.includes(p.value);
}

// Net cards for ONE predictor over their guesses about a single turn: +1 per hit, -1 per
// miss. Two hits pay 2, a hit and a miss cancel to 0, two misses cost 2.
export function settle(preds: Prediction[], o: TurnOutcome): number {
  let net = 0;
  for (const p of preds) net += isCorrect(p, o) ? REWARD_CARDS : -PENALTY_CARDS;
  return net;
}

function validValue(kind: PredictionKind, value: string, alivePlayerIds: string[]): boolean {
  if (kind === "plays") return (PLAYS_BUCKETS as readonly string[]).includes(value);
  return value === NO_SHOT || alivePlayerIds.includes(value);
}

// Why this guess may not be staked, or null if it may. Covers only what belongs to the
// prediction rules; the engine checks what belongs to the Room (phase, pending, whose turn).
export function predictionProblem(args: {
  by: Player;
  target: Player;
  kind: PredictionKind;
  // Omitted when the caller is only asking "may I stake anything at all right now" rather
  // than offering a value — which is what predictBlock does to drive the panel. It used to
  // pass a placeholder instead, and the placeholder was silently invalid for `shoot`
  // (whose values are NO_SHOT or a living player id), so the panel greyed every button out
  // on a turn the engine would have accepted.
  value?: string;
  alivePlayerIds: string[];
  locked: Prediction[]; // what `by` has already staked on this same target
}): ErrorCode | null {
  const { by, target, kind, value, alivePlayerIds, locked } = args;
  // You always know what you are about to do, so predicting yourself is not a read.
  //
  // A BOT may be predicted, deliberately. Its strategy is a published algorithm — shoot the
  // nearest enemy in range — so reading one runs maybe 60-70% against ~21% on a person, and
  // whoever sits directly before a bot therefore earns more than the other seats. That is a
  // real unfairness, and it is still the better trade: the rule that forbade it made the
  // whole feature UNREACHABLE at the tables people actually sit at. One human plus bots is
  // 0 legal predictions out of 8 turns — the next seat is either a bot or you — and bots
  // fill empty seats in ordinary games too. A table padded with bots is already the bigger
  // distortion; a table of nothing but bots is a practice table where farming yourself
  // means nothing.
  if (by.id === target.id || !target.alive) return "bad-predict-target";
  if (!by.alive || by.ghost) return "bad-predict-target";
  if (locked.some((p) => p.kind === kind)) return "already-predicted";
  // Stake as many questions as you can pay for if every one of them misses. Without this,
  // an empty-handed player predicts both questions every turn at pure profit — a miss takes
  // a card they do not have — and refills for free at exactly their weakest moment.
  if (by.hand.length <= locked.length) return "predict-needs-a-card";
  if (value !== undefined && !validValue(kind, value, alivePlayerIds)) return "invalid-prediction";
  return null;
}
