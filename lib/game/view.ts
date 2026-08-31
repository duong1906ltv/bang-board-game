// Turning a Room into the one view a single player is allowed to see.
//
// The last cut, and the only one that is purely a sink: nothing in the engine calls
// back into this file. It reads downward through every layer below it, which is why it
// had to go last — cut first, and it would have been the one importing the core.
//
// This is where hidden information is filtered, so it is where a leak lives if there is
// one (see f80434e: General Store showed its cards to players who were not choosing).

import {
  DraftView,
  PendingAction,
  PendingView,
  PlayerPublic,
  PlayerView,
  PUBLIC_ROLES,
  Role,
} from "../types";
import { charEffect } from "./deck";
import { toEventView } from "./events-read";
import { distanceBetween, rangeOf } from "./geometry";
import { bangBudget, blockedDefIdsFor, canUseAs, handLimitOf, legalTargetsFor, nextSeatId, predictBlock } from "./rules";
import { mayStart, roleSetupFor } from "./rooms";
import { Player, Room } from "./state";

export function visibleRole(p: Player, room: Room): Role | null {
  if (!p.role) return null;
  if (room.phase === "result") return p.role; // all roles revealed at the end
  if (PUBLIC_ROLES.includes(p.role)) return p.role;
  if (!p.alive) return p.role;
  return null;
}

export function toPublic(p: Player, seat: number, room: Room, viewer: Player | undefined, turnId: string | null): PlayerPublic {
  // Characters are public once the game is underway; during the draft, nobody
  // sees anyone else's options or pick.
  const inGame = room.phase === "playing" || room.phase === "result";
  const characterPublic = inGame ? p.character : null;
  // A ghost sees distances (it has to aim), but nobody sees a distance to one — that
  // is what "not counted in the circle" means, and it is also why nobody can shoot it.
  const distance =
    room.phase === "playing" && viewer && (viewer.alive || viewer.ghost) && p.alive && p.id !== viewer.id
      ? distanceBetween(room, viewer, p)
      : null;
  return {
    id: p.id,
    name: p.name,
    seat,
    isHost: p.isHost,
    isBot: p.isBot,
    connected: p.connected,
    alive: p.alive,
    ghost: p.ghost,
    hp: p.hp,
    maxHp: p.maxHp,
    handCount: p.hand.length,
    character: characterPublic,
    hasPicked: p.hasPicked,
    role: visibleRole(p, room),
    isTurn: turnId != null && p.id === turnId,
    distance,
    equipment: inGame ? p.equipment : [],
  };
}

export function buildDraft(room: Room, me: Player | undefined): DraftView {
  return {
    choices: me?.draftChoices ?? [],
    youPicked: me?.hasPicked ?? false,
    yourPick: me?.character ?? null,
    pickedCount: room.players.filter((p) => p.hasPicked).length,
    totalCount: room.players.length,
    waitingFor: room.players.filter((p) => !p.hasPicked).map((p) => p.name),
  };
}

export function buildPending(room: Room, me: Player | undefined): PendingView | null {
  const p = room.pending;
  if (!p) return null;
  const name = (id: string) => room.players.find((x) => x.id === id)?.name ?? "";
  const meId = me?.id;
  // Whether the viewer holds a card usable as `defId` — respects Calamity Janet's
  // Bang!⇄Missed! swap so her reaction buttons show for the substituted card too.
  const has = (defId: string) => {
    if (!me) return false;
    const m = me;
    return m.hand.some((c) => canUseAs(m, c, defId));
  };
  const acts = (mine: boolean, primary: PendingAction | null): PendingAction[] => {
    if (!mine) return [];
    const out: PendingAction[] = [];
    if (primary && has(primary)) out.push(primary);
    out.push("pass");
    return out;
  };

  if (p.kind === "check") {
    const mine = meId === p.playerId;
    return {
      kind: "check",
      youMustRespond: mine,
      actions: mine ? ["pass"] : [],
      actorName: name(p.playerId),
      // The reveals themselves, so the dialog can show the actual card rather than
      // a sentence about it. Everyone sees them — the flip is public.
      checks: room.checks,
    };
  }
  if (p.kind === "bang") {
    const mine = meId === p.targetId;
    // Only offer "Missed!" if the target holds enough to complete the dodge
    // (2 vs Slab the Killer) — otherwise a lone Missed! would be wasted.
    const remaining = p.missedNeeded - p.missedPlayed;
    const missedAvail = me ? me.hand.filter((c) => canUseAs(me, c, "missed")).length : 0;
    const canDodge = mine && missedAvail >= remaining;
    const actions: PendingAction[] = mine ? (canDodge ? ["missed", "pass"] : ["pass"]) : [];
    return {
      kind: "bang",
      youMustRespond: mine,
      actions,
      missedNeeded: p.missedNeeded,
      missedPlayed: p.missedPlayed,
      actorName: name(p.sourceId),
      targetName: name(p.targetId),
    };
  }
  if (p.kind === "dying") {
    const mine = meId === p.targetId;
    return { kind: "dying", youMustRespond: mine, actions: acts(mine, "beer"), actorName: name(p.targetId) };
  }
  if (p.kind === "multi") {
    const r = p.responders.find((x) => x.id === meId);
    const mine = !!r && !r.done;
    const need = p.effect === "indians" ? "bang" : "missed";
    const waiting = p.responders.filter((x) => !x.done).map((x) => name(x.id));
    return { kind: "multi", youMustRespond: mine, actions: acts(mine, need), actorName: name(p.sourceId), effect: p.effect, waiting };
  }
  if (p.kind === "duel") {
    const mine = meId === p.turnId;
    return {
      kind: "duel",
      youMustRespond: mine,
      actions: acts(mine, "bang"),
      actorName: name(p.aId),
      targetName: name(p.bId),
      turnName: name(p.turnId),
    };
  }
  if (p.kind === "kit") {
    const mine = meId === p.playerId;
    return { kind: "kit", youMustRespond: mine, actions: [], storeCards: mine ? p.cards : [], actorName: name(p.playerId) };
  }
  if (p.kind === "taken") {
    const mine = meId === p.victimId;
    return {
      kind: "taken",
      // Only the person losing the card gets a button. Everyone else, the taker
      // included, watches — they have already done their part.
      youMustRespond: mine,
      actions: mine ? ["pass"] : [],
      actorName: name(p.takerId),
      targetName: name(p.victimId),
      takenMode: p.mode,
      // Named only when it was face-up on the table. Sent to EVERYONE for that case,
      // because a card in play is public and hiding it here would say less than the
      // felt already does.
      takenCard: p.cardName,
      takenFromHand: p.fromHand,
    };
  }
  // store
  //
  // Only the person picking is shown the cards. Bang!'s own General Store deals them
  // face up for the whole table, and this is a deliberate house departure from that:
  // the row is staged over the middle of everyone's screen, so a public reveal meant
  // six people watching a decision they had no part in, with the table behind it
  // covered. Onlookers get the PendingNote line saying whose pick it is — the same
  // treatment Kit Carlson's three cards have always had.
  const mine = meId === p.order[0];
  return { kind: "store", youMustRespond: mine, actions: [], storeCards: mine ? p.cards : [], actorName: name(p.order[0]) };
}

// Build the personalized view for one player: they always see their OWN role,
// character and hand; for everyone else only public info is exposed.
export function buildView(room: Room, playerId: string): PlayerView {
  const me = room.players.find((p) => p.id === playerId);
  const turnPlayer = room.phase === "playing" ? room.players[room.turnIndex] : null;
  const turnId = turnPlayer ? turnPlayer.id : null;
  const isMyTurn = !!(me && turnPlayer && turnPlayer.id === me.id);
  const bySeat = room.players;

  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    you: {
      id: me?.id ?? "",
      name: me?.name ?? "",
      seat: me ? room.players.indexOf(me) : 0,
      isHost: me?.isHost ?? false,
      canStart: !!me && mayStart(room, me),
      role: me?.role ?? null,
      character: me?.character ?? null,
      hp: me?.hp ?? 0,
      maxHp: me?.maxHp ?? 0,
      hand: me?.hand ?? [],
      equipment: me?.equipment ?? [],
      alive: me?.alive ?? true,
      ghost: me?.ghost ?? false,
      turnPhase: isMyTurn ? room.turnPhase : null,
      // Serving a Jail sentence: it's your turn but the only legal move is to
      // discard down to the limit and pass.
      jailed: isMyTurn && room.jailedTurn,
      range: me ? rangeOf(me, room) : 1,
      // Bang! budget: once per turn by default, unlimited with Volcanic / Willy
      // the Kid, and overridden by events (Hot Streak / Jammed Gun).
      canBang: isMyTurn && !!me && bangBudget(room, me) > 0,
      // House rule: each card type only once per turn — defIds already used.
      playedDefsThisTurn: isMyTurn ? [...room.playedDefsThisTurn] : [],
      // Everything you may NOT play right now, resolved server-side so the client
      // never has to re-implement the house rule or any event restriction.
      blockedDefIds: isMyTurn && me ? blockedDefIdsFor(room, me) : [],
      legalTargets: isMyTurn && me ? legalTargetsFor(room, me) : {},
      // Whose hand the draw phase may reach (Jesse Jones' drawMode).
      legalDrawTargets:
        me && charEffect(me).drawMode === "jesse"
          ? room.players.filter((p) => p.alive && p.id !== me.id && p.hand.length > 0).map((p) => p.id)
          : [],
      handLimit: me ? handLimitOf(room, me) : 0,
      inbox: me?.inbox ?? [],
      wins: me?.wins ?? 0,
      rewardUrl: me?.rewardTicket ?? null, // only the winner's own view carries the link
      // Only ever YOUR stakes. A staked guess is secret until the turn it is about ends,
      // so this must never be built from anybody else's — the same isolation `hand` has.
      myPredictions: me ? room.predictions.filter((p) => p.byId === me.id) : [],
      canPredict: predictBlock(room, me) === null,
      // Resolved server-side, like legalTargets: the client had its own copy of a targeting
      // rule once and greyed out the wrong things, so it no longer re-derives any of them.
      predictBlockReason: predictBlock(room, me),
    },
    players: bySeat.map((p, seat) => toPublic(p, seat, room, me, turnId)),
    turnSeat: turnPlayer ? room.players.indexOf(turnPlayer) : null,
    roleSetup: roleSetupFor(room.players.length),
    draft: room.phase === "drafting" ? buildDraft(room, me) : null,
    pending: buildPending(room, me),
    winner: room.winner,
    checks: room.checks,
    deckCount: room.deck.length,
    discardCount: room.discard.length,
    topDiscard: room.discard.length > 0 ? room.discard[room.discard.length - 1] : null,
    log: room.log,
    eventLevel: room.eventLevel,
    events: room.roundEvents.map((ev) => toEventView(room, ev)),
    eventFeed: room.eventFeed.map((ev) => toEventView(room, ev)),
    nextPlayerId: nextSeatId(room),
    predictFeed: room.predictFeed,
  };
}
