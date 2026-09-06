import {
  DraftView,
  PendingAction,
  PendingView,
  PlayerPublic,
  PlayerView,
  PUBLIC_ROLES,
  Role,
  ALL_ABILITY_KINDS,
} from "../types";
import { CARD_DEF_BY_ID } from "../cards";
import { MISSION_BY_ID } from "../missions";
import { charEffect } from "./deck";
import { toEventView } from "./events-read";
import { distanceBetween, rangeOf } from "./geometry";
import {
  abilityProblem,
  bangBudget,
  greenProblem,
  reactionOnTable,
  blockedDefIdsFor,
  canUseAs,
  handLimitOf,
  legalTargetIds,
  legalTargetsFor,
  predictBlock,
  predictMsLeft,
  predictSubjectId,
} from "./rules";
import { mayStart, roleSetupFor } from "./rooms";
import { Player, Room } from "./state";

function publicRole(p: Player, room: Room): Role | null {
  if (!p.role) return null;
  if (room.phase === "result") return p.role; // all roles revealed at the end
  if (PUBLIC_ROLES.includes(p.role)) return p.role;
  if (!p.alive) return p.role;
  return null;
}

function ownMissionView(p: Player) {
  const def = p.missionId ? MISSION_BY_ID[p.missionId] : undefined;
  if (!def) return null;
  return {
    id: def.id,
    emoji: def.emoji,
    progress: p.missionProgress,
    goal: def.goal,
    done: p.missionDone,
  };
}

function playerAsSeenBy(
  p: Player,
  seat: number,
  room: Room,
  viewer: Player | undefined,
  turnId: string | null,
): PlayerPublic {
  // During the draft nobody sees anyone else's options or pick.
  const inGame = room.phase === "playing" || room.phase === "result";
  // A ghost sees distances (it has to aim), but nobody sees a distance to one — that
  // is what "not counted in the circle" means, and it is also why nobody can shoot it.
  const distance =
    room.phase === "playing" &&
    viewer &&
    (viewer.alive || viewer.ghost) &&
    p.alive &&
    p.id !== viewer.id
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
    character: inGame ? p.character : null,
    hasPicked: p.hasPicked,
    role: publicRole(p, room),
    isTurn: turnId != null && p.id === turnId,
    distance,
    equipment: inGame ? p.equipment : [],
    // Đọc missionDone chứ không đọc missionId: nhiệm vụ còn ẩn không được rời khỏi view
    // của chính chủ. Đây đúng chỗ bug General Store từng nằm (f80434e).
    revealedMissionId: p.missionDone ? p.missionId : null,
  };
}

function draftFor(room: Room, me: Player | undefined): DraftView {
  return {
    choices: me?.draftChoices ?? [],
    youPicked: me?.hasPicked ?? false,
    yourPick: me?.character ?? null,
    pickedCount: room.players.filter((p) => p.hasPicked).length,
    totalCount: room.players.length,
    waitingFor: room.players.filter((p) => !p.hasPicked).map((p) => p.name),
  };
}

function pendingFor(room: Room, me: Player | undefined): PendingView | null {
  const p = room.pending;
  if (!p) return null;
  const playerName = (id: string) =>
    room.players.find((x) => x.id === id)?.name ?? "";
  const meId = me?.id;
  // canUseAs, not defId: Calamity Janet đổi Bang!/Mancato!, Dodge mang ký hiệu Mancato!,
  // Elena Fuente đỡ bằng lá bất kỳ. Ba luật khác nhau, một câu trả lời.
  // Cả tay LẪN bàn: bốn lá green mang ký hiệu Mancato! nằm trong equipment, và chúng còn
  // phải "chín" — lá vừa đặt xuống lượt này không đỡ được.
  const cardsAnswering = (primary: PendingAction | null): string[] => {
    if (!me || !primary) return [];
    return [
      ...me.hand.filter((c) => canUseAs(me, c, primary)),
      ...me.equipment.filter((c) => reactionOnTable(room, c, primary)),
    ].map((c) => c.id);
  };

  const responseButtons = (
    waitingOnMe: boolean,
    primary: PendingAction | null,
  ): PendingAction[] => {
    if (!waitingOnMe) return [];
    if (!primary) return ["pass"];
    return cardsAnswering(primary).length > 0 ? [primary, "pass"] : ["pass"];
  };

  if (p.kind === "check") {
    const waitingOnMe = meId === p.playerId;
    return {
      kind: "check",
      youMustRespond: waitingOnMe,
      actions: responseButtons(waitingOnMe, null),
      actorName: playerName(p.playerId),
      // The reveals themselves, so the dialog can show the actual card rather than
      // a sentence about it. Everyone sees them — the flip is public.
      checks: room.checks,
    };
  }
  if (p.kind === "bang") {
    const waitingOnMe = meId === p.targetId;
    // Only offer "Missed!" if the target holds enough to complete the dodge (2 vs Slab
    // the Killer) — otherwise a lone Missed! would be wasted.
    const usableAsMissed = me
      ? me.hand.filter((c) => canUseAs(me, c, "missed")).length
      : 0;
    const canDodge =
      waitingOnMe && usableAsMissed >= p.missedNeeded - p.missedPlayed;
    return {
      kind: "bang",
      youMustRespond: waitingOnMe,
      actions: !waitingOnMe ? [] : canDodge ? ["missed", "pass"] : ["pass"],
      usableCardIds: waitingOnMe ? cardsAnswering("missed") : [],
      missedNeeded: p.missedNeeded,
      missedPlayed: p.missedPlayed,
      actorName: playerName(p.sourceId),
      targetName: playerName(p.targetId),
    };
  }
  if (p.kind === "dying") {
    const waitingOnMe = meId === p.targetId;
    return {
      kind: "dying",
      youMustRespond: waitingOnMe,
      actions: responseButtons(waitingOnMe, "beer"),
      usableCardIds: waitingOnMe ? cardsAnswering("beer") : [],
      actorName: playerName(p.targetId),
    };
  }
  if (p.kind === "multi") {
    const myResponse = p.responders.find((x) => x.id === meId);
    const waitingOnMe = !!myResponse && !myResponse.done;
    return {
      kind: "multi",
      youMustRespond: waitingOnMe,
      actions: responseButtons(waitingOnMe, p.effect === "indians" ? "bang" : "missed"),
      usableCardIds: waitingOnMe ? cardsAnswering(p.effect === "indians" ? "bang" : "missed") : [],
      actorName: playerName(p.sourceId),
      effect: p.effect,
      waiting: p.responders.filter((x) => !x.done).map((x) => playerName(x.id)),
    };
  }
  if (p.kind === "toss") {
    const myResponse = p.responders.find((x) => x.id === meId);
    const waitingOnMe = !!myResponse && !myResponse.done;
    return {
      kind: "toss",
      youMustRespond: waitingOnMe,
      // Không có nút "bỏ qua": Brawl không từ chối được. Bạn chọn LÁ NÀO, không chọn có
      // hay không — nên câu trả lời đi kèm cardId và client gửi nó khi bạn chạm lá.
      actions: waitingOnMe ? ["toss"] : [],
      // Bỏ lá nào cũng được, và lá trên bàn cũng tính — bản in ghi "a card of their
      // choice". Người chỉ còn đồ trên bàn mà không bỏ được thì cửa này không đóng.
      usableCardIds: waitingOnMe && me ? [...me.hand, ...me.equipment].map((c) => c.id) : [],
      actorName: playerName(p.sourceId),
      waiting: p.responders.filter((x) => !x.done).map((x) => playerName(x.id)),
    };
  }
  if (p.kind === "duel") {
    const waitingOnMe = meId === p.turnId;
    return {
      kind: "duel",
      youMustRespond: waitingOnMe,
      actions: responseButtons(waitingOnMe, "bang"),
      usableCardIds: waitingOnMe ? cardsAnswering("bang") : [],
      actorName: playerName(p.aId),
      targetName: playerName(p.bId),
      turnName: playerName(p.turnId),
    };
  }
  if (p.kind === "kit") {
    const waitingOnMe = meId === p.playerId;
    return {
      kind: "kit",
      youMustRespond: waitingOnMe,
      actions: [],
      storeCards: waitingOnMe ? p.cards : [],
      actorName: playerName(p.playerId),
    };
  }
  if (p.kind === "taken") {
    const waitingOnMe = meId === p.victimId;
    return {
      kind: "taken",
      // Only the person losing the card gets a button. Everyone else, the taker
      // included, watches — they have already done their part.
      youMustRespond: waitingOnMe,
      actions: responseButtons(waitingOnMe, null),
      actorName: playerName(p.takerId),
      targetName: playerName(p.victimId),
      takenMode: p.mode,
      // Named only when it was face-up on the table. Sent to EVERYONE for that case,
      // because a card in play is public and hiding it here would say less than the
      // felt already does.
      takenCard: p.cardName,
      takenFromHand: p.fromHand,
    };
  }
  if (p.kind === "store") {
    // Only the person picking is shown the cards — a deliberate house departure from
    // Bang!, which deals them face up for the whole table. The row is staged over the
    // middle of everyone's screen, so a public reveal meant six people watching a
    // decision they had no part in, with the table behind it covered. Onlookers get the
    // PendingNote line instead, the same treatment Kit Carlson's three cards have.
    const waitingOnMe = meId === p.order[0];
    return {
      kind: "store",
      youMustRespond: waitingOnMe,
      actions: [],
      storeCards: waitingOnMe ? p.cards : [],
      actorName: playerName(p.order[0]),
    };
  }
  // A new PendingKind must add its own branch above rather than quietly render as a store,
  // which is what the old fall-through would have done.
  return p satisfies never;
}

// You always see your OWN role, character and hand; everyone else is filtered to
// PlayerPublic.
export function viewFor(room: Room, playerId: string): PlayerView {
  const me = room.players.find((p) => p.id === playerId);
  const turnPlayer =
    room.phase === "playing" ? room.players[room.turnIndex] : null;
  const turnId = turnPlayer?.id ?? null;
  const isMyTurn = !!(me && turnPlayer && turnPlayer.id === me.id);
  const predictReason = predictBlock(room, me);
  // Không gác sau isMyTurn: greenProblem tự kiểm điều đó, và gác hai lần là hai chỗ có
  // thể lệch nhau.
  const usableGreens = me ? me.equipment.filter((c) => greenProblem(room, me, c.id) === null) : [];

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
      // Serving a Jail sentence: it's your turn but the only legal move is to discard
      // down to the limit and pass.
      jailed: isMyTurn && room.jailedTurn,
      range: me ? rangeOf(me, room) : 1,
      canBang: isMyTurn && !!me && bangBudget(room, me) > 0,
      playedDefsThisTurn: isMyTurn ? [...room.playedDefsThisTurn] : [],
      blockedDefIds: isMyTurn && me ? blockedDefIdsFor(room, me) : [],
      legalTargets: isMyTurn && me ? legalTargetsFor(room, me) : {},
      // KHÔNG gác sau isMyTurn: Sid Ketchum uống được trong lượt người khác, và cửa
      // hấp hối của anh ta luôn rơi vào lượt kẻ vừa bắn anh ta.
      abilities: me ? ALL_ABILITY_KINDS.filter((k) => abilityProblem(room, me, k) === null) : [],
      abilityTargets:
        me && abilityProblem(room, me, "burn-two-to-shoot") === null
          ? legalTargetIds(room, me, "bang")
          : [],
      usableGreenIds: usableGreens.map((c) => c.id),
      greenTargets: Object.fromEntries(
        usableGreens
          .filter((c) => CARD_DEF_BY_ID[c.defId]?.target)
          .map((c) => [c.id, legalTargetIds(room, me!, c.defId, c)]),
      ),
      // Whose hand the draw phase may reach (Jesse Jones' drawMode).
      legalDrawTargets:
        me && charEffect(me).drawMode === "jesse"
          ? room.players
              .filter((p) => p.alive && p.id !== me.id && p.hand.length > 0)
              .map((p) => p.id)
          : [],
      handLimit: me ? handLimitOf(room, me) : 0,
      inbox: me?.inbox ?? [],
      wins: me?.wins ?? 0,
      rewardUrl: me?.rewardTicket ?? null, // only the winner's own view carries the link
      // Only ever YOUR stakes, and only ever YOUR mission: both stay secret until they
      // resolve, so neither may be built from anybody else's — the isolation `hand` has.
      myPredictions: me ? room.predictions.filter((p) => p.byId === me.id) : [],
      mission: me ? ownMissionView(me) : null,
      canPredict: predictReason === null,
      predictBlockReason: predictReason,
    },
    players: room.players.map((p, seat) => playerAsSeenBy(p, seat, room, me, turnId)),
    turnSeat: turnPlayer ? room.players.indexOf(turnPlayer) : null,
    turnCounter: room.turnCounter,
    roleSetup: roleSetupFor(room.players.length),
    draft: room.phase === "drafting" ? draftFor(room, me) : null,
    pending: pendingFor(room, me),
    winner: room.winner,
    checks: room.checks,
    deckCount: room.deck.length,
    discardCount: room.discard.length,
    topDiscard: room.discard.at(-1) ?? null,
    log: room.log,
    eventLevel: room.eventLevel,
    events: room.roundEvents.map((ev) => toEventView(room, ev)),
    eventFeed: room.eventFeed.map((ev) => toEventView(room, ev)),
    missionsOn: room.missionsOn,
    dodgeCityOn: room.dodgeCityOn,
    missionFeed: room.missionFeed,
    predictSubjectId: predictSubjectId(room),
    predictMsLeft: predictMsLeft(room),
    predictFeed: room.predictFeed,
  };
}
