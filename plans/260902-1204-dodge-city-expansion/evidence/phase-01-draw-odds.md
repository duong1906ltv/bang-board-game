# Phase 01 — cửa Draw! trên nọc dày hơn

Đo bằng đếm trực tiếp trên `buildDeck()`, không phải sim — cửa Draw! là tính chất của
thành phần nọc, sim chỉ thêm nhiễu.

| Nọc | Barrel (♥) | Dynamite ([2–9]♠) | Lá nằm bàn (blue/gun) | ♥ trong số đó |
|---|---|---|---|---|
| gốc, 80 lá | 25.0% | 12.5% | 17 | 4 |
| + Dodge City phase 01, 98 lá | **23.5%** | **13.3%** | 24 | 5 |
| + Dodge City đầy đủ, 120 lá (dự kiến) | 25.0% | 12.5% | 38 | 9 |

## Đọc số

Cửa Barrel tụt 1.5 điểm và Dynamite tăng 0.8 điểm. **Đây là hiện tượng tạm thời của lát
cắt, không phải của bộ mở rộng.** 18 lá của phase 01 chia chất 4♠ / 6♣ / 3♥ / 5♦ — nghèo
Cơ, giàu Nhép. Trọn 40 lá thì cân đúng 10/10/10/10, nên:

- ♥: 20/80 = 25.0% → 30/120 = 25.0% (về đúng mốc cũ)
- [2–9]♠: 10/80 = 12.5% → 15/120 = 12.5% (về đúng mốc cũ)

Cả hai chỉ số quay lại chính xác giá trị gốc khi bộ mở rộng đủ 40 lá. Không cần chỉnh gì.

## Về chỗ lệch cũ

Ghi chú trước đây: bài xanh nằm trên bàn toàn đen làm nọc còn lại giàu Cơ, cửa Draw! chạy
nóng hơn mệnh giá. Phase 01 làm chỗ lệch đó **hơi nặng thêm** — thêm 7 lá nằm bàn mà chỉ
1 lá Cơ (Mustang 5♥).

Phase 05 sẽ kéo ngược lại: 14 lá green cũng nằm trên bàn, trong đó **4 lá Cơ** (Sombrero 7♥,
Pugnale 8♥, Pepperbox A♥, Bibbia 10♥) — giàu Cơ hơn mặt bằng. Đo lại sau phase 05.

## Cách tái lập

```
npx tsx -e 'import { buildDeck, CARD_DEF_BY_ID } from "./lib/cards";
const d = buildDeck({ dodgeCity: true }); const n = d.length;
console.log("♥", d.filter(c=>c.suit==="hearts").length/n,
            "[2-9]♠", d.filter(c=>c.suit==="spades"&&c.rank>=2&&c.rank<=9).length/n);'
```
