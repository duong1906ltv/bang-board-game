"use client";

// 31 nhân vật. Bản in nào cũng có một dòng năng lực và một số máu, nên thẻ nhân vật
// dùng lại y nguyên CharacterFace của phần bốc nhân vật đầu ván — cùng một vật.
import { useMemo } from "react";
import { CHARACTERS } from "@/lib/types";
import type { GameSet } from "@/lib/cards";
import { CharacterFace } from "@/components/room/CharacterFace";

export function CharacterGallery({ set }: { set: GameSet | "all" }) {
  const shown = useMemo(
    () => CHARACTERS.filter((c) => set === "all" || c.set === set),
    [set]
  );

  return (
    <div className="gallery">
      {shown.map((c) => (
        <div key={c.id} className="gallery-item">
          <CharacterFace c={c} />
        </div>
      ))}
    </div>
  );
}
