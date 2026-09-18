"use client";

// Trang tra cứu: toàn bộ lá bài và nhân vật trong game.
//
// Là trang riêng chứ không phải hộp thoại trong phòng chờ vì nó có địa chỉ — gửi được
// cho người chưa từng chơi đọc trước, và mở được ở tab khác trong lúc đang chờ đủ người.
import { useEffect, useState } from "react";
import Link from "next/link";
import type { GameSet } from "@/lib/cards";
import { CARD_DEFS } from "@/lib/cards";
import { CHARACTERS } from "@/lib/types";
import { CardGallery } from "@/components/rules/CardGallery";
import { CharacterGallery } from "@/components/rules/CharacterGallery";
import { BrandMark } from "@/components/home/BrandMark";
import { L, useLocale, initLocale } from "@/lib/i18n";

type Tab = "cards" | "chars";
type SetFilter = GameSet | "all";

export default function Rules() {
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>("cards");
  const [set, setSet] = useState<SetFilter>("all");

  useEffect(() => {
    initLocale();
  }, []);

  const cardCount = CARD_DEFS.filter((d) => set === "all" || d.sets[set]).length;
  const charCount = CHARACTERS.filter((c) => set === "all" || c.set === set).length;

  const SETS: { key: SetFilter; label: string }[] = [
    { key: "all", label: L(locale, "Tất cả", "Everything") },
    { key: "base", label: L(locale, "Bộ gốc", "Base game") },
    { key: "dodgeCity", label: "Dodge City" },
  ];

  return (
    <main className="rules-wrap">
      <header className="rules-head">
        <Link href="/" className="rules-back">
          <BrandMark size={30} />
          <span>{L(locale, "Về trang chủ", "Back to home")}</span>
        </Link>
      </header>

      <h1 className="brand rules-title">{L(locale, "Bộ bài", "The deck")}</h1>
      <p className="muted tagline">
        {L(locale, "Mọi lá bài và mọi nhân vật, kể cả những thứ bạn chưa gặp.", "Every card and every character, including the ones you have not met yet.")}
      </p>

      <div className="seg-row">
        <div className="seg">
          <button className={tab === "cards" ? "on" : ""} onClick={() => setTab("cards")}>
            {L(locale, "Lá bài", "Cards")} <span className="muted">{cardCount}</span>
          </button>
          <button className={tab === "chars" ? "on" : ""} onClick={() => setTab("chars")}>
            {L(locale, "Nhân vật", "Characters")} <span className="muted">{charCount}</span>
          </button>
        </div>
        <div className="seg">
          {SETS.map((s) => (
            <button key={s.key} className={set === s.key ? "on" : ""} onClick={() => setSet(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "cards" ? <CardGallery set={set} /> : <CharacterGallery set={set} />}

      <p className="muted rules-note">
        {L(
          locale,
          "Số dưới mỗi lá là số bản in trong nọc, không phải số loại. DC = chỉ có trong Dodge City.",
          "The number under each card is how many copies are in the deck, not how many kinds. DC = Dodge City only."
        )}
      </p>
    </main>
  );
}
