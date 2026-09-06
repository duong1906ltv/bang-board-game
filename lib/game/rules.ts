// Questions about the rules: may this card be played, how many may be played, who is a
// legal target, what counts as a Bang!. Everything here ANSWERS; nothing here acts — which
// is what lets view.ts sit below the core instead of inside it.
//
// Every answer is published in the view, and the client re-derives none of them. It used to
// derive several and got them wrong each time: crosshairs that had never heard of Truce, a
// prediction panel greyed out on turns the engine would have accepted.

import { Card, CARD_DEF_BY_ID } from "../cards";
import { ABILITY_FLAG, ABILITY_USES_PER_TURN, AbilityKind } from "../types";
import { GameError } from "../errors";
import { activeEffect } from "./events-read";
import { charEffect } from "./deck";
import { distanceBetween, hasEquip, rangeOf } from "./geometry";
import { predictionProblem } from "../predictions";
import { Player, Room } from "./state";

// Grouped so the noHeal event effect can suppress them together.
// Lá nào bị sự kiện "cấm hồi máu" chặn. Whisky và Tequila vào đây cùng lý do với Beer —
// cấm hồi máu mà quên chúng thì sự kiện chỉ cấm được một nửa số đường hồi máu trên bàn.
export const HEAL_DEF_IDS = ["beer", "saloon", "whisky", "tequila", "canteen"];

// Read from the card's TargetRule. Both the play handlers and viewFor come through here.
export function targetProblem(
  room: Room,
  actor: Player,
  defId: string,
  target: Player,
  card?: Card,
): GameError | null {
  const rule = CARD_DEF_BY_ID[defId]?.target;
  if (!rule) return { code: "invalid-card" };
  if (!target.alive) return { code: "invalid-target" };
  if (target.id === actor.id && !rule.self) return { code: "invalid-target" };
  // Apache Kid: "lá bài chất Rô của NGƯỜI KHÁC", không phải "mọi lá Rô". Của chính anh ta
  // thì bình thường, và Dynamite hay lá lật lên khi Draw! không phải ai đánh vào anh ta cả
  // — chúng không đi qua cửa này nên tự khắc không dính.
  const immune = charEffect(target).immuneSuit;
  if (immune && card?.suit === immune && actor.id !== target.id) return { code: "immune-suit" };
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
  // Sean Mallory thay hẳn "một lá mỗi máu" bằng một trần phẳng. Sự kiện vẫn cộng trừ lên
  // trên: chúng co giãn cả bàn, không phải luật riêng của một người.
  const base = charEffect(p).handLimitOverride ?? p.hp;
  return Math.max(1, base + (activeEffect(room).handLimitDelta ?? 0));
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
  // Đủ lá để trả giá không. Ở đây chứ không phải trong handler, vì bot lọc nước đi qua
  // playBlock và client vẽ nút mờ từ blockedDefIdsFor — cả hai đọc chung một câu trả lời.
  // +1 vì chính lá đang đánh cũng nằm trên tay và không trả giá cho chính nó được.
  const cost = def.costDiscard ?? 0;
  if (cost > 0 && p.hand.length < cost + 1) return { code: "need-cards-to-pay" };
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
      const ids = legalTargetIds(room, p, as, c);
      // Ba khoá cho một lá, và khoá theo `c.id` là khoá CHÍNH: Apache Kid miễn nhiễm bài
      // Rô, nên một Bang! ♦ và một Bang! ♣ trên cùng bàn tay có mục tiêu hợp lệ khác nhau
      // — khoá theo defId thì hai lá đè lên nhau và một trong hai chắc chắn sai.
      out[c.id] = ids;
      // Hai khoá defId giữ lại cho client cũ và cho chỗ nào chỉ biết tên bài: engine kiểm
      // theo lá được đánh NHƯ, client ngắm theo lá trên tay. Chỉ khoá "bang" thì lá Né của
      // Janet mất crosshair và năng lực của cô ấy không bấm tới được.
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

export function legalTargetIds(room: Room, actor: Player, defId: string, card?: Card): string[] {
  if (!CARD_DEF_BY_ID[defId]?.target) return [];
  return room.players.filter((p) => !targetProblem(room, actor, defId, p, card)).map((p) => p.id);
}

// Calamity Janet may swap Bang!/Missed!.
export function canUseAs(player: Player, card: Card, asDefId: string): boolean {
  if (card.defId === asDefId) return true;
  // Dodge mang ký hiệu Mancato!. MỘT chiều: Dodge đỡ được Bang!, nhưng Mancato! không
  // biến thành Dodge (nó sẽ không rút thêm lá nào). Calamity Janet cũng không bắn Dodge
  // thành Bang! được — năng lực của cô ấy nói đích danh hai LÁ Bang! và Mancato!.
  //
  // GREEN thì không: Bible và Iron Plate cũng mang ký hiệu Mancato!, nhưng chúng chỉ đỡ
  // được TỪ TRÊN BÀN, và phải nằm đó từ lượt trước. Trên tay chúng mới chỉ là lá chờ được
  // đặt xuống. Bỏ điều kiện này ra là bot đỡ luôn bằng Bible trên tay, bỏ qua cả cái giá
  // một lượt chờ vốn là toàn bộ thiết kế của loại bài này. reactionOnTable xét riêng.
  const def = CARD_DEF_BY_ID[card.defId];
  if (def?.countsAs === asDefId && def.kind !== "green") return true;
  const ch = charEffect(player);
  // Elena Fuente, và chỉ theo MỘT chiều: mọi lá đỡ được Bang!, nhưng không lá nào biến
  // thành Bang!. Duel đòi Bang! thật, nên nó không lọt qua đây.
  if (asDefId === "missed" && ch.anyAsMissed) return true;
  const swap = ch.useAs;
  return !!swap && swap.includes(card.defId) && swap.includes(asDefId);
}

// Bấm được nút năng lực này ngay bây giờ không. MỘT hàm, không phải hai bản chép: view
// dựng nút từ đây và engine nhận lệnh cũng qua đây, nên "nút sáng mà server từ chối" là
// điều không xảy ra được.
export function abilityProblem(room: Room, p: Player, kind: AbilityKind): GameError | null {
  if (!p.alive) return { code: "not-your-turn" };
  if (!charEffect(p)[ABILITY_FLAG[kind]]) return { code: "ability-unavailable" };
  if ((room.abilityUsesThisTurn[kind] ?? 0) >= ABILITY_USES_PER_TURN[kind]) {
    return { code: "ability-used-up" };
  }

  if (kind === "burn-two-to-heal") {
    // Sid Ketchum uống được VÀO BẤT CỨ LÚC NÀO — ngoài lượt, và kể cả khi đang hấp hối
    // để tự cứu. Đó là toàn bộ giá trị của năng lực, nên anh ta đứng trên cửa lượt.
    if (activeEffect(room).noHeal) return { code: "event-forbids-heal" };
    if (p.hp >= p.maxHp) return { code: "hp-full" };
    if (p.hand.length < 2) return { code: "card-not-in-hand" };
    return null;
  }

  // Ba năng lực Dodge City là hành động trong lượt mình, cùng ba điều kiện với việc đánh
  // một lá bài: đúng người, đúng phase, không có cửa phản ứng nào đang mở.
  if (room.pending) return { code: "waiting-for-reaction" };
  if (room.players[room.turnIndex]?.id !== p.id) return { code: "not-your-turn" };
  if (room.turnPhase !== "play") return { code: "not-your-turn" };

  if (kind === "lose-life-to-draw") {
    // Chuck Wengam không tự sát được.
    return p.hp <= 1 ? { code: "ability-unavailable" } : null;
  }
  if (kind === "burn-two-to-shoot") {
    // Sự kiện cấm Bang! thì cấm cả phát này — nó vẫn là một Bang!. Nhưng hạn mức
    // Bang!/lượt KHÔNG áp, và đó là điểm khác biệt duy nhất của Doc Holyday.
    if (activeEffect(room).noBang) return { code: "event-bans-bang" };
    if (p.hand.length < 2) return { code: "card-not-in-hand" };
    if (legalTargetIds(room, p, "bang").length === 0) return { code: "invalid-target" };
    return null;
  }
  if (kind === "burn-blue-to-draw") {
    // "Lá xanh" theo bài in gốc gồm cả súng — bộ gốc in súng viền xanh. Engine tách "gun"
    // thành kind riêng, nên phải nhận cả hai, nếu không José Delgado mất đúng một nửa số
    // lá anh ta được phép đốt.
    const blue = p.hand.some((c) => isBlueBordered(c));
    return blue ? null : { code: "need-a-blue-card" };
  }
  return kind satisfies never;
}

// Kích hoạt được lá green này ngay bây giờ không. Cùng khuôn abilityProblem và cùng lý do:
// view dựng nút từ đây, engine nhận lệnh cũng qua đây.
export function greenProblem(room: Room, p: Player, cardId: string): GameError | null {
  const card = p.equipment.find((c) => c.id === cardId);
  if (!card) return { code: "card-not-in-hand" };
  const def = CARD_DEF_BY_ID[card.defId];
  if (def?.kind !== "green") return { code: "invalid-card" };
  // Nhóm "reaction" (Bible, Iron Plate, Sombrero, Ten Gallon Hat) không kích hoạt chủ
  // động — chúng trả lời một cửa phản ứng, và đi qua respond().
  if (def.greenUse !== "turn") return { code: "invalid-card" };
  if (!isGreenReady(room, card)) return { code: "green-not-ready" };
  if (room.pending) return { code: "waiting-for-reaction" };
  if (room.players[room.turnIndex]?.id !== p.id) return { code: "not-your-turn" };
  if (room.turnPhase !== "play") return { code: "not-your-turn" };
  if (room.jailedTurn) return { code: "jailed-discard-only" };

  // KHÔNG đọc bannedKinds ở đây, có chủ ý: tied-hands cấm ĐẶT một lá xuống trước mặt, còn
  // lá đã nằm sẵn trên bàn thì vẫn dùng được — y như một cái Barrel đã bày ra vẫn nổ.
  // Việc đặt xuống đi qua playBlock và đã bị chặn ở đó.
  const eff = activeEffect(room);
  if (eff.bannedDefIds?.includes(card.defId)) return { code: "event-bans-card", s: def.name };
  // Sự kiện cấm Bang! cấm cả năm lá green có hiệu ứng Bang! — chúng vẫn là Bang!. Nhưng
  // hạn mức Bang!/lượt thì KHÔNG áp: Rule 5.
  if (eff.noBang && def.target?.shoots) return { code: "event-bans-bang" };
  if (eff.noBang && card.defId === "howitzer") return { code: "event-bans-bang" };
  if (HEAL_DEF_IDS.includes(card.defId) && eff.noHeal) return { code: "event-forbids-heal" };
  if (card.defId === "canteen" && p.hp >= p.maxHp) return { code: "hp-full" };
  if (def.target && legalTargetIds(room, p, card.defId, card).length === 0) {
    return { code: "invalid-target" };
  }
  return null;
}

// "Không dùng được trong chính lượt vừa đánh ra." room.turnCounter chỉ tăng, nên "đã đi
// qua lượt đó" là toàn bộ luật — đúng cho cả nhóm kích hoạt trong lượt lẫn nhóm phản ứng
// ngoài lượt, mà không cần biết lượt của ai.
export function isGreenReady(room: Room, card: Card): boolean {
  return card.playedOnTurn == null || room.turnCounter > card.playedOnTurn;
}

// Lá green trên bàn có trả lời được cửa phản ứng `asDefId` không. Tách khỏi canUseAs vì
// nó hỏi thêm hai điều canUseAs không biết: lá đang nằm ở đâu, và đã chín chưa.
export function reactionOnTable(room: Room, card: Card, asDefId: string): boolean {
  const def = CARD_DEF_BY_ID[card.defId];
  return def?.greenUse === "reaction" && def.countsAs === asDefId && isGreenReady(room, card);
}

export function isBlueBordered(c: Card): boolean {
  const kind = CARD_DEF_BY_ID[c.defId]?.kind;
  return kind === "blue" || kind === "gun";
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
