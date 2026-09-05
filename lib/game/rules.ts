// Questions about the rules: may this card be played, how many may be played, who is a
// legal target, what counts as a Bang!. Everything here ANSWERS; nothing here acts — which
// is what lets view.ts sit below the core instead of inside it.
//
// Every answer is published in the view, and the client re-derives none of them. It used to
// derive several and got them wrong each time: crosshairs that had never heard of Truce, a
// prediction panel greyed out on turns the engine would have accepted.

import { Card, CARD_DEF_BY_ID } from "../cards";
import { GameError } from "../errors";
import { activeEffect } from "./events-read";
import { charEffect } from "./deck";
import { distanceBetween, hasEquip, rangeOf } from "./geometry";
import { predictionProblem } from "../predictions";
import { Player, Room } from "./state";

// Grouped so the noHeal event effect can suppress them together.
export const HEAL_DEF_IDS = ["beer", "saloon"];

// Read from the card's TargetRule. Both the play handlers and viewFor come through here.
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

// Floored at 1, never 0: Suzy Lafayette redraws the moment her hand empties, so a limit of
// 0 can never be satisfied and the turn can never end. Drought stops biting at 1 life.
export function handLimitOf(room: Room, p: Player): number {
  // A ghost's whole hand goes to the discard with it, so no limit applies. Answering with
  // the hand (not hp, which is 0) stops endTurn demanding a discard the rule never asks for.
  if (p.ghost) return p.hand.length;
  return Math.max(1, p.hp + (activeEffect(room).handLimitDelta ?? 0));
}

export function bangBudget(room: Room, p: Player): number {
  const eff = activeEffect(room);
  if (eff.noBang) return 0;
  const unlimited = hasEquip(p, "volcanic") || !!charEffect(p).unlimitedBang;
  const cap = eff.bangLimit ?? (unlimited ? 99 : 1);
  return Math.max(0, cap - room.bangsThisTurn);
}

// Covers the once-per-turn house rule and every event restriction. Range and target
// validity stay with the individual play handlers.
export function playBlock(room: Room, p: Player, card: Card, targetId?: string): GameError | null {
  const def = CARD_DEF_BY_ID[card.defId];
  if (!def) return { code: "invalid-card" };
  // Here rather than in playCard(): the bot filters its moves through playBlock, and a bot
  // move the engine then rejects stops the scheduler and freezes the table for good.
  if (room.jailedTurn && room.players[room.turnIndex]?.id === p.id) {
    return { code: "jailed-discard-only" };
  }
  const eff = activeEffect(room);

  if (eff.bannedDefIds?.includes(card.defId)) return { code: "event-bans-card", s: def.name };
  if (eff.bannedKinds?.includes(def.kind)) return { code: "event-bans-kind" };
  if (eff.maxPlays != null && room.playsThisTurn >= eff.maxPlays) {
    return { code: "event-play-limit", n: eff.maxPlays };
  }
  // The PROACTIVE Beer only — a dying player still drinks through respond(), so "no healing"
  // never becomes "no saving throw".
  if (HEAL_DEF_IDS.includes(card.defId) && eff.noHeal) return { code: "event-forbids-heal" };
  // Saloon is left alone on purpose: it heals the LIVING, so buying the table a round on the
  // way out is a real play even though none of it reaches the ghost.
  if (p.ghost && card.defId === "beer") return { code: "ghost-cannot-heal" };
  if (isBangLike(p, card, targetId) && bangBudget(room, p) <= 0) {
    return { code: eff.noBang ? "event-bans-bang" : "bang-limit-reached" };
  }
  if (!isExemptPlay(room, p, card, targetId) && room.playedDefsThisTurn.includes(card.defId)) {
    return { code: "card-already-used-this-turn", s: def.name };
  }
  return null;
}

export function blockedDefIdsFor(room: Room, p: Player): string[] {
  const out = new Set<string>();
  for (const c of p.hand) {
    if (out.has(c.defId)) continue;
    if (playBlock(room, p, c)) out.add(c.defId);
  }
  return [...out];
}

// Keyed by the defId the UI aims with.
export function legalTargetsFor(room: Room, p: Player): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const swap = charEffect(p).useAs;
  for (const c of p.hand) {
    const playAs = [c.defId, ...(swap?.includes(c.defId) ? swap.filter((d) => d !== c.defId) : [])];
    for (const as of playAs) {
      if (!CARD_DEF_BY_ID[as]?.target) continue;
      const ids = legalTargetIds(room, p, as);
      // BOTH names: the engine validates by the card played AS, the client aims by the card
      // in hand. Keying only "bang" left Janet's Missed! with no crosshair and her ability
      // unreachable.
      out[as] ??= ids;
      out[c.defId] ??= ids;
    }
  }
  return out;
}

// A Bang! being fired, including Calamity Janet using a Missed! as one.
export function isBangLike(p: Player, card: Card, targetId?: string): boolean {
  return card.defId === "bang" || (!!targetId && canUseAs(p, card, "bang"));
}

// Exempt from the "each card type once per turn" house rule: gun swaps (weapons change
// freely) and Bang!s, which answer to the Bang!/turn budget instead.
export function isExemptPlay(room: Room, p: Player, card: Card, targetId?: string): boolean {
  if (activeEffect(room).ignoreOncePerTurn) return true; // Frenzy suspends the house rule
  const def = CARD_DEF_BY_ID[card.defId];
  if (def?.kind === "gun") return true;
  return isBangLike(p, card, targetId);
}

export function legalTargetIds(room: Room, actor: Player, defId: string): string[] {
  if (!CARD_DEF_BY_ID[defId]?.target) return [];
  return room.players.filter((p) => !targetProblem(room, actor, defId, p)).map((p) => p.id);
}

// Calamity Janet may swap Bang!/Missed!.
export function canUseAs(player: Player, card: Card, asDefId: string): boolean {
  if (card.defId === asDefId) return true;
  const swap = charEffect(player).useAs;
  return !!swap && swap.includes(card.defId) && swap.includes(asDefId);
}

// --- turn prediction (lib/predictions.ts) ---

// The seat playing RIGHT NOW, not the next one. Named rather than inlined at its three call
// sites because that distinction is the whole design.
export function predictSubjectId(room: Room): string | null {
  if (room.phase !== "playing") return null;
  return room.players[room.turnIndex]?.id ?? null;
}

// A duration, not the deadline: a client clock a few seconds off the server's would
// otherwise render a window that has already shut.
export function predictMsLeft(room: Room): number {
  if (room.phase !== "playing" || room.predictEndsAt === 0) return 0;
  return Math.max(0, room.predictEndsAt - Date.now());
}

export function predictBlock(room: Room, me: Player | undefined): string | null {
  if (!me) return "no-seat";
  if (room.phase !== "playing") return "not-playing";
  // Deliberately NOT blocked while the table waits on a reaction. Blocking it hid nothing —
  // the bet is on a card count, and respond() never touches room.playsThisTurn — while
  // costing most of the window: a table sits in a pending for 26% of engine steps.
  const subject = room.players.find((p) => p.id === predictSubjectId(room));
  if (!subject) return "bad-predict-target";
  // As well as in predict(), not instead: this greys the panel out, predict() is the
  // authority.
  if (predictMsLeft(room) <= 0) return "predict-window-closed";
  const locked = room.predictions.filter((p) => p.byId === me.id && p.targetId === subject.id);
  // No `value`: asks whether ANY stake is possible. Passing a placeholder was the bug that
  // greyed the panel out on turns the engine would have accepted.
  return predictionProblem({ by: me, subject, locked }) ?? null;
}
