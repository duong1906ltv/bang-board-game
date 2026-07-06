// Bang! card catalog + deck builder.
//
// Data transcribed from the provided card list. The four per-suit counts in the
// source sum to each card's total copies; we assume the column order is
// Spades, Hearts, Diamonds, Clubs (anchored by Scope = A♠ and Barrel = ♠, both
// in the first column). Individual card RANKS (A..K) are not yet provided, so
// `rank` is null for now — the "Draw!" mechanics (Barrel/Dynamite/Jail/Lucky
// Duke/etc.) will need them to resolve exactly.

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export const SUIT_ORDER: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
export const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

// How a card is used:
//  - brown: played for a one-shot effect, then discarded
//  - blue : played face-up in front of a player, stays in play
//  - gun  : a blue card occupying the single weapon slot (sets base range)
export type CardKind = "brown" | "blue" | "gun";

export interface CardDef {
  id: string; // stable slug
  it: string; // Italian name (as printed)
  name: string; // English name
  kind: CardKind;
  count: number; // total copies in the deck
  suits: [number, number, number, number]; // copies per suit: [♠, ♥, ♦, ♣]
  range?: number; // weapon range (guns only)
  effect: string;
  notes?: string[];
}

export const CARD_DEFS: CardDef[] = [
  { id: "bang", it: "Bang!", name: "Bang!", kind: "brown", count: 25, suits: [1, 8, 3, 13],
    effect: "Bắn 1 mục tiêu trong tầm bắn của bạn." },
  { id: "missed", it: "Mancato!", name: "Missed!", kind: "brown", count: 12, suits: [7, 5, 0, 0],
    effect: "Hủy hiệu ứng của một lá Bang! nhắm vào bạn.",
    notes: ["Không dùng được trong Duel."] },
  { id: "beer", it: "Birra", name: "Beer", kind: "brown", count: 6, suits: [0, 0, 6, 0],
    effect: "Hồi 1 máu.",
    notes: [
      "Dynamite: nếu sắp nhận sát thương chí mạng từ Dynamite, có thể hủy toàn bộ bằng 1 Beer, về 1 máu.",
      "Rule 3: có thể dùng Beer để tự cứu khỏi sát thương chí mạng, kể cả khi mất hơn 1 máu.",
    ] },
  { id: "cat-balou", it: "Cat Balou", name: "Cat Balou", kind: "brown", count: 4, suits: [0, 0, 1, 3],
    effect: "Buộc 1 người chơi trong tầm 1 phải bỏ 1 lá bài.",
    notes: [
      "Có thể dùng lên chính mình để bỏ 1 lá cụ thể trên tay hoặc trên bàn.",
      "Bạn quyết định bỏ từ tay hay trên bàn, nhưng không chỉ định lá cụ thể của người khác.",
    ] },
  { id: "panic", it: "Panico!", name: "Panic!", kind: "brown", count: 4, suits: [0, 0, 3, 1],
    effect: "Rút 1 lá bài từ một người chơi ở khoảng cách 1.",
    notes: [
      "Không được cộng tầm từ súng; nhưng các lá tăng tầm (Scope...) thì có áp dụng.",
      "Có thể dùng Panic để nhặt 1 lá trên bàn của chính mình.",
    ] },
  { id: "duel", it: "Duello", name: "Duel", kind: "brown", count: 3, suits: [1, 1, 0, 1],
    effect: "Mục tiêu bỏ 1 Bang!, rồi tới bạn, luân phiên. Ai không bỏ được Bang! trước thì mất 1 máu.",
    notes: ["Rule 5"] },
  { id: "general-store", it: "Emporio", name: "General Store", kind: "brown", count: 2, suits: [1, 1, 0, 0],
    effect: "Lật số lá bằng số người chơi. Mỗi người lần lượt rút 1 lá." },
  { id: "indians", it: "Indiani!", name: "Indians!", kind: "brown", count: 2, suits: [0, 0, 0, 2],
    effect: "Tất cả người chơi khác phải bỏ 1 Bang! hoặc mất 1 máu." },
  { id: "stagecoach", it: "Diligenza", name: "Stagecoach", kind: "brown", count: 2, suits: [2, 0, 0, 0],
    effect: "Rút 2 lá bài." },
  { id: "wells-fargo", it: "Wells Fargo", name: "Wells Fargo", kind: "brown", count: 1, suits: [0, 0, 1, 0],
    effect: "Rút 3 lá bài." },
  { id: "gatling", it: "Gatling", name: "Gatling", kind: "brown", count: 1, suits: [0, 0, 1, 0],
    effect: "Bắn Bang! vào TẤT CẢ người chơi khác.",
    notes: ["Rule 5", "Mọi người chịu ảnh hưởng của vũ khí/nhân vật/vật phẩm tác động lên Bang! của bạn."] },
  { id: "saloon", it: "Saloon", name: "Saloon", kind: "brown", count: 1, suits: [0, 0, 1, 0],
    effect: "Tất cả người chơi (kể cả bạn) hồi 1 máu.",
    notes: ["Rule 3"] },
  { id: "mustang", it: "Mustang", name: "Mustang", kind: "blue", count: 2, suits: [0, 0, 2, 0],
    effect: "Người khác thấy bạn ở khoảng cách +1." },
  { id: "scope", it: "Mirino", name: "Scope", kind: "blue", count: 1, suits: [1, 0, 0, 0],
    effect: "Bạn thấy người khác ở khoảng cách −1." },
  { id: "barrel", it: "Barile", name: "Barrel", kind: "blue", count: 2, suits: [2, 0, 0, 0],
    effect: "Draw! ra Cơ (Hearts) thì coi như Missed!.",
    notes: ["Tính là 1 Missed! cho các hiệu ứng liên quan. Không được Draw! hai lần.", "Rule 2"] },
  { id: "jail", it: "Prigione", name: "Jail", kind: "blue", count: 3, suits: [2, 0, 1, 0],
    effect: "Draw! ra Cơ: bỏ Jail và chơi bình thường. Ngược lại bỏ Jail và bỏ lượt.",
    notes: ["Không dùng lên Sheriff.", "Nếu được đi lượt tiếp ngay, có thể đi."] },
  { id: "dynamite", it: "Dinamite", name: "Dynamite", kind: "blue", count: 1, suits: [0, 0, 1, 0],
    effect: "Draw! ra [2–9] Bích (Spades): mất 3 máu. Ngược lại chuyển Dynamite sang người bên trái.",
    notes: [
      "Thứ tự xử lý: Dynamite > Jail > Rattlesnake > Bomb.",
      "Rule 2: nếu người bên trái đã có Dynamite thì không chuyển sang họ.",
    ] },
  { id: "volcanic", it: "Volcanic", name: "Volcanic", kind: "gun", count: 2, suits: [1, 1, 0, 0], range: 1,
    effect: "Có thể chơi bao nhiêu lá Bang! tùy thích. Tầm bắn cơ bản 1.",
    notes: ["Rule 6"] },
  { id: "schofield", it: "Schofeld", name: "Schofield", kind: "gun", count: 3, suits: [1, 2, 0, 0], range: 2,
    effect: "Tầm bắn cơ bản 2.", notes: ["Rule 6"] },
  { id: "remington", it: "Remington", name: "Remington", kind: "gun", count: 1, suits: [0, 1, 0, 0], range: 3,
    effect: "Tầm bắn cơ bản 3.", notes: ["Rule 6"] },
  { id: "rev-carabine", it: "Rev. Carabine", name: "Rev. Carabine", kind: "gun", count: 1, suits: [0, 1, 0, 0], range: 4,
    effect: "Tầm bắn cơ bản 4.", notes: ["Rule 6"] },
  { id: "winchester", it: "Winchester", name: "Winchester", kind: "gun", count: 1, suits: [1, 0, 0, 0], range: 5,
    effect: "Tầm bắn cơ bản 5.", notes: ["Rule 6"] },
];

// Lookup by slug.
export const CARD_DEF_BY_ID: Record<string, CardDef> = Object.fromEntries(
  CARD_DEFS.map((d) => [d.id, d])
);

// A concrete card instance in the deck / a hand / the discard pile.
export interface Card {
  id: string; // unique instance id
  defId: string; // catalog slug
  name: string; // English name (denormalized for the client)
  suit: Suit;
  rank: number | null; // 1..13 (A=1, J=11, Q=12, K=13); null until ranks are provided
}

// Build the full 80-card deck honoring per-card suit counts. Ranks are left null
// for now (only needed once the Draw!-based rules are implemented).
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  let n = 0;
  for (const def of CARD_DEFS) {
    def.suits.forEach((count, si) => {
      const suit = SUIT_ORDER[si];
      for (let k = 0; k < count; k++) {
        deck.push({ id: `c${n++}`, defId: def.id, name: def.name, suit, rank: null });
      }
    });
  }
  return deck;
}

export const DECK_SIZE = CARD_DEFS.reduce((s, d) => s + d.count, 0);
