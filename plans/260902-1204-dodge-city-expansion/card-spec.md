# 40 lá Dodge City — bảng gốc

**Nguồn:** bản in chính thức [bang.dvgiochi.com/list_download.php?id=3](https://bang.dvgiochi.com/list_download.php?id=3)
(tên Ý + số bản + rank/suit), đối chiếu chéo với bảng tổng hợp hiệu ứng của người dùng.

Đây là **nguồn duy nhất** cho spec Dodge City. Phase 01 / 04 / 05 lấy từ đây, không chép lại.
Ký hiệu spec theo đúng quy ước `lib/cards.ts`: rank + chữ cái chất (S/C/H/D).

## Đối chiếu hai nguồn

33/34 dòng khớp tuyệt đối. **Đúng một chỗ lệch: Whisky.**

| | Bản in PDF | Bảng hiệu ứng | Chốt |
|---|---|---|---|
| Whisky | Q♦ | ♥ | **Q♥** |
| Pony Express | Q♦ | ♦ | Q♦ |

Chốt Whisky = Q♥ vì nó làm **cả ba** phép kiểm tra cùng đúng, mà Q♦ thì hỏng cả ba:

1. Hết trùng — PDF đang cho Whisky và Pony Express **cùng Q♦**, không thể có 2 lá cùng giá trị.
2. Chất cân đúng **10/10/10/10**; để Q♦ thì thành ♥9 ♦11.
3. Mỗi chất dùng đúng 10 rank **khác nhau**, không lá nào trùng giá trị lá nào trong cả bộ.

Kết luận: PDF đọc nhầm ♥ thành ♦ ở đúng một ô.

**Đã xác nhận bằng ảnh bài in thật.** Người dùng gửi ảnh mặt bài; Whisky in **Q♥**.
Suy luận ba phép kiểm ở trên giờ là bằng chứng thừa, không còn là chỗ dựa duy nhất.

## Ba nhóm màu viền

Ảnh bài cũng xác nhận bộ này có **ba** màu viền, không phải hai. Đừng gộp nâu với ô-liu —
chúng khác cơ chế, và đó là lý do phase 05 phải đẻ `CardKind` thứ tư.

| Viền | Số loại | Số lá | Cơ chế |
|---|---|---|---|
| Xanh dương | 7 | 7 | trang bị nằm mãi, tự phát huy |
| Nâu-vàng | 14 | 19 | đánh xong bỏ ngay |
| Xanh ô-liu (green) | 13 | 14 | đặt trước mặt, **lượt sau** mới kích hoạt được, dùng xong bỏ |

Bằng chứng chúng khác nhau thật: một ảnh đặt **WHISKY** (nâu) ngay cạnh **BIBBIA** (ô-liu),
cùng khung, cùng ánh sáng. Gọi nhóm nâu là "màu vàng" cũng không sai — chúng ngả cát —
nhưng nhóm ô-liu phải để riêng vì nó mang cơ chế trì hoãn.

## Bản sao lá đã có — 16 lá, 12 `defId`

Chỉ thêm `specs.dodgeCity`, không tạo `CardDef` mới.

| defId | spec | | defId | spec |
|---|---|---|---|---|
| `bang` | `8S 5C 6C KC` | | `barrel` | `AC` |
| `missed` | `8D` | | `dynamite` | `10C` |
| `beer` | `6H 6S` | | `mustang` | `5H` |
| `cat-balou` | `8C` | | `remington` | `6D` |
| `panic` | `JH` | | `rev-carabine` | `5S` |
| `general-store` | `AS` | | | |
| `indians` | `5D` | | | |

## Blue mới — 2 lá

| defId | spec | Hiệu ứng | Data |
|---|---|---|---|
| `binocular` | `10D` | thấy người khác gần hơn 1 | `seesCloserBy: 1` |
| `hideout` | `KD` | người khác thấy mình xa hơn 1 | `seenFartherBy: 1` |

## Brown mới — 8 lá, 7 `defId`

| defId | spec | Hiệu ứng | Ghi chú luật |
|---|---|---|---|
| `punch` | `10S` | Bang! ở khoảng cách 1 | Rule 5. Súng **không** cộng tầm; Scope/Binocular **có** — y hệt Panic |
| `dodge` | `7D KH` | tính là Missed! + rút 1 lá | rút sau khi đã tính là Missed! |
| `whisky` | `QH` | bỏ thêm 1 lá → tự hồi 2 máu | Rule 3 |
| `tequila` | `9C` | bỏ thêm 1 lá → 1 người bất kỳ hồi 1 máu | Rule 3. Được chọn chính mình |
| `brawl` | `JS` | bỏ thêm 1 lá → mọi người khác bỏ 1 lá | **người đánh chọn tay-hay-bàn cho TỪNG người** |
| `rag-time` | `9H` | bỏ thêm 1 lá → cướp 1 lá của người bất kỳ | mọi khoảng cách |
| `springfield` | `KS` | bỏ thêm 1 lá → Bang! người bất kỳ | Rule 5. Mọi khoảng cách |

## Green — 14 lá, 13 `defId`

Tất cả mang **Rule 4** = không dùng được trong chính lượt vừa đánh ra.

**Kích hoạt trong lượt mình (9)**

| defId | spec | Hiệu ứng | Ghi chú |
|---|---|---|---|
| `buffalo-rifle` | `QC` | Bang! người bất kỳ | Rule 4+5. Ý: *Fucile da Caccia* |
| `can-can` | `JC` | ép 1 người bất kỳ bỏ 1 lá | Rule 4. Mọi khoảng cách |
| `canteen` | `7H` | hồi 1 máu | Rule 3+4. Ý: *Borraccia* |
| `conestoga` | `9D` | cướp 1 lá của người bất kỳ | Rule 4. Mọi khoảng cách |
| `derringer` | `7S` | Bang! khoảng cách 1, rút 1 lá | Rule 4+5 |
| `howitzer` | `9S` | Bang! vào **tất cả** người khác | Rule 4+5. = Gatling |
| `knife` | `8H` | Bang! khoảng cách 1 | Rule 4+5. Ý: *Pugnale* |
| `pepperbox` | `AH` | Bang! ở **tầm bình thường của bạn** | Rule 4+5. **Không** phải vô hạn tầm |
| `pony-express` | `QD` | rút 3 lá | Rule 4 |

**Dùng ngoài lượt — mang ký hiệu Missed! (4 `defId`, 5 lá)**

| defId | spec | Hiệu ứng | Ghi chú |
|---|---|---|---|
| `bible` | `10H` | tính là Missed! + rút 1 lá | Rule 4. Ý: *Bibbia* |
| `iron-plate` | `AD QS` | tính là Missed! | Rule 2+4. Ý: *Placca di Ferro* |
| `sombrero` | `7C` | tính là Missed! | Rule 4 |
| `ten-gallon-hat` | `JD` | tính là Missed! | Rule 4. Ý: *Cappello* |

## Kiểm tra

```
16 + 2 + 8 + 14 = 40 lá  ✓
♠ 5S 8S 6S AS 10S JS KS 7S 9S QS   = 10  ✓
♣ AC 10C 5C 6C KC 8C 9C JC QC 7C   = 10  ✓
♥ 5H 6H JH 9H KH QH 10H 7H AH 8H   = 10  ✓
♦ 10D 6D KD 5D 8D 7D JD 9D AD QD   = 10  ✓
```

Mỗi chất đúng 10 rank khác nhau. Không lá nào trùng giá trị lá nào trong cả bộ mở rộng.

Hộp có 63 lá = 40 bài + 15 nhân vật + 8 vai. Bản in xác nhận vai cho bàn 8 người:
Sceriffo 1, Vice 2, Fuorilegge 3, Rinnegato 2 — khớp `ROLE_SETUP[8]` ở phase 02.

## Rule 5 và hạn mức Bang!/lượt

Bảng nguồn đặt **Rule 5** lên Punch, Springfield, Knife, Derringer, Pepperbox, Howitzer,
Buffalo Rifle — đúng những lá "có hiệu ứng Bang! nhưng không phải lá Bang!". Trong bộ gốc,
Rule 5 nằm trên **Duel và Gatling**.

Engine hiện tại đã xử đúng tinh thần đó mà không cần biết: `room.bangsThisTurn` chỉ tăng
trong `playBang` (`lib/game/index.ts:910`), còn Gatling đi `playMulti` và Duel đi `playDuel`
nên cả hai **không** tiêu hạn mức.

→ **Nhóm Rule 5 của Dodge City cũng không được tiêu `bangsThisTurn`.** Chúng vẫn là Bang!
theo mọi nghĩa khác: Barrel chống được, Missed! chống được, Slab the Killer vẫn đòi 2 Missed!.

Đây là **suy luận** từ chỗ Rule 5 được đặt, không phải trích nguyên văn luật. Nếu đối chiếu
bài thật thấy khác thì sửa ở đây, cả 7 lá cùng chỗ.
