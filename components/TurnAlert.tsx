"use client";

// "Đến lượt bạn!" — gọi người chơi trở lại khi họ đã chuyển sang tab khác.
//
// Vì sao cần: ván Bang không có đồng hồ đếm — server chờ vô hạn (xem broadcast()
// trong server.ts). Nên một người đang xem tab khác là CẢ BÀN đứng im, không ai
// biết vì sao. Đây là cách duy nhất để kéo họ về.
//
// Điều kiện báo rộng hơn "tới lượt": khi bạn là người phải phản ứng với một pending
// (bị Bang!, bị Indians!, đang hấp hối...) thì cả bàn bị treo chờ bạn — gấp hơn cả
// lượt thường. Nên gộp cả hai vào một khái niệm "cần bạn hành động".
//
// Ba kênh, vì không kênh nào một mình đủ:
//  - tiếng chuông: nghe được cả khi tab ẩn, nhưng vô dụng nếu máy đang tắt loa
//  - nhấp nháy tiêu đề tab: thấy được trên thanh tab, nhưng chỉ khi còn thấy browser
//  - thông báo hệ điều hành: xuyên qua cả khi browser bị thu nhỏ, nhưng cần cấp quyền
//
// Chỉ kích hoạt khi tab KHÔNG hiển thị. Đang mở game mà vẫn bị chuông với popup thì
// chỉ gây khó chịu, không thêm thông tin.

import { useEffect, useRef, useState } from "react";
import type { PlayerView } from "@/lib/types";
import { L, useLocale } from "@/lib/i18n";
import { getAlert, setAlert } from "@/lib/prefs";

// Chuông hai nốt bằng Web Audio — không cần file asset, không request ra ngoài.
// AudioContext riêng, không dùng chung với nhạc nền: tắt nhạc vẫn phải còn chuông.
let ctx: AudioContext | null = null;
function chime() {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    // Tab ẩn có thể làm context bị treo ở trạng thái "suspended".
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "triangle";
      osc.frequency.value = f;
      const t = now + i * 0.16;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  } catch {}
}

export default function TurnAlert({ view }: { view: PlayerView }) {
  const locale = useLocale();
  // Trạng thái lần trước, để chỉ báo đúng LÚC CHUYỂN sang cần hành động — không
  // phải mỗi lần server gửi view (mỗi lá bot đánh ra là một view mới).
  const wasWaiting = useRef(false);
  const baseTitle = useRef("");
  const flashTimer = useRef<ReturnType<typeof setInterval>>();

  // Cần bạn hành động: hoặc bạn phải phản ứng một pending, hoặc đang là lượt bạn.
  // Người đã chết / ván đã xong thì không.
  const needsYou =
    view.phase === "playing" &&
    view.you.alive &&
    (view.pending ? view.pending.youMustRespond : view.you.turnPhase !== null);

  // Việc gì đang chờ — đưa vào nội dung thông báo để biết mà không cần mở tab.
  const what = view.pending
    ? L(locale, "Bạn phải phản ứng!", "You must respond!")
    : view.you.turnPhase === "draw"
      ? L(locale, "Đến lượt bạn — rút bài!", "Your turn — draw!")
      : view.you.turnPhase === "discard"
        ? L(locale, "Đến lượt bạn — bỏ bài dư!", "Your turn — discard!")
        : L(locale, "Đến lượt bạn!", "Your turn!");

  // Dừng nhấp nháy và trả lại tiêu đề gốc.
  const stopFlash = () => {
    clearInterval(flashTimer.current);
    flashTimer.current = undefined;
    if (baseTitle.current) document.title = baseTitle.current;
  };

  useEffect(() => {
    const justBecameWaiting = needsYou && !wasWaiting.current;
    wasWaiting.current = needsYou;

    if (!needsYou) {
      stopFlash();
      return;
    }
    if (!justBecameWaiting) return; // đã báo rồi, đừng báo lại mỗi view
    if (!getAlert()) return; // người chơi đã tắt trong ⚙️
    if (!document.hidden) return; // đang xem game thì không cần gọi

    chime();

    if (!baseTitle.current) baseTitle.current = document.title;
    clearInterval(flashTimer.current);
    let on = false;
    flashTimer.current = setInterval(() => {
      on = !on;
      document.title = on ? `🔔 ${what}` : baseTitle.current;
    }, 900);

    // Thông báo hệ điều hành — chỉ khi người dùng đã cấp quyền trước đó. KHÔNG tự
    // xin quyền ở đây: popup xin quyền bật lên từ một tab đang ẩn là kiểu làm tệ,
    // và Chrome bỏ qua request không đến từ hành động của người dùng. Quyền được
    // xin từ nút trong ⚙️.
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const n = new Notification("🤠 Bang!", {
          body: what,
          tag: "bang-turn", // gộp, không xếp chồng nhiều thông báo
          requireInteraction: false,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {}
    }
  }, [needsYou, what]);

  // Quay lại tab là hết nhấp nháy ngay, không phải chờ tới khi đánh xong.
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) stopFlash();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, []);

  // Dọn khi rời phòng: tiêu đề tab là state toàn cục, để lại là nó nhấp nháy mãi.
  useEffect(() => () => stopFlash(), []);

  return null;
}

// Bật/tắt nhắc lượt, và xin quyền thông báo hệ điều hành. Nút xin quyền nằm ở đây
// (trong ⚙️) chứ không tự gọi lúc tới lượt: browser chặn request không phát sinh từ
// hành động người dùng, và bật popup xin quyền từ một tab đang ẩn là kiểu làm tệ.
export function AlertToggle() {
  const locale = useLocale();
  const [on, setOn] = useState(true);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  useEffect(() => {
    setOn(getAlert());
    setPerm("Notification" in window ? Notification.permission : "unsupported");
  }, []);

  const toggle = () => {
    setOn((cur) => {
      setAlert(!cur);
      return !cur;
    });
  };

  const ask = async () => {
    try {
      setPerm(await Notification.requestPermission());
    } catch {}
  };

  return (
    <>
      <button
        className="ghost"
        style={{ width: "100%", padding: "8px 10px", fontSize: 13, marginTop: 6 }}
        onClick={toggle}
      >
        {on
          ? L(locale, "🔔 Nhắc khi tới lượt: BẬT", "🔔 Turn alert: ON")
          : L(locale, "○ Nhắc khi tới lượt: TẮT", "○ Turn alert: OFF")}
      </button>
      {on && perm === "default" && (
        <button
          className="ghost"
          style={{ width: "100%", padding: "8px 10px", fontSize: 13, marginTop: 6 }}
          onClick={ask}
        >
          {L(locale, "Cho phép thông báo hệ thống", "Allow system notifications")}
        </button>
      )}
      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8, lineHeight: 1.45 }}>
        {on
          ? perm === "granted"
            ? L(
                locale,
                "Khi bạn ở tab khác: chuông + nhấp nháy tiêu đề tab + thông báo hệ thống.",
                "While you're on another tab: chime + flashing tab title + a system notification."
              )
            : perm === "denied"
              ? L(
                  locale,
                  "Chuông + nhấp nháy tiêu đề tab. Thông báo hệ thống đã bị chặn — mở lại trong cài đặt trình duyệt.",
                  "Chime + flashing tab title. System notifications are blocked — re-enable them in your browser settings."
                )
              : perm === "unsupported"
                ? L(
                    locale,
                    "Chuông + nhấp nháy tiêu đề tab. Trình duyệt này không hỗ trợ thông báo hệ thống.",
                    "Chime + flashing tab title. This browser has no system notifications."
                  )
                : L(
                    locale,
                    "Chuông + nhấp nháy tiêu đề tab. Cấp quyền ở trên để nhận cả thông báo hệ thống.",
                    "Chime + flashing tab title. Allow above to also get a system notification."
                  )
          : L(
              locale,
              "Sẽ không có gì gọi bạn về — cả bàn phải chờ nếu bạn đi mất.",
              "Nothing will call you back — the table waits if you wander off."
            )}
      </div>
    </>
  );
}
