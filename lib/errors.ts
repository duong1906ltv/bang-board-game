// Why the engine refused an action, as a code the UI formats.
//
// The rules engine must not carry display copy: it returns a reason, and only
// lib/i18n.ts turns that into a sentence. Before this, every refusal was a
// Vietnamese string and the English UI recovered the meaning by pattern-matching
// the prose (`/^Bỏ bớt (\d+) lá/`), so rewording a message silently broke the
// translation with no type error.

export type ErrorCode =
  | "no-such-room"
  | "cannot-start"
  | "cannot-add-bot"
  | "player-not-found"
  | "bad-player-count"
  | "game-in-progress"
  | "already-started"
  | "not-your-turn"
  | "must-draw-first"
  | "waiting-for-reaction"
  | "jailed-discard-only"
  | "not-your-reaction"
  | "not-your-duel-turn"
  | "not-your-pick"
  | "invalid-card"
  | "card-not-in-hand"
  | "card-not-implemented"
  | "missed-is-reaction-only"
  | "invalid-target"
  | "out-of-range"
  | "panic-needs-distance-1"
  | "target-has-no-cards"
  | "cannot-jail-sheriff"
  | "already-jailed"
  | "truce-protects-sheriff"
  | "hp-full"
  | "pick-two-distinct"
  | "ability-unavailable"
  | "event-forbids-heal"
  | "event-bans-kind"
  | "event-bans-bang"
  | "bang-limit-reached"
  // parametric — `n` or `s` carries the value the sentence needs
  | "room-full"
  | "need-players"
  | "too-many-players"
  | "hand-over-limit"
  | "already-in-play"
  | "no-valid-card"
  | "need-more-missed"
  | "event-bans-card"
  | "event-play-limit"
  | "card-already-used-this-turn";

export interface GameError {
  code: ErrorCode;
  n?: number; // a count the sentence interpolates
  s?: string; // a card name the sentence interpolates
}

export type Result = { ok: boolean; error?: GameError };

export function err(code: ErrorCode, extra?: { n?: number; s?: string }): Result {
  return { ok: false, error: { code, ...extra } };
}
