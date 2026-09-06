# Phase 05 — 13 lá green

Đo ngày 2026-09-06. Nọc 106 → **120**. Bộ Dodge City đủ 40 lá.

## Cửa Draw! trở về đúng số cũ

| Nọc | Barrel (♥) | Dynamite ([2-9]♠) |
|---|---|---|
| Gốc, 80 lá | 25.0% | 12.5% |
| Phase 01, 98 lá | 23.5% | 13.3% |
| **Đủ, 120 lá** | **25.0%** | **12.5%** |

Xác nhận đúng điều evidence phase 01 dự đoán: chỗ lệch ở 98 lá là hiệu ứng của một lát
cắt dở dang, không phải khuyết tật. Bộ mở rộng đủ 40 lá thì chất cân 10/10/10/10, và mọi
tỉ lệ Draw! trở về nguyên trạng. Phép kiểm 10/10/10/10 trong `deckSets.test.ts` cũng tự
bật ở mốc này và xanh.

## Một lỗi LUẬT sim bắt được

Sim đếm từng lá, và nó cho thấy `bible` được dùng 32 lần trong khi bot **chưa từng đặt một
lá green nào xuống bàn**. Không thể có chuyện đó.

Nguyên nhân: `canUseAs` nhận `countsAs === "missed"` cho mọi lá, bất kể lá đang nằm ở đâu.
Bible và Iron Plate mang ký hiệu Mancato!, nên chúng đỡ được Bang! **ngay từ trên tay** —
bỏ qua sạch cái giá một lượt chờ vốn là toàn bộ thiết kế của loại bài này.

Sửa: `countsAs` không áp cho `kind === "green"`. Green chỉ trả lời từ trên bàn, qua
`reactionOnTable`, và phải đã chín. Test khoá cả hai chiều.

**Bài học:** một tính năng chạy quá NHIỀU cũng là dấu hiệu, không chỉ chạy quá ít.

## Bot chưa bao giờ đặt green xuống bàn

Chín lá kích hoạt-trong-lượt đều 0 lần. Bot chỉ đánh những `defId` nó biết tên, và green
không nằm trong danh sách đó — nên cả 13 lá nằm chết trên tay suốt ván.

Thêm một bước vào thang ưu tiên. Sau đó:

```
buffalo-rifle 39 · can-can 46 · canteen 40 · conestoga 53 · derringer 33
howitzer 48 · knife 43 · pepperbox 41 · pony-express 57
bible 77 · iron-plate 74 · sombrero 50 · ten-gallon-hat 47
```

## Soak

| | Kết quả |
|---|---|
| Dodge City, 6 người, 200 ván | 200/200 tới đích, 0 đóng băng |
| Dodge City, 8 người, 100 ván | 100/100 tới đích, 0 đóng băng |
| Bộ gốc, 7 người, 150 ván × 2 mức | 0 đóng băng |
| Nhiệm vụ phụ | không treo, không rò rỉ, mọi nhiệm vụ đều nhích được |

Cả 22 lá Dodge City mới đều thật sự được đánh, không mớm gì.

## Ba quyết định kiến trúc

**`playedOnTurn` nằm trên INSTANCE lá.** Lá bị cướp rồi người khác đánh lại phải đếm lại từ
đầu — một cờ trên người chơi thì không. Cùng lý do với `playedBy` của Dynamite. Có test.

**`room.turnCounter > playedOnTurn` là toàn bộ luật "Rule 4".** turnCounter chỉ tăng, nên
nó đúng cho cả nhóm kích hoạt trong lượt lẫn nhóm phản ứng ngoài lượt, mà không cần biết
lượt của ai.

**`tied-hands` cấm ĐẶT green xuống, không cấm kích hoạt lá đã nằm sẵn.** Đặt xuống là một
hành động giống hệt đánh lá xanh, nên nó vào `bannedKinds`. Nhưng lá đã bày ra bàn thì vẫn
dùng được, y như một cái Barrel đã bày ra vẫn nổ. `greenProblem` cố ý không đọc
`bannedKinds`, và có comment nói rõ vì sao.

## Chi tiết luật dễ sai

**Pepperbox không phải vô hạn tầm.** Nó bắn trong tầm súng bình thường; giá trị nằm ở chỗ
không tốn lá Bang! trên tay. Test cả hai chiều: tay không thì không với tới ghế cách 2,
đeo Schofield thì với tới.

**Elena Fuente không đốt được đồ trên bàn.** `anyAsMissed` nói "lá bất kỳ TRÊN TAY". Không
siết thì cô ấy bỏ luôn khẩu súng đang đeo để né một phát Bang!.

**Slab the Killer đếm cả bàn.** Một Iron Plate trên bàn cộng một Mancato! trên tay là đủ
hai lớp. Phép đếm "đủ lá để hoàn thành cú đỡ không" phải nhìn cả hai chỗ, nếu không lá đầu
tiên bị từ chối oan.

**`no-cover`** giờ tính cả bốn lá green mang ký hiệu Mancato! là lớp che — trên bàn chúng
chặn đứng một phát Bang!, trên tay chúng là lớp che bạn đang từ chối bày ra.

## Còn thiếu

- **Chưa xem bằng mắt.** Thanh green (`GreenCardBar.tsx`) và dấu ⏳ trên hàng trang bị 3D
  chưa ai mở trình duyệt nhìn.
