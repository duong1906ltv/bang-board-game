---
status: pending
priority: medium
branch: main
work_type: feature
spec_waived: "SDD mode off; thiết kế đã chốt ở plans/reports/brainstorm-260902-1204-dodge-city-expansion.md"
blockedBy: []
blocks: []
---

# Bang! Dodge City — bộ mở rộng

Thêm bộ mở rộng chính thức **Dodge City** (DvGiochi, 2004): 15 nhân vật + 40 lá bài
+ bàn 8 người, bật/tắt theo phòng bằng toggle `dodgeCityOn`.

**Thiết kế đã chốt:** [brainstorm-260902-1204-dodge-city-expansion.md](../reports/brainstorm-260902-1204-dodge-city-expansion.md)
**Bảng 40 lá (rank + suit + hiệu ứng):** [card-spec.md](card-spec.md) — nguồn duy nhất, đừng chép lại.

## Nguyên tắc xuyên suốt

- **Bộ gốc phải còn nguyên.** Toggle tắt → ván chạy y hệt hôm nay, test cũ xanh không sửa.
- **Data trước, nhánh sau.** Mọi thứ diễn đạt được bằng `CardDef` / `CharacterEffect` thì
  không được đẻ thêm `if (defId === ...)`.
- **Mỗi phase merge được và chơi được.** Dừng giữa chừng vẫn còn game tốt hơn hôm nay.

## Các phase

| # | Phase | Nội dung | Trạng thái |
|---|---|---|---|
| 01 | [Hạ tầng bộ bài + toggle](phase-01-deck-infrastructure-and-toggle.md) | `CardDef.sets`, `dodgeCityOn`, 16 lá bản sao, gom distance vào data, Binocular + Hideout | ✅ |
| 02 | [Bàn 8 người](phase-02-eight-player-table.md) | `MAX_PLAYERS=8`, `ROLE_SETUP[8]`, hình học ghế 3D, màu áo thứ 8 | ⬜ |
| 03 | [11 nhân vật rẻ + 3 nút năng lực](phase-03-characters-data-driven.md) | 8 field mới trên `CharacterEffect`, 3 ability action theo khuôn Sid Ketchum | ⬜ |
| 04 | [Brown mới](phase-04-new-brown-cards.md) | `costDiscard` (Whisky/Tequila/Brawl/Rag Time/Springfield) + Punch + Dodge | ⬜ |
| 05 | [Green](phase-05-green-cards.md) | `CardKind` thứ 4, cờ sẵn sàng, action kích hoạt, 4 lá Missed! ngoài lượt, bot, 3D | ⬜ |
| 06 | [4 nhân vật khó](phase-06-hard-characters.md) | Pat Brennan, Molly Stark, Belle Star, Vera Custer | ⬜ |

## Phụ thuộc

```
01 ──┬── 02   (độc lập nhau, nhưng 02 nên sau 01 để test toggle trên bàn 8)
     ├── 03 ── 06
     └── 04 ── 05
```

- **01 chặn tất cả** — không có `dodgeCityOn` thì không lá/nhân vật mới nào vào ván được.
- **03 chặn 06** — 4 nhân vật khó dùng chung hạ tầng draft/i18n/art của 03.
- **04 nên trước 05** — `costDiscard` ở 04 dạy client cách chọn lá thứ hai; green ở 05
  dùng lại đúng luồng chọn mục tiêu đó.
- **02 độc lập** với 03/04/05 — nó là bài toán 3D, có thể chen vào bất cứ lúc nào sau 01.

## Đã xác minh — không còn chặn

Hai câu treo ban đầu đều đã giải, xem [card-spec.md](card-spec.md):

1. **Rank + suit đủ 40 lá** từ bản in chính thức DvGiochi, đối chiếu chéo với bảng hiệu ứng.
   33/34 dòng khớp tuyệt đối.
2. **Whisky = Q♥** (bản in đọc nhầm thành Q♦, đụng Pony Express). Sửa lại thì hết trùng,
   chất cân đúng 10/10/10/10, và không lá nào trùng giá trị lá nào.

Còn **một** suy luận chưa trích được nguyên văn: nhóm Rule 5 không tiêu hạn mức Bang!/lượt.
Lý lẽ và cách sửa nếu sai đều nằm ở cuối `card-spec.md`.

## Kiểm thử chung

Mọi phase: `npm test` phải xanh với **cả hai** trạng thái toggle, không chỉ một.
Sau phase 01 và 05: chạy lại `scripts/sim-events.ts`, `sim-missions.ts`, `sim-predictions.ts`
để đo lại cửa Draw! và nhịp nhiệm vụ trên nọc dày hơn.

**Nọc lớn dần theo lát, đừng nhầm với đích:** 80 (gốc) → 98 (phase 01) → 106 (phase 04)
→ 120 (phase 05). Test giữ hằng số `DC_CARDS_SO_FAR` trong `lib/__tests__/deckSets.test.ts`
làm dây bẫy — phase 04 và 05 phải nâng nó, nếu không test đỏ.
