"use client";

// Nền màn chờ: 16 tranh nhân vật chiếm hết khung, chuyển chậm sang nhau.
//
// Đây là art đã có sẵn trong public/characters — cùng bộ tranh dùng cho bảng nhân vật
// trong ván. Không vẽ thêm gì, chỉ là màn home trước giờ chưa dùng tấm nào.
//
// Vấn đề duy nhất phải xử lý: 16 tấm KHÔNG cùng tông. slab-the-killer là nội thất tối om,
// rose-doolan là trời xanh sa mạc sáng trưng. Ghép thô thì mỗi lần chuyển là một cú nháy
// như lỗi. Lớp grade trong globals.css (.backdrop-plate) mới là thứ gộp chúng lại —
// không phải component này.
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CHARACTER_PHOTO, CHARACTER_PHOTO_IDS } from "@/lib/characterArt";

// Tấm mở màn cố định, không xáo: server và client phải dựng cùng một cây DOM ở lần vẽ
// đầu. Chọn tấm tối nhất vì nó ăn lớp grade tốt nhất, và chữ đè lên đọc rõ ngay từ giây
// đầu thay vì đợi tấm sau.
const FIRST = "slab-the-killer";
const HOLD_MS = 7000;

interface Plates {
  srcs: [string, string];
  top: 0 | 1;
}

export function SaloonBackdrop() {
  const first = CHARACTER_PHOTO[FIRST] ?? CHARACTER_PHOTO[CHARACTER_PHOTO_IDS[0]];
  const [state, setState] = useState<Plates>({ srcs: [first, first], top: 0 });
  // Tấm sau đã được nạp src mới và đang đợi tải xong để lật. Là ref chứ không phải state
  // vì nó điều phối hai sự kiện, đổi nó không cần vẽ lại gì.
  const armed = useRef(false);

  useEffect(() => {
    // Người bật giảm chuyển động thì đứng yên một tấm — không hẹn giờ, không chuyển.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Xáo sau khi mount vì lý do hydration ở trên. Fisher–Yates trên bản sao.
    const rest = CHARACTER_PHOTO_IDS.filter((id) => id !== FIRST);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    if (rest.length === 0) return;

    let step = 0;
    const timer = setInterval(() => {
      const url = CHARACTER_PHOTO[rest[step % rest.length]];
      step++;
      armed.current = true;
      setState((s) => {
        const back = s.top === 0 ? 1 : 0;
        return { top: s.top, srcs: back === 0 ? [url, s.srcs[1]] : [s.srcs[0], url] };
      });
    }, HOLD_MS);

    return () => clearInterval(timer);
  }, []);

  // Chỉ lật khi tấm mới đã tải xong. Lật theo hẹn giờ thì trên mạng chậm sẽ thấy một
  // nhịp trống giữa hai tranh.
  const reveal = (layer: 0 | 1) => () => {
    if (!armed.current || layer === state.top) return;
    armed.current = false;
    setState((s) => ({ ...s, top: layer }));
  };

  return (
    <div className="backdrop" aria-hidden="true">
      {([0, 1] as const).map((i) => (
        <div key={i} className={`backdrop-plate${state.top === i ? " on" : ""}`}>
          <Image
            src={state.srcs[i]}
            alt=""
            fill
            sizes="100vw"
            // Tấm đầu là thứ quyết định "vào cái thấy ngay" — nó phải nằm trong preload.
            priority={i === 0}
            onLoad={reveal(i)}
          />
        </div>
      ))}
    </div>
  );
}
