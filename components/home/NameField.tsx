"use client";

// Ô xưng danh + nút xúc xắc phát lại biệt danh.
//
// Có trạng thái điều khiển từ ngoài (page.tsx giữ `name`) vì cái tên đó còn đi vào
// createRoom/joinRoom/localStorage — component này chỉ lo phần nhìn và phần đổi tên.
import { L, useLocale } from "@/lib/i18n";
import { randomOutlawName } from "@/lib/outlaw-names";

// Con xúc xắc vẽ tay thay vì dùng emoji 🎲: emoji ăn theo font hệ điều hành, mỗi máy một
// hình và không nhận màu theo trạng thái nút.
function Die() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.5" y="2.5" width="15" height="15" rx="3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <g fill="currentColor">
        <circle cx="6.8" cy="6.8" r="1.5" />
        <circle cx="10" cy="10" r="1.5" />
        <circle cx="13.2" cy="13.2" r="1.5" />
      </g>
    </svg>
  );
}

export function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const locale = useLocale();
  const reroll = L(locale, "Phát biệt danh khác", "Deal another name");

  return (
    <>
      <label htmlFor="name">{L(locale, "Xưng danh", "State your name")}</label>
      <div className="name-row">
        <input
          id="name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={L(locale, "Bill Cà Nhắc", "Limping Bill")}
          maxLength={20}
        />
        <button type="button" className="reroll" onClick={() => onChange(randomOutlawName(locale, value))} title={reroll} aria-label={reroll}>
          <Die />
        </button>
      </div>
    </>
  );
}
