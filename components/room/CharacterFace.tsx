"use client";

import { Character } from "@/lib/types";
import { CHARACTER_PHOTO } from "@/lib/characterArt";
import { L, useLocale, charAbility } from "@/lib/i18n";

// The character as a playing card, matching the printed ones. Shown in the draft
// (two side by side) and in the review popups.
//
// The height is FIXED rather than fitting the text: the draft shows two of these next
// to each other, and 226px is the tallest any of the 16 abilities needs in either
// language (measured against this exact CSS — the longest, Kit Carlson, overflows
// below 216). Short abilities leave empty space instead of shrinking the card.
export function CharacterFace({ c }: { c: Character }) {
  const locale = useLocale();
  const portrait = CHARACTER_PHOTO[c.id];
  return (
    // `pc-frame` and `pcard-md` are both load-bearing, not decoration:
    //  - `.pcard` is `display: flex` with the default ROW direction; the column
    //    stacking lives on `.pc-frame`. Without that wrapper the name, art and
    //    ability laid out side by side, `.pc-center` (flex: 1) swallowed the width,
    //    and every text child got squeezed to nothing by its own `overflow: hidden`.
    //  - font-size for `.pc-name` / `.pc-desc` is only ever declared under a size
    //    class, so without `pcard-md` the ability text had no size at all.
    // The inline width/height still override the size class's fixed box.
    <div className="pcard pcard-md pc-character" style={{ width: 168, height: 226 }}>
      <div className="pc-frame">
        <div className="pc-name" style={{ fontSize: "0.72rem" }}>{c.name}</div>
        <div className="pc-center" style={{ height: 132, flex: "0 0 auto" }}>
          {portrait ? (
            <img className="pc-art pc-art-full" src={portrait} alt="" draggable={false} />
          ) : (
            <span className="pc-icon" style={{ fontSize: "2.6rem" }}>🤠</span>
          )}
          <span className="pc-lives" title={`${c.maxHp} ${L(locale, "máu", "life")}`}>
            {Array.from({ length: c.maxHp }, (_, i) => (
              <span key={i} className="pc-life">❤</span>
            ))}
          </span>
        </div>
        <div
          className="pc-desc"
          style={{
            display: "block", // drop the -webkit-box clamp: the ability must read in full
            WebkitLineClamp: "unset" as unknown as number,
            fontSize: "0.58rem",
            lineHeight: 1.32,
            padding: "5px 4px 4px",
            flex: "1 1 auto", // short abilities leave space below, they don't re-centre
          }}
        >
          {charAbility(locale, c.id)}
        </div>
      </div>
    </div>
  );
}
