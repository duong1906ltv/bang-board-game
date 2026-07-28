// Bang! card catalog + deck builder.
//
// Each card type carries an explicit `spec` listing the exact cards in the deck
// (suit + rank), transcribed from the provided card-value list. Range notation
// like "2D-AD" mirrors the source and expands over the rank order
// 2,3,…,10,J,Q,K,A (Ace high within ranges; stored as rank 1).

import { CARD_ART, CARD_PHOTO } from "./cardArt";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

const SUIT_LETTER: Record<string, Suit> = {
  S: "spades",
  C: "clubs",
  H: "hearts",
  D: "diamonds",
};

// Rank order used when expanding a "start-end" range (Ace high).
const RANK_SEQ = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1];

// Face-card letters <-> numeric rank (number ranks map to themselves).
const FACE_RANK: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };
const RANK_FACE: Record<number, string> = { 1: "A", 11: "J", 12: "Q", 13: "K" };

export function rankLabel(rank: number): string {
  return RANK_FACE[rank] ?? String(rank);
}

// How a card is used:
//  - brown: played for a one-shot effect, then discarded
//  - blue : played face-up in front of a player, stays in play
//  - gun  : a blue card occupying the single weapon slot (sets base range)
export type CardKind = "brown" | "blue" | "gun";

// Who a card may be aimed at. Data, not code: the engine validates plays against
// this AND publishes the resolved list of legal target ids in the view, so the UI
// cannot disagree with the rules it is drawing crosshairs for.
export interface TargetRule {
  self?: boolean; // may be aimed at yourself (Cat Balou, to bin your own card)
  maxDistance?: number | "range"; // "range" = the actor's weapon range
  needsCards?: boolean; // the target must hold or have something to take
  notSheriff?: boolean; // Jail
  notAlreadyHolding?: boolean; // Jail: not on someone already jailed
  shoots?: boolean; // counts as a shot, so Truce protects the Sheriff from it
}

export interface CardDef {
  id: string; // stable slug
  it: string; // Italian name (as printed)
  name: string; // English name
  kind: CardKind;
  count: number; // total copies in the deck (sanity check against `spec`)
  spec: string; // exact card values, e.g. "AS 2D-AD 2C-9C QH-AH"
  range?: number; // weapon range (guns only)
  effect: string;
  target?: TargetRule; // present only for cards that are aimed at somebody
  notes?: string[];
}

export const CARD_DEFS: CardDef[] = [
  { id: "bang", it: "Bang!", name: "Bang!", kind: "brown", count: 25, spec: "AS 2D-AD 2C-9C QH-AH",
    effect: "Bắn 1 mục tiêu trong tầm bắn của bạn.",
    target: { maxDistance: "range", shoots: true } },
  { id: "missed", it: "Mancato!", name: "Missed!", kind: "brown", count: 12, spec: "10C-AC 2S-8S",
    effect: "Hủy hiệu ứng của một lá Bang! nhắm vào bạn.",
    notes: ["Không dùng được trong Duel."] },
  { id: "beer", it: "Birra", name: "Beer", kind: "brown", count: 6, spec: "6H-JH",
    effect: "Hồi 1 máu.",
    notes: [
      "Dynamite: nếu sắp nhận sát thương chí mạng từ Dynamite, có thể hủy toàn bộ bằng 1 Beer, về 1 máu.",
      "Rule 3: có thể dùng Beer để tự cứu khỏi sát thương chí mạng, kể cả khi mất hơn 1 máu.",
    ] },
  { id: "cat-balou", it: "Cat Balou", name: "Cat Balou", kind: "brown", count: 4, spec: "KH 9D-JD",
    effect: "Buộc 1 người chơi bất kỳ (mọi khoảng cách) phải bỏ 1 lá bài.",
    target: { self: true, needsCards: true },
    notes: [
      "Có thể dùng lên chính mình để bỏ 1 lá cụ thể trên tay hoặc trên bàn.",
      "Bạn quyết định bỏ từ tay hay trên bàn, nhưng không chỉ định lá cụ thể của người khác.",
    ] },
  { id: "panic", it: "Panico!", name: "Panic!", kind: "brown", count: 4, spec: "JH QH AH 8D",
    effect: "Rút 1 lá bài từ một người chơi ở khoảng cách 1.",
    target: { maxDistance: 1, needsCards: true },
    notes: [
      "Không được cộng tầm từ súng; nhưng các lá tăng tầm (Scope...) thì có áp dụng.",
      "Có thể dùng Panic để nhặt 1 lá trên bàn của chính mình.",
    ] },
  { id: "duel", it: "Duello", name: "Duel", kind: "brown", count: 3, spec: "QD JS 8C",
    effect: "Mục tiêu bỏ 1 Bang!, rồi tới bạn, luân phiên. Ai không bỏ được Bang! trước thì mất 1 máu.",
    target: {},
    notes: ["Rule 5"] },
  { id: "general-store", it: "Emporio", name: "General Store", kind: "brown", count: 2, spec: "9C QS",
    effect: "Lật số lá bằng số người chơi. Mỗi người lần lượt rút 1 lá." },
  { id: "indians", it: "Indiani!", name: "Indians!", kind: "brown", count: 2, spec: "KD AD",
    effect: "Tất cả người chơi khác phải bỏ 1 Bang! hoặc mất 1 máu." },
  { id: "stagecoach", it: "Diligenza", name: "Stagecoach", kind: "brown", count: 2, spec: "9S 9S",
    effect: "Rút 2 lá bài." },
  { id: "wells-fargo", it: "Wells Fargo", name: "Wells Fargo", kind: "brown", count: 1, spec: "3H",
    effect: "Rút 3 lá bài." },
  { id: "gatling", it: "Gatling", name: "Gatling", kind: "brown", count: 1, spec: "10H",
    effect: "Bắn Bang! vào TẤT CẢ người chơi khác.",
    notes: ["Rule 5", "Mọi người chịu ảnh hưởng của vũ khí/nhân vật/vật phẩm tác động lên Bang! của bạn."] },
  { id: "saloon", it: "Saloon", name: "Saloon", kind: "brown", count: 1, spec: "5H",
    effect: "Tất cả người chơi (kể cả bạn) hồi 1 máu.",
    notes: ["Rule 3"] },
  { id: "mustang", it: "Mustang", name: "Mustang", kind: "blue", count: 2, spec: "8H 9H",
    effect: "Người khác thấy bạn ở khoảng cách +1." },
  { id: "scope", it: "Mirino", name: "Scope", kind: "blue", count: 1, spec: "AS",
    effect: "Bạn thấy người khác ở khoảng cách −1." },
  { id: "barrel", it: "Barile", name: "Barrel", kind: "blue", count: 2, spec: "QS KS",
    effect: "Draw! ra Cơ (Hearts) thì coi như Missed!.",
    notes: ["Tính là 1 Missed! cho các hiệu ứng liên quan. Không được Draw! hai lần.", "Rule 2"] },
  { id: "jail", it: "Prigione", name: "Jail", kind: "blue", count: 3, spec: "JS 4H 10S",
    effect: "Draw! ra Cơ: bỏ Jail và chơi bình thường. Ngược lại bỏ Jail và bỏ lượt.",
    target: { notSheriff: true, notAlreadyHolding: true },
    notes: ["Không dùng lên Sheriff.", "Nếu được đi lượt tiếp ngay, có thể đi."] },
  { id: "dynamite", it: "Dinamite", name: "Dynamite", kind: "blue", count: 1, spec: "2H",
    effect: "Draw! ra [2–9] Bích (Spades): mất 3 máu. Ngược lại chuyển Dynamite sang người bên trái.",
    notes: [
      "Thứ tự xử lý: Dynamite > Jail > Rattlesnake > Bomb.",
      "Rule 2: nếu người bên trái đã có Dynamite thì không chuyển sang họ.",
    ] },
  { id: "volcanic", it: "Volcanic", name: "Volcanic", kind: "gun", count: 2, spec: "10S 10C", range: 1,
    effect: "Có thể chơi bao nhiêu lá Bang! tùy thích. Tầm bắn cơ bản 1.",
    notes: ["Rule 6"] },
  { id: "schofield", it: "Schofeld", name: "Schofield", kind: "gun", count: 3, spec: "JC QC KS", range: 2,
    effect: "Tầm bắn cơ bản 2.", notes: ["Rule 6"] },
  { id: "remington", it: "Remington", name: "Remington", kind: "gun", count: 1, spec: "KC", range: 3,
    effect: "Tầm bắn cơ bản 3.", notes: ["Rule 6"] },
  { id: "rev-carabine", it: "Rev. Carabine", name: "Rev. Carabine", kind: "gun", count: 1, spec: "AC", range: 4,
    effect: "Tầm bắn cơ bản 4.", notes: ["Rule 6"] },
  { id: "winchester", it: "Winchester", name: "Winchester", kind: "gun", count: 1, spec: "8S", range: 5,
    effect: "Tầm bắn cơ bản 5.", notes: ["Rule 6"] },
];

// Lookup by slug.
export const CARD_DEF_BY_ID: Record<string, CardDef> = Object.fromEntries(
  CARD_DEFS.map((d) => [d.id, d])
);

// Last-resort glyph, when a card has neither an illustration nor vector art.
export const CARD_ICON: Record<string, string> = {
  bang: "💥",
  missed: "🛡️",
  beer: "🍺",
  "cat-balou": "✋",
  panic: "🤏",
  duel: "⚔️",
  "general-store": "🏪",
  indians: "🏹",
  stagecoach: "🚚",
  "wells-fargo": "💰",
  gatling: "🔥",
  saloon: "🍻",
  mustang: "🐎",
  scope: "🔭",
  barrel: "🛢️",
  jail: "⛓️",
  dynamite: "🧨",
  volcanic: "🔫",
  schofield: "🔫",
  remington: "🔫",
  "rev-carabine": "🔫",
  winchester: "🔫",
};

// Optional per-card artwork (data URI or path). Original SVG art lives in
// cardArt.ts; add more entries there (or your own images) to illustrate cards.
const CARD_IMAGE: Record<string, string> = CARD_ART;

// Illustrated art under public/cards/. Tried before CARD_IMAGE.
const CARD_PHOTO_IMAGE: Record<string, string> = CARD_PHOTO;

// The art sources for a card, best first. Renderers walk this list and drop to
// the next entry whenever one fails to load (missing file, decode error), so a
// half-finished illustration set never leaves an empty card face.
export function cardArtSources(defId: string): string[] {
  return [CARD_PHOTO_IMAGE[defId], CARD_IMAGE[defId]].filter(Boolean) as string[];
}

// Illustrations under public/cards/ are pre-padded to roughly the art panel's
// aspect (see scripts/import-card-art.sh), so they fill it edge to edge with no
// visible letterbox band; the vector art (data URIs) is letterboxed instead.
export function cardArtFillsPanel(src: string | undefined): boolean {
  return !!src && !src.startsWith("data:");
}

// --- spec parsing ---

function parseCardToken(tok: string): { suit: Suit; rank: number } {
  const suit = SUIT_LETTER[tok.slice(-1)];
  const rankStr = tok.slice(0, -1);
  const rank = FACE_RANK[rankStr] ?? parseInt(rankStr, 10);
  if (!suit || Number.isNaN(rank)) throw new Error(`Bad card token: ${tok}`);
  return { suit, rank };
}

// Expand one spec token: a single card ("AS") or an inclusive range ("2D-AD").
function expandToken(tok: string): { suit: Suit; rank: number }[] {
  if (!tok.includes("-")) return [parseCardToken(tok)];
  const [a, b] = tok.split("-");
  const start = parseCardToken(a);
  const end = parseCardToken(b);
  if (start.suit !== end.suit) throw new Error(`Range spans suits: ${tok}`);
  const i0 = RANK_SEQ.indexOf(start.rank);
  const i1 = RANK_SEQ.indexOf(end.rank);
  const out: { suit: Suit; rank: number }[] = [];
  for (let i = i0; i <= i1; i++) out.push({ suit: start.suit, rank: RANK_SEQ[i] });
  return out;
}

function parseSpec(spec: string): { suit: Suit; rank: number }[] {
  return spec.trim().split(/\s+/).flatMap(expandToken);
}

// A concrete card instance in the deck / a hand / the discard pile.
export interface Card {
  id: string; // unique instance id
  defId: string; // catalog slug
  name: string; // English name (denormalized for the client)
  suit: Suit;
  rank: number; // 1..13 (A=1, J=11, Q=12, K=13)
  // Who put this card into play. Only Dynamite needs it: it drifts from player to
  // player, so when it finally goes off the engine still has to know who lit it in
  // order to pay out the Outlaw bounty. Held on the card instance rather than on the
  // room, so discarding it and playing it again re-attributes correctly.
  playedBy?: string;
}

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  let n = 0;
  for (const def of CARD_DEFS) {
    const cards = parseSpec(def.spec);
    if (cards.length !== def.count) {
      throw new Error(`${def.id}: spec has ${cards.length} cards but count=${def.count}`);
    }
    for (const c of cards) {
      deck.push({ id: `c${n++}`, defId: def.id, name: def.name, suit: c.suit, rank: c.rank });
    }
  }
  return deck;
}
