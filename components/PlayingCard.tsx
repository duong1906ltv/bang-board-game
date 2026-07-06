"use client";

// A CSS playing-card face used everywhere a Bang! card is shown (hand, table,
// General Store, Kit Carlson). No copyrighted art — a per-type emoji icon plus
// an optional image slot (CARD_IMAGE) that can hold your own / AI-generated art.
import { Card, CARD_DEF_BY_ID, CARD_ICON, CARD_IMAGE, SUIT_SYMBOL, rankLabel } from "@/lib/cards";

type Size = "sm" | "md";

const KIND_CLASS: Record<string, string> = {
  brown: "pc-brown",
  blue: "pc-blue",
  gun: "pc-gun",
};

export function PlayingCard({
  card,
  size = "md",
  onClick,
  selected,
  dimmed,
  title,
}: {
  card: Card;
  size?: Size;
  onClick?: () => void;
  selected?: boolean;
  dimmed?: boolean;
  title?: string;
}) {
  const def = CARD_DEF_BY_ID[card.defId];
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const corner = `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;
  const img = CARD_IMAGE[card.defId];
  const cls = [
    "pcard",
    `pcard-${size}`,
    KIND_CLASS[def?.kind ?? "brown"],
    red ? "pc-red" : "pc-black",
    selected ? "pc-selected" : "",
    dimmed ? "pc-dimmed" : "",
    onClick ? "pc-click" : "",
  ].join(" ");

  return (
    <div className={cls} onClick={onClick} title={title ?? def?.name}>
      <div className="pc-name">{card.name}</div>
      <div className="pc-center" style={img ? { backgroundImage: `url(${img})` } : undefined}>
        {!img && <span className="pc-icon">{CARD_ICON[card.defId] ?? "🂠"}</span>}
      </div>
      {def?.effect && <div className="pc-desc">{def.effect}</div>}
      <span className="pc-corner">{corner}</span>
    </div>
  );
}
