"use client";

// Một luật bàn: tên, nút bật/tắt, và phần giải thích GẤP LẠI sẵn.
//
// Ba đoạn giải thích trước đây luôn mở nên chiếm gần hết phòng chờ — người đã biết luật
// phải cuộn qua chúng mỗi ván. Nhãn nút đã tự nói trạng thái ("Dodge City: TẮT"), phần
// còn lại để dành cho ai bấm hỏi.
import { useState } from "react";
import { L, useLocale } from "@/lib/i18n";

export function RuleRow({
  label,
  state,
  canEdit,
  onToggle,
  on,
  description,
}: {
  label: string;
  state: string; // nhãn trạng thái đã dịch sẵn, ví dụ "Dodge City: BẬT"
  canEdit: boolean;
  onToggle: () => void;
  on: boolean;
  description: string;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <div className="rule-row">
      <div className="rule-head">
        <span className="rule-label">{label}</span>
        {canEdit ? (
          <button className={`rule-toggle${on ? " on" : ""}`} onClick={onToggle}>
            {state}
          </button>
        ) : (
          <span className={`rule-toggle static${on ? " on" : ""}`}>{state}</span>
        )}
        <button className="rule-more" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? L(locale, "Ẩn", "Hide") : L(locale, "Là gì?", "What is it?")}
        </button>
      </div>
      {open && <p className="rule-desc">{description}</p>}
    </div>
  );
}
