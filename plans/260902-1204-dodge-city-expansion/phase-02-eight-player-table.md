# Phase 02 — Bàn 8 người

**Ngữ cảnh:** [plan.md](plan.md) · [phase 01](phase-01-deck-infrastructure-and-toggle.md) · **số đo:** [evidence/phase-02-eight-seats.md](evidence/phase-02-eight-seats.md)

## Tổng quan

**Ưu tiên:** trung bình · **Trạng thái:** 🟡 xong phần luật + số đo, còn ảnh · **Phụ thuộc:** phase 01

Nâng trần từ 7 lên 8 người theo luật Dodge City. Đây là **bài toán 3D**, không phải bài
toán luật — tách riêng vì thế.

## Nhận định then chốt

- **`checkWin` đã đúng sẵn với 2 Renegade.** `lib/game/index.ts:1838-1850` dùng `.every()`
  cho "renegade chết hết" và cho renegade thắng khi `alive.length === 1`. Không sửa gì,
  nhưng **phải có test** — hiện chưa ai chứng minh điều đó.
- **`AVATAR_COLORS` chỉ có 7 màu** (`components/three/scene/geometry.ts:28`) và index bằng
  `% length`. Bàn 8 người → hai người mặc áo trùng màu, không phân biệt được trên bàn 3D.
- `layout(nOpp)` đã tham số hoá: `ring = 1.4 + 0.13*nOpp`, `arc = min(1.5, 0.6+0.15*nOpp)*π`.
  Với 7 đối thủ, `arc` chạm trần 1.5 (270°) — cần kiểm mắt xem 7 người có bị dồn không.

## Yêu cầu

**Chức năng**
- `MAX_PLAYERS = 8`; `ROLE_SETUP[8] = 1 sheriff, 2 deputy, 3 outlaw, 2 renegade`.
- Renegade chỉ thắng khi là người sống cuối cùng — kể cả khi renegade kia đã chết.
- 8 người ngồi đều quanh nỉ, không đè nhau, không ai lọt khỏi khung hình.
- 8 màu áo phân biệt được.

**Phi chức năng**
- Toạ độ ghế **tính bằng số**, không đặt bằng cảm giác. `geometry.ts` cố ý không có JSX
  để script import được — dùng đúng cửa đó.

## Kiến trúc

Đường thắng của Renegade không đổi: `alive.length === 1 && alive[0].role === "renegade"`.
Với 2 renegade còn sống thì `alive.length >= 2` nên chưa ai thắng — đúng luật "mỗi Renegade
chơi một mình".

Chỗ duy nhất cần suy nghĩ là Sheriff: `outlawsDead && renegadesDead` — `.every()` trên
**tất cả** renegade, nên 2 renegade cũng đúng.

## File liên quan

**Sửa**
- `lib/types.ts:21` — `MAX_PLAYERS = 8`
- `lib/game/state.ts:223-228` — thêm `ROLE_SETUP[8]`
- `components/three/scene/geometry.ts` — màu áo thứ 8; kiểm `layout(7)`
- `components/three/scene/Players.tsx` — kiểm bố trí 7 đối thủ
- `components/three/scene/Avatars.tsx` — kiểm không đè nhau ở 7 đối thủ

**Tạo**
- `scripts/check-table-readability.ts` — in toạ độ ghế cho nOpp 3..7, khoảng cách nhỏ nhất giữa
  2 ghế liền kề, và ghế xa nhất so với khung hình
- bổ sung vào `lib/__tests__/roomLifecycle.test.ts` + `lib/__tests__/turnFlow.test.ts`

## Các bước

1. `MAX_PLAYERS = 8` + `ROLE_SETUP[8]`. Chạy `npm test` — `roomLifecycle.test.ts` sẽ động
   vào `MAX_PLAYERS`, sửa nếu cần.
2. Viết test cho 2 Renegade **trước khi đụng 3D**: (a) 1 renegade chết, renegade kia sống
   cuối cùng → `winner: "renegade"`; (b) cả 2 renegade còn sống, outlaw chết hết →
   chưa ai thắng; (c) outlaw + cả 2 renegade chết → `winner: "sheriff"`.
3. Viết `scripts/check-table-readability.ts`, chạy cho nOpp 3..7, đọc số.
4. Chỉ khi số cho thấy có vấn đề mới chỉnh `layout()`. Đừng chỉnh trước.
5. Thêm màu áo thứ 8 vào `AVATAR_COLORS` (tách rõ khỏi 7 màu kia trên nền nỉ xanh).
6. Mở phòng 8 bot, xem mắt, chụp lại vào `evidence/`.

## Todo

- [x] `MAX_PLAYERS = 8`
- [x] `ROLE_SETUP[8] = sheriff, deputy×2, outlaw×3, renegade×2`
- [x] Test thắng/thua với 2 Renegade — **4 nhánh**, không phải 3. Nhánh thứ tư: Sheriff
      chết trong khi hai renegade còn sống và outlaw đã chết sạch → **outlaws** thắng.
      Phản trực giác đủ để ai đó "sửa" nhầm. `checkWin` đã đúng sẵn, không sửa dòng nào.
- [x] `scripts/check-table-readability.ts` — gộp cả đo ghế lẫn đo màu áo, vì cùng một
      câu hỏi "bàn có đọc được không" và cùng một lối trả lời bằng số
- [x] Màu áo thứ 8: vàng `#f1c40f`, chọn bằng ΔE
- [x] Chỉnh `layout()` **chỉ khi** script chỉ ra vấn đề → **không chỉnh**, bàn 8 còn hở
      1.935 và đòi khung hẹp hơn bàn 6
- [x] Ván 8 bot chạy tới điều kiện thắng — 400/400, 0 đóng băng, cả 3 phe đều thắng
- [ ] Ảnh bàn 8 người vào `evidence/` — **còn thiếu**, cần trình duyệt

Phát sinh, chưa quyết:

- [ ] Draft nhân vật vừa khít 16: bàn 8 ăn đúng `8 × DRAFT_PER_PLAYER` = toàn bộ pool.
      Bỏ đi một nhân vật thì người ngồi cuối chỉ còn 1 lựa chọn mà không ai báo lỗi.
      Phase 03 thêm 15 nhân vật nên áp lực này biến mất — nhưng phase 02 ship trước.

## Xong khi

- Ván 8 người chạy tới điều kiện thắng trong sim, cả 3 phe đều thắng được ít nhất 1 lần.
- 3 test cho 2 Renegade xanh.
- Script đo in ra khoảng cách ghế đều, không ghế nào lọt khung.
- 8 áo phân biệt được bằng mắt trên ảnh chụp.

## Rủi ro

| Rủi ro | Đối phó |
|---|---|
| Chỉnh toạ độ 3D bằng cảm giác — đã sai nhiều lần trước đây | Bắt buộc `scripts/check-table-readability.ts`, sửa theo số |
| `arc` chạm trần 1.5 ở 7 đối thủ, người ngồi rìa có thể ra ngoài khung | Script đo cả vị trí so với khung hình, không chỉ khoảng cách ghế |
| 2 renegade đổi cán cân, ván 8 người có thể kéo dài bất thường | Sim nhiều ván, đo số lượt trung bình; nếu lệch nhiều thì báo, đừng tự chỉnh luật |
| Sửa `MAX_PLAYERS` làm vỡ test cũ đang giả định 7 | Bước 1 chạy `npm test` ngay, sửa test trước khi đi tiếp |

## Bảo mật

Không có bề mặt mới. `joinRoom` đã chặn `>= MAX_PLAYERS` ở `rooms.ts:125` và `:166`.

## Bước sau

Độc lập với 03/04/05 — có thể chen bất cứ lúc nào sau 01.
