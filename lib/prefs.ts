"use client";

// Tuỳ chọn hiển thị lưu trên máy người chơi (localStorage, khoá `bang:*` giống
// i18n / socketClient). Không đi qua server — chỉ ảnh hưởng cách render.

const FX_KEY = "bang:fx";
const INTRO_KEY = "bang:intro-seen";
const ALERT_KEY = "bang:alert";

// Hiệu ứng đồ hoạ nâng cao (bloom + viền tối). Mặc định BẬT; người
// chơi máy yếu có thể tắt trong menu Cài đặt để lấy lại FPS.
export function getFx(): boolean {
  try {
    return localStorage.getItem(FX_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setFx(on: boolean) {
  try {
    localStorage.setItem(FX_KEY, on ? "1" : "0");
  } catch {}
}

// Gọi người chơi về khi tới lượt / phải phản ứng, lúc tab đang ẩn. Mặc định BẬT:
// ván không có đồng hồ đếm nên một người đi mất là cả bàn đứng chờ vô hạn.
export function getAlert(): boolean {
  try {
    return localStorage.getItem(ALERT_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setAlert(on: boolean) {
  try {
    localStorage.setItem(ALERT_KEY, on ? "1" : "0");
  } catch {}
}

// Đã xem màn briefing chưa — để lần sau vào ván không bắt đọc lại từ đầu.
export function getIntroSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
}

export function setIntroSeen() {
  try {
    localStorage.setItem(INTRO_KEY, "1");
  } catch {}
}
