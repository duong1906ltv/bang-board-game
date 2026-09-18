# Màn home "oh wow" — biên bản tư vấn

**Ngày:** 2026-09-06 · **Lăng kính:** CTO · **Trạng thái:** đã chốt hướng và đã dựng xong (chưa xem bằng mắt)

## Đề bài

"Vừa vào là cho cảm giác oh wow." Màn home hiện tại: emoji 🤠 + `h1` 2.2rem font hệ thống
+ thẻ nâu + danh sách phòng. Không nạp font nào. Không dùng tấm art nào.

## Vật liệu tìm được

| Thứ | Ở đâu | Tình trạng |
|---|---|---|
| 16 tranh nhân vật, 560×478, **full khung** kiểu truyện tranh | `public/characters/` | màn home không dùng tấm nào |
| 14 ảnh lá bài, 560×486 | `public/cards/` | không dùng |
| Quán rượu 3D dựng xong, `SaloonInner` render độc lập không cần game state | `components/three/scene/Saloon.tsx` | **bị loại — chủ dự án chọn 2D** |
| Danh sách phòng = dữ liệu socket sống | `components/RoomList.tsx:64` | đang style như metadata xám |
| Font | — | **chưa nạp cái nào** |

Ảnh gốc ~520KB/tấm → bắt buộc qua `next/image`.

## Các đường đã cân

| Đường | Trần wow | Giá | Kết |
|---|---|---|---|
| Quán rượu 3D thật | cao nhất | ~300KB JS (nhưng **trả trước** — vào phòng là tải anyway) + poster frame + đường lui máy yếu | ❌ chủ dự án loại: "làm 2D thôi" |
| Chia bài lúc vào | trung bình | ~60 dòng CSS | ⚠️ giữ lại làm tuỳ chọn |
| Làm rẻ trước, 3D sau | thấp→cao | rải ra | ❌ không chọn |

## Hướng đã chốt

**2D, và font/logo đi kèm cùng đợt.**

Trụ chính: **tranh nhân vật làm nền full khung**, tối đi + grade ấm, trôi chậm kiểu Ken Burns,
cross-fade giữa 16 tấm. Art đã có, đúng chất, và là thứ nói "game này có người vẽ thật"
nhanh hơn mọi hiệu ứng tự chế.

Nền tảng chữ nghĩa: font display cho tiêu đề (Rye/Smokum — hero-only, ~18KB woff2),
`clamp(3rem, 9vw, 6rem)`, thay 🤠 bằng SVG mark.

## Phải canh chừng

1. **16 tranh KHÔNG cùng tông.** `slab-the-killer` nội thất tối om; `rose-doolan` trời xanh
   sa mạc sáng. Cross-fade thô = nhấp nháy như lỗi. **Bắt buộc** một lớp grade thống nhất
   (sepia + darken + scrim màu `--bg`) trước khi ghép. Đây là điều kiện, không phải chi tiết.
2. **Wow phải là không khí, đừng thành intro.** Game bạn bè mở lại mỗi ngày; cinematic 3 giây
   đến lần thứ năm là vật cản. Vòng lặp ambient không chặn ai, đoạn phim mở màn thì có.
3. **Kỷ luật chuyển động:** design-ui giới hạn 1–2 thứ động mỗi màn. Ken Burns + cross-fade
   tính là MỘT hệ. Parallax do người dùng đẩy nên không tính. Đừng chồng thêm bụi + lá bài
   + nhấp nháy đèn cùng lúc.
4. `prefers-reduced-motion` → đứng yên một tấm, không cross-fade.
5. Chữ đè lên tranh → contrast ≥4.5:1 phải đo trên tấm **sáng nhất** (rose-doolan), không
   phải tấm tối nhất.
6. Ảnh nặng 520KB → `next/image`, và chỉ preload tấm đầu.

## Xong khi

- Vào màn home, trong 1 giây đầu đã thấy tranh (không phải nền trơn rồi mới hiện).
- Cross-fade qua đủ 16 tấm không thấy nhảy tông.
- Bật reduced-motion → đứng yên, vẫn đẹp.
- Đo contrast chữ tiêu đề + label trên tấm sáng nhất ≥4.5:1.
- Lighthouse mobile không tụt so với hiện tại quá 5 điểm.

## Đã dựng

| File | Việc |
|---|---|
| `lib/seat-colors.ts` (mới) | tách `AVATAR_COLORS` khỏi `scene/geometry.ts` — file đó import three, kéo cả three.js vào trang chủ chỉ để lấy 8 chuỗi hex. geometry re-export nên 4 chỗ dùng cũ không đổi |
| `components/home/SaloonBackdrop.tsx` (mới) | 2 lớp ảnh chồng, chỉ lật khi tấm mới đã tải xong; xáo sau mount để không lệch hydration |
| `components/home/BrandMark.tsx` (mới) | sao cảnh sát trưởng, toạ độ 10 đỉnh tính bằng lượng giác |
| `scripts/check-backdrop-contrast.py` (mới) | giải mã PNG thuần Python + chạy lại đúng phép tính filter/gradient của CSS, đo cả hai đầu |
| `app/layout.tsx` | font Rye qua `next/font`, buộc vào `--font-brand` nên không rò ra chỗ khác |
| `app/globals.css` | grade nền, vũng tối cục bộ, kiểu chữ hero, danh sách phòng; xoá `.moon` đã chết |
| `app/page.tsx` | nền thành anh em của `<main>` chứ không phải con |
| `components/RoomList.tsx` | chip tên chồng nhau, chấm ghế đầy/rỗng, tên người to lên |

## Số đo

| Thứ | Trước | Sau |
|---|---|---|
| Ảnh nền mỗi tấm | 544KB PNG | **44.5KB WebP** (`next/image`, chặn ở khổ gốc) |
| Font | không có | Rye 4.5KB + metric fallback 22.9KB |
| Tương phản tiêu đề trên tấm sáng nhất | — | **9.60:1** (cần 4.5) |
| Tương phản phụ đề | — | **5.00:1** (cần 4.5) |
| Tranh còn ra hình (tương phản nội bộ) | 1.19–1.63:1 ở bản đầu | **3.21–3.82:1** |

tsc sạch · lint sạch · 237/237 test xanh.

## Sai lầm đã mắc và cách phát hiện

Bản grade đầu tiên phủ tối toàn khung (`brightness(0.42)` + scrim 0.72–0.94). Chữ đạt
9.40:1 — thừa gấp đôi mức cần — nhưng tranh chỉ còn **1.19–1.63:1** tương phản nội bộ,
tức là một mảng bùn. Nhìn bằng mắt thì thấy "tối, có không khí", không thấy mình vừa
xoá sạch lý do đặt tranh ở đó.

Quét tham số cho thấy **không tổ hợp nào** đạt cả hai — vì chữ nằm đè đúng chỗ sáng nhất
của tranh. Đây không phải chuyện chỉnh số mà là chuyện tách vùng: bỏ lớp phủ toàn khung,
thay bằng vũng tối cục bộ chỉ dưới khối chữ. Sau đó `radial đáy` chỉ tác động lên tranh
(9.52:1 giữ nguyên ở mọi mức) — hai cần gạt rời nhau, chỉnh được độc lập.

## Vòng sửa sau khi xem thật

**Ảnh bị cắt mất đầu.** Tranh 560×478 (gần vuông) phủ lên khung 2:1, `cover` căn giữa cắt
**103–121px** ảnh ở phía trên — trọn cái đầu, vì cả 16 tranh đều đặt mặt người ở y=20–140.
Sửa `object-position: 50% 5%` (cắt trên còn 10–12px trên mọi khung nhìn 1440×900 → 2560×1080)
và `transform-origin: 50% 12%` — phóng quanh tâm giữa ăn thêm ~22px phía trên, thừa sức cắt
lại đúng thứ vừa cứu.

**Thẻ nhập.** Viền đôi kiểu khung tờ truy nã (hai lớp inset shadow, một shadow không tạo được
khe hở), nhãn thành đầu mục hoa nhỏ, quầng focus vàng (trước chỉ đổi viền 1px, gần như không
thấy), nút chính thành dốc màu vàng. Tất cả bọc trong `.center` vì `input`/`button`/`label`
dùng chung với toàn bộ UI trong phòng.

**Hàng bàn.** Thanh dọc bên trái sáng dần theo độ đầy (3 nấc — chuyển màu liên tục chỉ tạo ra
bảy sắc nâu không ai phân biệt được). Mã bàn từ chú thích xám thành thẻ đóng dấu vàng: nó là
thứ người ta đọc qua điện thoại cho bạn bè. Ghế trống vẽ bằng viền rỗng chứ không phải chấm
xám đặc — rỗng phải TRÔNG rỗng.

## Câu chữ đã chốt

| Chỗ | Trước | Sau |
|---|---|---|
| Tagline | Game bài Viễn Tây online · 4–8 người | **Sheriff lộ mặt. Còn lại thì không.** · 4–8 người |
| Nhãn ô tên | Tên của bạn | **Xưng danh** |
| Placeholder | Django | **Bill Cà Nhắc** (EN: Limping Bill) |
| Nhãn danh sách | Phòng đang chờ | **Bàn đang mở** |
| Nút chính | Tạo phòng mới | **Mở bàn mới** |
| Trạng thái rỗng | Chưa có phòng nào… | Chưa ai mở bàn. Mở trước rồi rủ người vào. |

Nền tranh + ngôi sao đã nói "Viễn Tây" rồi, nên tagline được rảnh tay nói **luật cốt lõi**
thay vì lặp lại thể loại. Câu đã chốt đúng luật: chỉ Sheriff bị lật vai, còn lại giấu.

Đổi "phòng"→"bàn" kéo theo 7 chuỗi khác, gồm 2 chuỗi lỗi trong `i18n.ts` (`no-such-room`,
`room-full`) hiện thẳng trên màn chờ — để nguyên là màn hình tự mâu thuẫn.

## Vòng 3 — tên tuỳ chọn, thư viện bài, bàn chờ

**Không bắt gõ tên.** Vào là được phát một biệt danh thật (`lib/outlaw-names.ts`, 16 tên
mỗi ngôn ngữ), điền sẵn vào ô chứ không để ở placeholder — cái tên hiện ra phải đúng là
cái tên sẽ ngồi vào bàn. Nút xúc xắc phát lại, có `avoid` để không trúng lại tên đang hiện.
Ô tên tách ra `components/home/NameField.tsx`.

**Mặt bài toàn chữ** (`components/CardTextFace.tsx`). 22/44 loại lá và 15/31 nhân vật không
có ảnh lẫn vector — đúng bằng phần Dodge City vừa thêm; trước đây rơi về 🂠 và 🤠 nên hai
chục lá khác nhau nhìn y hệt. Cỡ chữ tính bằng công thức chứ không đặt tay: vừa bề ngang
theo từ dài nhất (`box.w / (longest × 0.62)`) VÀ vừa bề dọc theo số dòng, lấy cái nhỏ hơn.
Tên ở đầu lá tắt khi mặt chữ bật — một cái tên in hai lần là lỗi, không phải thiết kế.

**Trang `/luat`.** 44 lá gom theo màu viền + 31 nhân vật, lọc theo bộ. Số dưới mỗi lá là số
BẢN IN trong nọc, không phải số loại — đó là câu người chơi thật sự hỏi. Là trang riêng nên
gửi link được cho người chưa từng chơi.

**Bàn chờ dựng lại.** Tám ghế luôn hiện đủ tám, ghế trống vẽ nét đứt (cùng ngôn ngữ với ổ
đạn rỗng ở trang chủ). Ghế trống của chủ bàn kiêm nút thêm bot, nên mục "Thêm AI để test"
biến mất — chỗ thêm người chính là chỗ người đó sẽ ngồi. Nút gỡ chỉ mọc ở con bot CUỐI vì
`onRemoveBot` không nhận id; mọc ở mọi ghế là hứa một điều làm không được. Ba đoạn giải
thích gấp lại sau nút "Là gì?". File 160 dòng tách thành 118 + `lobby/SeatGrid.tsx` (71) +
`lobby/RuleRow.tsx` (47).

**Emoji đã bỏ:** 🤠 (trang chủ + đầu trang bàn), 🎲 🎯 🤖 ⭐ (bàn chờ), 🂠 (lá thiếu tranh).
Đầu trang trong bàn giờ là đường về trang chủ — trước đó vào phòng rồi thì không có lối ra
nào ngoài nút Back.

Còn giữ: `ROLE_EMOJI` (4 vai) — thay bằng SVG là một việc riêng.

## Còn treo

- `components/room/Lobby.tsx:30` vẫn là "Phòng chờ" — cố ý giữ: đó là tên MÀN HÌNH chờ
  trước ván, khác với "bàn" là thứ mình ngồi vào. Nếu thấy chỏi thì đổi nốt.
- `Chủ bàn ⭐` vẫn dùng emoji làm biểu tượng — cùng lỗi với 🤠 vừa thay ở trang chủ.
- `app/room/[code]/page.tsx:152` vẫn là `🤠 Bang!`. Giờ trang chủ dùng sao SVG nên hai
  nơi lệch nhau. Sửa 1 dòng nhưng nằm ngoài phạm vi đã chốt.
- Chia bài (`public/cards`) đã quyết **không** làm — hai hệ chuyển động sẽ đánh nhau.
- Hai chỗ `LangToggle` còn lại (`app/room/[code]/page.tsx:152`, `components/room/SettingsMenu.tsx:188`)
  — đã nêu, chủ dự án chưa trả lời.
