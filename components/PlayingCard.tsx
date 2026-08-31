"use client";

// A CSS playing-card face used everywhere a Bang! card is shown (hand, table,
// General Store, Kit Carlson). Styled after a physical card: dark wooden frame
// with corner screws, aged-parchment interior, art panel in the middle. Art is
// an illustration from public/cards/ when present, else our vector art, else a
// per-type emoji icon.
import { useEffect, useState } from "react";
import {
  Card,
  CARD_DEF_BY_ID,
  CARD_ICON,
  SUIT_SYMBOL,
  cardArtFillsPanel,
  cardArtSources,
  rankLabel,
} from "@/lib/cards";

type Size = "sm" | "md";

const KIND_CLASS: Record<string, string> = {
  brown: "pc-brown",
  blue: "pc-blue",
  gun: "pc-gun",
};

// Name sizing. At md only names past 9 characters overflow; at sm the box is
// 56px and anything from 8 characters up needs the smaller size.
function nameSizeClass(name: string): string {
  if (name.length > 9) return " pc-name-long";
  if (name.length > 7) return " pc-name-mid";
  return "";
}

// Sources that failed to load once, shared by every card face so a missing
// illustration costs a single request for the whole session instead of one per
// rendered copy of the card.
const DEAD_SOURCES = new Set<string>();

export function PlayingCard({
  card,
  size = "md",
  onClick,
  selected,
  dimmed,
  title,
  hideCorner,
}: {
  card: Card;
  size?: Size;
  onClick?: () => void;
  selected?: boolean;
  dimmed?: boolean;
  title?: string;
  hideCorner?: boolean; // for synthetic cards (e.g. from the log) with no real suit/rank
}) {
  const def = CARD_DEF_BY_ID[card.defId];
  const [skip, setSkip] = useState(0);
  // The same component instance can be reused for a different card (e.g. the
  // 3D table's "active card" slot), so start the fallback chain over on change.
  useEffect(() => setSkip(0), [card.defId]);

  const sources = cardArtSources(card.defId);
  let img: string | undefined;
  for (let i = skip; i < sources.length; i++) {
    if (!DEAD_SOURCES.has(sources[i])) {
      img = sources[i];
      break;
    }
  }

  const red = card.suit === "hearts" || card.suit === "diamonds";
  const corner = `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;
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
    <div
      className={cls}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      title={title ?? def?.name}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
    >
      <div className="pc-frame">
        <div className={`pc-name${nameSizeClass(card.name)}`}>{card.name}</div>
        <div className="pc-center">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element -- local art with an onError source fallback; next/image cannot rotate sources
            <img
              key={img}
              className={cardArtFillsPanel(img) ? "pc-art pc-art-full" : "pc-art"}
              src={img}
              alt=""
              draggable={false}
              onError={() => {
                DEAD_SOURCES.add(img!);
                setSkip(sources.indexOf(img!) + 1);
              }}
            />
          ) : (
            <span className="pc-icon">{CARD_ICON[card.defId] ?? "🂠"}</span>
          )}
          {/* Range token for guns. The illustrations of the four long guns are
              near-identical, and at pcard-sm the effect line is hidden, so the
              number is the only thing telling them apart. */}
          {def?.range != null && <span className="pc-range">{def.range}</span>}
        </div>
        {def?.effect && <div className="pc-desc">{def.effect}</div>}
        {!hideCorner && <span className="pc-corner">{corner}</span>}
      </div>
    </div>
  );
}
