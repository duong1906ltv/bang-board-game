import { CARD_DEF_BY_ID } from "@/lib/cards";

export const PENDING_EMOJI: Record<string, string> = { bang: "🔫", dying: "💀", multi: "🎯", duel: "⚔️", store: "🏪", kit: "🎴", check: "🎲", taken: "🤲" };
export const CHECK_ICON: Record<string, string> = { dynamite: "🧨", jail: "⛓️", barrel: "🛢️", blackjack: "🎴", ghost: "👻" };
// Card name → definition, so a card mentioned in the log can be clicked to view it.
export const CARD_DEF_BY_NAME: Record<string, { id: string; name: string; effect: string }> = Object.fromEntries(
  Object.values(CARD_DEF_BY_ID).map((d) => [d.name, d])
);
