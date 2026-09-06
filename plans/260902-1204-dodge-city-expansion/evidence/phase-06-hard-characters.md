# Phase 06 — 4 nhân vật khó

Đo ngày 2026-09-06. Pool nhân vật 27 → **31**. Bộ Dodge City hoàn tất.

## Molly Stark rẻ hơn kế hoạch tưởng

Plan lo "ngoài lượt rải khắp engine — `respond()` các nhánh missed/beer/bang, nhánh bỏ bài
của Indians/Brawl/Duel" và bắt phải tìm **một** chỗ chung trước khi viết dòng nào.

Chỗ chung đã có sẵn từ phase 05: `spendReaction`. Vì mệnh đề "chủ động, ngoài lượt mình"
tự nó hẹp lại — **bạn chỉ tự nguyện bỏ một lá ngoài lượt mình khi TRẢ LỜI một cửa phản
ứng**. Mọi đường khác đều tự loại:

| Đường | Vì sao không tính |
|---|---|
| Bị Cat Balou / Panic / Rag Time lấy | đi `openTaken`, không qua `respond` |
| Bị Brawl ép bỏ | nhánh `"toss"`, và **ép** thì không phải chủ động |
| Bỏ bài cuối lượt | đang là **lượt mình** |

Duel được kéo qua cùng cửa (nó vốn tự splice tay bài). Điều kiện lượt kiểm **trong** hook
chứ không ở nơi gọi — hai chỗ kiểm là hai chỗ có thể lệch.

## Vera Custer đúng là đắt như kế hoạch nói

`effectiveEffect(room, p)` thay `charEffect(p)` ở **24 chỗ** trên 4 file. Đó là toàn bộ
danh sách checkpoint mà engine hỏi "người này làm được gì".

Ba ràng buộc, mỗi cái một test:

- **Một tầng, không đệ quy.** Vera mượn Vera → năng lực rỗng. Trên bàn thật không xảy ra
  được (pool chỉ một Vera), nhưng một hàm cả engine gọi thì không được phép có đường vòng.
- **Chỉ trong lượt cô ta.** `effectiveEffect` tự kiểm `turnIndex`, nên ngoài lượt cô ta
  trả về năng lực của chính cô ta mà nơi gọi không cần biết.
- **Reset ở `beginTurn`.** Quên là giữ năng lực người khác vĩnh viễn.

Cửa chọn mở **trước** draw phase, và mở lại đúng lúc tấm thẻ Dynamite/Jail được gạt đi —
năng lực mượn được có thể chính là cách rút bài (Kit Carlson, Jesse Jones, Pedro Ramirez,
Bill Noface), nên chọn sau draw phase là chọn muộn. Có test: chưa chọn thì `drawCards` từ
chối.

## Belle Star: đổi chữ ký trước, cắm năng lực sau

Plan bắt làm đúng thứ tự đó và nó đáng: `barrelAttempts(p)` → `barrelAttempts(room, p)`
chạy được với 223 test cũ xanh trước khi có một dòng năng lực nào.

Ranh giới quan trọng — **lá trên bàn** bị vô hiệu, **nhân vật** thì không:

| Bị vô hiệu | Không bị chạm |
|---|---|
| Mustang / Hideout của người khác | Paul Regret (+1 là con người anh ta) |
| Barrel của người khác | Jourdonnais (Barrel bẩm sinh) |
| **Iron Plate / Bible / Sombrero / Ten Gallon Hat** của người khác | |

Nhóm green nằm trong danh sách vì chúng cũng là lá đang bày ra bàn. Đây là tương tác chỉ
lộ ra khi phase 05 và 06 gặp nhau, không có trong kế hoạch nào.

## Pat Brennan

Gần Jesse Jones nhưng khác một chỗ dễ sai: anh ta lấy **một** lá thay cho **cả** phần rút,
không phải "lá đầu tiên rồi rút tiếp". `thenDraw: 0` đóng draw phase mà không rút thêm.

Client dùng lại đúng cơ chế chọn-lá-trên-bàn của Cat Balou / Panic — cũng là "bấm vào một
lá đang bày ra" — thay vì dựng chế độ thứ hai làm cùng một việc. Bàn của chính anh ta cũng
bấm được, vì "người bất kỳ" gồm cả anh ta.

## Soak

| | Kết quả |
|---|---|
| Dodge City, 6 người, 150 ván | 150/150, 0 đóng băng |
| Dodge City, 8 người, 200 ván | 200/200, 0 đóng băng, 52.4 lượt |
| Bộ gốc, 7 người, 150 ván × 2 mức | 0 đóng băng |

**31 nhân vật trong pool, không ai chưa từng được chia và không ai chưa từng được chọn.**
Cả 22 lá Dodge City mới đều được đánh. Không mớm gì.

237 unit test xanh.

## Còn thiếu

- **Ảnh 15 nhân vật Dodge City.** Cùng lý do phase 03: `characterArt.ts` cố ý cho phép
  danh sách tụt lại và rơi về glyph 🤠; thêm id mà chưa có PNG mới là hỏng.
- **Chưa ai mở trình duyệt nhìn.** Bàn 8 người, thanh năng lực, thanh green, dấu ⏳, luồng
  trả giá, cửa Brawl, cửa chọn của Vera — tất cả mới chỉ được chứng minh bằng số.
