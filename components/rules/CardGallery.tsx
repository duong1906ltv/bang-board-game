"use client";

// Toàn bộ 44 loại lá, gom theo màu viền — đúng cách bộ bài thật phân nhóm.
import { useMemo } from "react";
import { CARD_DEFS, type Card, type CardDef, type CardKind, type GameSet } from "@/lib/cards";
import { PlayingCard } from "@/components/PlayingCard";
import { L, useLocale, type Locale } from "@/lib/i18n";

// Lá mẫu để đưa cho PlayingCard. Chất và số để bừa rồi tắt góc bằng `hideCorner`: mỗi
// loại lá có nhiều bản in với chất khác nhau, nên hiện một chất cụ thể là nói sai.
const sample = (d: CardDef): Card => ({ id: d.id, defId: d.id, name: d.name, suit: "spades", rank: 1 });

const ORDER: CardKind[] = ["brown", "blue", "green", "gun"];

function kindLabel(l: Locale, k: CardKind): string {
  if (k === "brown") return L(l, "Viền nâu — đánh rồi bỏ", "Brown — play and discard");
  if (k === "blue") return L(l, "Viền xanh — đặt trước mặt", "Blue — stays in play");
  if (k === "green") return L(l, "Viền vàng — chờ một lượt rồi dùng", "Yellow — wait a turn, then use");
  return L(l, "Súng", "Guns");
}

export function CardGallery({ set }: { set: GameSet | "all" }) {
  const locale = useLocale();
  const groups = useMemo(() => {
    const shown = CARD_DEFS.filter((d) => (set === "all" ? true : !!d.sets[set]));
    return ORDER.map((k) => ({ kind: k, defs: shown.filter((d) => d.kind === k) })).filter((g) => g.defs.length > 0);
  }, [set]);

  return (
    <>
      {groups.map(({ kind, defs }) => (
        <section key={kind}>
          <h3 className="gallery-heading">
            {kindLabel(locale, kind)}
            <span className="muted"> · {defs.length}</span>
          </h3>
          <div className="gallery">
            {defs.map((d) => {
              // Số bản in trong từng bộ. Người chơi hay hỏi "có mấy lá Bang! trong nọc"
              // và đó là câu trả lời, không phải số loại.
              const base = d.sets.base?.count ?? 0;
              const dc = d.sets.dodgeCity?.count ?? 0;
              const copies = set === "all" ? base + dc : (d.sets[set as GameSet]?.count ?? 0);
              return (
                <figure key={d.id} className="gallery-item">
                  <PlayingCard card={sample(d)} hideCorner title={d.effect} />
                  <figcaption>
                    ×{copies}
                    {set === "all" && dc > 0 && base > 0 && <span className="muted"> ({base}+{dc})</span>}
                    {set === "all" && dc > 0 && base === 0 && <span className="dc-tag">DC</span>}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
