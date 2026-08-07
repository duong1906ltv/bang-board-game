"use client";

// Tuỳ chọn hiển thị lưu trên máy người chơi (localStorage, khoá `bang:*` giống
// i18n / socketClient). Không đi qua server — chỉ ảnh hưởng cách render.

const FX_KEY = "bang:fx";
const INTRO_KEY = "bang:intro-seen";
const ALERT_KEY = "bang:alert";
const SHOTCAM_KEY = "bang:shotcam";
const MODELS_KEY = "bang:models";
const SFX_KEY = "bang:sfx";
const LOWSPEC_KEY = "bang:lowspec";

// localStorage có thể ném (chế độ riêng tư, cookie bị chặn) nên mọi truy cập đều
// bọc try/catch và rơi về mặc định.
function getBool(key: string, dflt: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? dflt : v === "1";
  } catch {
    return dflt;
  }
}

function setBool(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {}
}

// Hiệu ứng đồ hoạ nâng cao (bloom + viền tối). Mặc định BẬT; người
// chơi máy yếu có thể tắt trong menu Cài đặt để lấy lại FPS.
export const getFx = () => getBool(FX_KEY, true);
export const setFx = (on: boolean) => setBool(FX_KEY, on);

// Cắt cảnh cận mặt người bắn mỗi phát Bang!. 25/80 lá trong bộ là Bang! nên nó nổ
// ra ở khoảng 1/3 số lượt — đủ dày để phải bật/tắt được ngay giữa ván.
export const getShotCam = () => getBool(SHOTCAM_KEY, true);
export const setShotCam = (on: boolean) => setBool(SHOTCAM_KEY, on);

// Cao bồi 3D thay cho hình khối. Đường lui cho máy yếu: model có animation buộc
// phải vẽ lại bóng đổ mỗi khi có người bắn, hình khối thì không.
export const getModels = () => getBool(MODELS_KEY, true);
export const setModels = (on: boolean) => setBool(MODELS_KEY, on);

// Tiếng súng, cùng nhịp với getShotCam ở trên.
export const getSfx = () => getBool(SFX_KEY, true);
export const setSfx = (on: boolean) => setBool(SFX_KEY, on);

// Chế độ cấu hình thấp. Khác hẳn ba công tắc trên: chúng bỏ bớt THỨ để vẽ, còn cái
// này đổi CÁCH vẽ từng pixel — bỏ khử răng cưa, hạ độ phân giải, tắt bóng đổ, bớt
// nguồn sáng, và đổi vật liệu của những mặt lấp kín màn hình sang loại rẻ hơn.
//
// Sinh ra vì tắt cả ba công tắc kia vẫn không cứu được máy yếu: hình học của cảnh
// chỉ 25 nghìn tam giác, nút thắt nằm ở tốc độ lấp pixel — 44 vật liệu PBR nhân với
// 7 nguồn sáng, mà căn phòng thì không nằm sau công tắc nào cả.
export const getLowSpec = () => getBool(LOWSPEC_KEY, false);
export const setLowSpec = (on: boolean) => setBool(LOWSPEC_KEY, on);

// Gọi người chơi về khi tới lượt / phải phản ứng, lúc tab đang ẩn. Mặc định BẬT:
// ván không có đồng hồ đếm nên một người đi mất là cả bàn đứng chờ vô hạn.
export const getAlert = () => getBool(ALERT_KEY, true);
export const setAlert = (on: boolean) => setBool(ALERT_KEY, on);

// Đã xem màn briefing chưa — để lần sau vào ván không bắt đọc lại từ đầu.
export const getIntroSeen = () => getBool(INTRO_KEY, false);
export const setIntroSeen = () => setBool(INTRO_KEY, true);
