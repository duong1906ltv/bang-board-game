// Questions about the rules: may this card be played, how many may be played, who is
// a legal target, what counts as a Bang!.
//
// isBangLike / isExemptPlay / legalTargetIds / canUseAs were living in the core out of
// history, not design — they answer questions, they do not act. Moving them here is what
// removed the last two arrows pointing back up, and it is why view.ts can sit below the
// core instead of inside it.

import { Card, CARD_DEF_BY_ID } from "../cards";
import { GameError } from "../errors";
import { activeEffect } from "./events-read";
import { charEffect } from "./deck";
import { distanceBetween, hasEquip, rangeOf } from "./geometry";
import { predictionProblem, type PredictionKind } from "../predictions";
import { Player, Room } from "./state";

// Cards whose whole point is restoring life — suppressed together by `noHeal`.
export const HEAL_DEF_IDS = ["beer", "saloon"];

// The single answer to "may `actor` aim `defId` at `target`?", read from the card's
// TargetRule. Both the play handlers and buildView go through this, so the
// crosshairs the client draws and the plays the server accepts cannot drift apart —
// the client used to carry its own copy and had never heard of Truce.
export function targetProblem(room: Room, actor: Player, defId: string, target: Player): GameError | null {
  const rule = CARD_DEF_BY_ID[defId]?.target;
  if (!rule) return { code: "invalid-card" };
  if (!target.alive) return { code: "invalid-target" };
  if (target.id === actor.id && !rule.self) return { code: "invalid-target" };
  if (rule.shoots && activeEffect(room).protectSheriff && target.role === "sheriff") {
    return { code: "truce-protects-sheriff" };
  }
  if (rule.notSheriff && target.role === "sheriff") return { code: "cannot-jail-sheriff" };
  if (rule.notAlreadyHolding && hasEquip(target, defId)) return { code: "already-jailed" };
  if (rule.maxDistance != null) {
    const max = rule.maxDistance === "range" ? rangeOf(actor, room) : rule.maxDistance;
    if (distanceBetween(room, actor, target) > max) {
      return { code: rule.maxDistance === "range" ? "out-of-range" : "panic-needs-distance-1" };
    }
  }
  if (rule.needsCards && target.hand.length === 0 && target.equipment.length === 0) {
    return { code: "target-has-no-cards" };
  }
  return null;
}

// Cards a player may keep at the end of their turn.
// Floored at 1, never 0. A limit of 0 is unsatisfiable for Suzy Lafayette: she
// draws the instant her hand is empty (refillEmptyHands runs after every action),
// so discarding her last card immediately puts her back over the limit and the turn
// can never be ended — an infinite discard/draw loop for bot and human alike.
// Drought therefore stops biting at 1 life, which costs almost nothing.
export function handLimitOf(room: Room, p: Player): number {
  // A ghost lies back down at the end of its turn and everything it is holding goes to
  // the discard with it, so there is nothing for a limit to police. Answering with the
  // hand itself (rather than hp, which is 0) is what keeps endTurn from demanding a
  // discard the rule never asks for, and the client from offering one.
  if (p.ghost) return p.hand.length;
  return Math.max(1, p.hp + (activeEffect(room).handLimitDelta ?? 0));
}

// How many more Bang!s the player may fire this turn (0 = none).
export function bangBudget(room: Room, p: Player): number {
  const eff = activeEffect(room);
  if (eff.noBang) return 0;
  const unlimited = hasEquip(p, "volcanic") || !!charEffect(p).unlimitedBang;
  const cap = eff.bangLimit ?? (unlimited ? 99 : 1);
  return Math.max(0, cap - room.bangsThisTurn);
}

// Why this card can't be played right now, or null if it can. Covers the
// once-per-turn house rule and every event restriction; range/target validity is
// still checked by the individual play handlers.
export function playBlock(room: Room, p: Player, card: Card, targetId?: string): GameError | null {
  const def = CARD_DEF_BY_ID[card.defId];
  if (!def) return { code: "invalid-card" };
  // Serving a Jail sentence blocks every play. This has to live HERE rather than only
  // in playCard(), because playBlock is the shared predicate: the bot filters its
  // candidate moves through it, and a bot move the engine then rejects returns false
  // from step(), which stops the bot scheduler and freezes the table for good.
  if (room.jailedTurn && room.players[room.turnIndex]?.id === p.id) {
    return { code: "jailed-discard-only" };
  }
  const eff = activeEffect(room);

  if (eff.bannedDefIds?.includes(card.defId)) return { code: "event-bans-card", s: def.name };
  if (eff.bannedKinds?.includes(def.kind)) return { code: "event-bans-kind" };
  if (eff.maxPlays != null && room.playsThisTurn >= eff.maxPlays) {
    return { code: "event-play-limit", n: eff.maxPlays };
  }
  // Healing plays, blocked as a group. Note this covers the PROACTIVE Beer only —
  // a dying player may still drink to survive (respond()), so "no healing" never
  // becomes "no saving throw".
  if (HEAL_DEF_IDS.includes(card.defId) && eff.noHeal) return { code: "event-forbids-heal" };
  // A ghost has no life to restore, so a Beer would burn for nothing. Saloon is left
  // alone on purpose — it heals the LIVING, and pouring a round for the table on the
  // way out is a real play even if none of it reaches the one buying.
  if (p.ghost && card.defId === "beer") return { code: "ghost-cannot-heal" };
  if (isBangLike(p, card, targetId) && bangBudget(room, p) <= 0) {
    return { code: eff.noBang ? "event-bans-bang" : "bang-limit-reached" };
  }
  if (!isExemptPlay(room, p, card, targetId) && room.playedDefsThisTurn.includes(card.defId)) {
    return { code: "card-already-used-this-turn", s: def.name };
  }
  return null;
}

// The distinct card types in `p`'s hand that cannot be played right now. Sent in
// the view so the client can grey those cards out instead of letting the player
// aim into a silent server rejection.
export function blockedDefIdsFor(room: Room, p: Player): string[] {
  const out = new Set<string>();
  for (const c of p.hand) {
    if (out.has(c.defId)) continue;
    if (playBlock(room, p, c)) out.add(c.defId);
  }
  return [...out];
}

// Legal targets for every aimable card type the player is holding, keyed by the
// defId the UI aims with. A character that may play one card as another (Calamity
// Janet) gets the swapped card keyed too, since it aims by the other card's rules.
export function legalTargetsFor(room: Room, p: Player): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const swap = charEffect(p).useAs;
  for (const c of p.hand) {
    // What this card may be played AS: itself, plus whatever the character swaps it
    // for (Calamity Janet's Missed! ⇄ Bang!).
    const playAs = [c.defId, ...(swap?.includes(c.defId) ? swap.filter((d) => d !== c.defId) : [])];
    for (const as of playAs) {
      if (!CARD_DEF_BY_ID[as]?.target) continue;
      const ids = legalTargetIds(room, p, as);
      // Keyed under BOTH names, because the two sides ask different questions: the
      // engine validates by the rules of the card being played AS, but the client
      // aims with the defId of the card in hand — the one it drew and the player
      // clicked. Janet's Missed! used to land only under "bang", so the client's
      // lookup for "missed" came back undefined, no crosshair ever lit up, and her
      // whole ability was unreachable even though the server would have allowed it.
      out[as] ??= ids;
      out[c.defId] ??= ids;
    }
  }
  return out;
}

// Play a card from the active player's hand.
// Step 2a scope: blue self-equipment (guns, Mustang, Scope, Barrel). Targeted
// blue cards (Jail/Dynamite) and brown cards are handled in later steps.
// A play that is EXEMPT from the "each card type only once per turn" house rule:
//  • any gun swap (weapons change freely), and
//  • a Bang! — including Calamity Janet firing a Missed! as a Bang! — which is
//    governed by its OWN limit instead (bangsThisTurn: once, or unlimited with
//    Volcanic / Willy the Kid; see playBang).
// A Bang! being fired — including Calamity Janet using a Missed! as one. Governed
// by the Bang!/turn budget rather than the once-per-turn house rule.
export function isBangLike(p: Player, card: Card, targetId?: string): boolean {
  return card.defId === "bang" || (!!targetId && canUseAs(p, card, "bang"));
}

export function isExemptPlay(room: Room, p: Player, card: Card, targetId?: string): boolean {
  if (activeEffect(room).ignoreOncePerTurn) return true; // Frenzy suspends the house rule
  const def = CARD_DEF_BY_ID[card.defId];
  if (def?.kind === "gun") return true;
  return isBangLike(p, card, targetId);
}

// Everyone `defId` may legally be aimed at right now. Published per card type in
// the view so the UI can highlight exactly the legal targets.
export function legalTargetIds(room: Room, actor: Player, defId: string): string[] {
  if (!CARD_DEF_BY_ID[defId]?.target) return [];
  return room.players.filter((p) => !targetProblem(room, actor, defId, p)).map((p) => p.id);
}

// Whether `card` may be used as `asDefId`. Calamity Janet may swap Bang!/Missed!.
export function canUseAs(player: Player, card: Card, asDefId: string): boolean {
  if (card.defId === asDefId) return true;
  const swap = charEffect(player).useAs;
  return !!swap && swap.includes(card.defId) && swap.includes(asDefId);
}

// --- turn prediction (lib/predictions.ts) ---

// The seat that plays after this one — the only seat predictions are ever open on.
// Reads turnDir off the same expression advanceToNextSeat uses, and deliberately does
// NOT skip the dead: every seat comes around every round under the ghost-turn house rule.
//
// Lives here rather than in the core because view.ts needs it and view.ts may not import
// the core — that is the arrow the module split exists to prevent.
export function nextSeatId(room: Room): string | null {
  const n = room.players.length;
  if (n === 0 || room.phase !== "playing") return null;
  return room.players[(room.turnIndex + room.turnDir + n * n) % n]?.id ?? null;
}

// Why `me` may not stake any guess right now, or null if they may. Answered server-side
// for the same reason legalTargets is: the client used to re-derive a rule and got it
// wrong, so it no longer derives any of them.
export function predictBlock(room: Room, me: Player | undefined): string | null {
  if (!me) return "no-seat";
  if (room.phase !== "playing") return "not-playing";
  if (room.pending) return "waiting-for-reaction";
  const nextId = nextSeatId(room);
  const target = room.players.find((p) => p.id === nextId);
  if (!target) return "bad-predict-target";
  // Both questions are open, so being blocked means neither is available. Ask about the
  // one already staked LAST, which is why "shoot" is probed with its own locked list.
  const locked = room.predictions.filter((p) => p.byId === me.id && p.targetId === target.id);
  const kinds: PredictionKind[] = ["shoot", "plays"];
  const open = kinds.filter((k) => !locked.some((p) => p.kind === k));
  if (open.length === 0) return "already-predicted";
  const problem = predictionProblem({
    by: me,
    target,
    kind: open[0],
    value: "0", // a value every kind accepts, so this probes availability and not the value
    alivePlayerIds: room.players.filter((p) => p.alive).map((p) => p.id),
    locked,
  });
  return problem ?? null;
}
