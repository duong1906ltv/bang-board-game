// The draw pile, and the one-line reads that go with it.
//
// Bottom of the stack alongside state.ts: nothing here knows about turns, cards
// being played, or damage. It only knows how to take a card off the deck.

import { Card, DeckSets } from "../cards";
import { CHARACTERS, Character, CharacterEffect } from "../types";
import { Player, Room, shuffle } from "./state";

export function drawOne(room: Room): Card | null {
  if (room.deck.length === 0) {
    if (room.discard.length === 0) return null;
    room.deck = shuffle(room.discard);
    room.discard = [];
  }
  return room.deck.pop() ?? null;
}

// Ai được phép xuất hiện trong lượt chọn nhân vật. Cùng khuôn với buildDeck: `base`
// luôn có mặt vì nó là game, toggle chỉ quyết định có đổ thêm bộ mở rộng vào hay không.
// Một hàm chứ không phải lọc tại chỗ ở startGame, vì test cần hỏi thẳng câu này.
export function charactersInPlay(sets?: DeckSets): Character[] {
  if (sets?.dodgeCity) return CHARACTERS;
  return CHARACTERS.filter((c) => c.set === "base");
}

// A player's character ability, as data. Absent character (or a character with no
// declarative effect) reads as "no modifiers", so every checkpoint below can be
// written without a null check.
export function charEffect(p: Player | null | undefined): CharacterEffect {
  return p?.character?.effect ?? {};
}

export function beersInHand(p: Player): number {
  return p.hand.filter((c) => c.defId === "beer").length;
}

// Draw n cards into a hand, returning how many were actually dealt: the deck can
// run dry mid-draw (drawOne returns null once the discard pile is empty too).
export function drawInto(room: Room, hand: Card[], n: number): number {
  let got = 0;
  for (let i = 0; i < n; i++) {
    const c = drawOne(room);
    if (!c) break;
    hand.push(c);
    got++;
  }
  return got;
}
