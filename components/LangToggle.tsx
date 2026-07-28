"use client";

// Language switcher shown in both the lobby header and the room header.
import { useLocale, setLocale } from "@/lib/i18n";

export function LangToggle({ padding = "6px 12px" }: { padding?: string }) {
  const locale = useLocale();
  return (
    <button
      className="ghost"
      style={{ width: "auto", padding }}
      onClick={() => setLocale(locale === "vi" ? "en" : "vi")}
      title="Đổi ngôn ngữ / Switch language"
    >
      {locale === "vi" ? "🇻🇳 VI" : "🇬🇧 EN"}
    </button>
  );
}
