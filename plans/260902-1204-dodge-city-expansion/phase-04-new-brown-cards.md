# Phase 04 — Brown mới

**Ngữ cảnh:** [plan.md](plan.md) · [card-spec.md](card-spec.md) ← spec lấy từ đây · [phase 01](phase-01-deck-infrastructure-and-toggle.md)

## Tổng quan

**Ưu tiên:** trung bình · **Trạng thái:** ⬜ chưa làm · **Phụ thuộc:** phase 01

8 lá brown mới, 7 loại. Năm trong số đó chỉ là **một** cơ chế duy nhất — làm cơ chế đó
cho tử tế thì 5 lá xong cùng lúc.

## Nhận định then chốt

- Whisky, Tequila, Brawl, Rag Time, Springfield đều mở đầu bằng "bỏ thêm 1 lá trên tay".
  Đó là `costDiscard: 1` trên `CardDef` + một param mới ở socket play + một bước chọn lá
  thứ hai ở UI. **Một cơ chế, năm lá.**
- Punch = Bang! ở khoảng cách 1. `TargetRule` hiện tại **đã** diễn đạt được:
  `{ maxDistance: 1, shoots: true }`. Chỉ cần dispatch về `playBang` với tầm cố định.
- Dodge = Missed! + rút 1. Nó là lá **phản ứng**, phải chen vào `respond()` ở
  `lib/game/index.ts:1437`, không phải vào `playCard`.
- Phase này dạy client luồng "chọn lá thứ hai" mà phase 05 sẽ dùng lại.

## Yêu cầu

| Lá | Spec | Hiệu ứng | Ghi chú |
|---|---|---|---|
| Punch | `10S` | Bang! ở khoảng cách 1 | Rule 5 → **không** tiêu hạn mức Bang!/lượt. Súng không cộng tầm, Scope có |
| Dodge | `7D KH` | Missed! + rút 1 lá | rút **sau** khi đã tính là Missed! |
| Whisky | `QH` | bỏ thêm 1 lá → tự hồi 2 máu | chặn khi đã đầy máu |
| Tequila | `9C` | bỏ thêm 1 lá → 1 người bất kỳ hồi 1 máu | mọi khoảng cách, được chọn chính mình |
| Brawl | `JS` | bỏ thêm 1 lá → mọi người khác bỏ 1 lá | **người đánh chọn tay-hay-bàn cho TỪNG người** |
| Rag Time | `9H` | bỏ thêm 1 lá → cướp 1 lá của người bất kỳ | mọi khoảng cách |
| Springfield | `KS` | bỏ thêm 1 lá → Bang! người bất kỳ | Rule 5 → không tiêu hạn mức. Barrel/Missed! vẫn chống được |

**Hạn mức Bang!/lượt:** Punch và Springfield mang Rule 5, cùng nhóm Duel/Gatling của bộ gốc.
Engine đã xử đúng sẵn — `room.bangsThisTurn` chỉ tăng trong `playBang` (`index.ts:910`), còn
Duel/Gatling đi handler khác. Punch/Springfield phải theo đúng lối đó: dùng lại luật bắn của
`playBang` nhưng **không** tăng bộ đếm. Lý lẽ đầy đủ ở cuối [card-spec.md](card-spec.md).

**Brawl không đồng bộ được.** Người đánh chọn tay-hay-bàn cho từng nạn nhân, y hệt Cat Balou
(`index.ts:864-872` dùng `openTaken(... "toss" ...)` để mở hộp thoại xác nhận). Brawl là N lần
việc đó, lần lượt. Đây là lá **đắt nhất** của phase này — đừng ước lượng nó như "mọi người bỏ 1 lá".

## Kiến trúc

```ts
// CardDef
costDiscard?: number;  // số lá phải bỏ thêm khi đánh lá này
```

`playCard(..., payCardIds?: string[])` — engine kiểm `payCardIds.length === costDiscard`,
mọi id đều nằm trên tay và **khác** lá đang đánh, bỏ chúng xuống discard **trước** khi
chạy hiệu ứng. `playBlock` thêm một lý do từ chối: không đủ lá để trả giá.

Client: bấm một lá có `costDiscard` → mở bước chọn lá trả giá → rồi mới tới bước chọn
mục tiêu (nếu lá có `target`). Thứ tự này quan trọng: trả giá xong mới ngắm, vì trả giá
có thể làm lá còn lại không đủ.

`noHeal` của sự kiện phải chặn Whisky và Tequila — thêm chúng vào `HEAL_DEF_IDS`
(`lib/game/rules.ts:19`).

## File liên quan

**Sửa**
- `lib/cards.ts` — `costDiscard`, 7 def mới
- `lib/game/index.ts` — `playCard` nhận `payCardIds`; handler Whisky/Tequila/Brawl/Rag Time/
  Springfield/Punch; `respond` biết Dodge
- `lib/game/rules.ts` — `playBlock` (đủ lá trả giá không), `HEAL_DEF_IDS`
- `lib/types.ts` — socket `playCard` thêm `payCardIds`; `PendingAction` biết Dodge
- `server.ts` — truyền param mới
- `components/room/Table.tsx` — bước chọn lá trả giá
- `components/room/ReactionPanel.tsx` — nút Dodge
- `lib/bot.ts` — bảng giá trị + biết trả giá
- `lib/i18n.ts` — 7 tên + mô tả
- `lib/events.ts` — rà `bannedDefIds` của prohibition/silence/fasting
- `lib/missions.ts` — rà 13 nhiệm vụ (xem Rủi ro)

**Tạo**
- `lib/__tests__/dodgeCityBrown.test.ts`

## Các bước

1. `costDiscard` + `playBlock` + `playCard(payCardIds)` — **chỉ hạ tầng**, chưa lá nào dùng.
   Test bằng một def giả trong harness.
2. Whisky (đơn giản nhất, không target) → chứng minh hạ tầng chạy.
3. Tequila, Rag Time, Springfield (có target).
3b. Brawl **sau cùng** trong nhóm này — nó cần chuỗi lựa chọn tay-hay-bàn cho từng nạn nhân,
   dựng trên `openTaken`. Nếu chuỗi pending phình to thì dừng và bàn lại, đừng cố nhét.
4. Punch — dispatch về `playBang` với tầm cố định 1.
5. Dodge trong `respond()` + nút ở `ReactionPanel`.
6. Rà `events.ts` và `missions.ts` (xem Rủi ro), rồi dạy bot.

## Todo

- [ ] `costDiscard` trên `CardDef` + `playBlock` từ chối khi thiếu lá
- [ ] `playCard` nhận `payCardIds`, bỏ giá **trước** hiệu ứng
- [ ] UI: chọn lá trả giá **trước** chọn mục tiêu
- [ ] Whisky · Tequila · Rag Time · Springfield
- [ ] Brawl (chuỗi chọn tay-hay-bàn từng người, làm sau cùng)
- [ ] Punch (dùng luật bắn của `playBang`, tầm 1, **không** tăng `bangsThisTurn`)
- [ ] Dodge trong `respond()` + nút phản ứng
- [ ] Whisky/Tequila vào `HEAL_DEF_IDS`
- [ ] Rà `bannedDefIds` các sự kiện + 13 nhiệm vụ
- [ ] Bot: bảng giá trị + biết trả giá
- [ ] Test 7 lá + test "hết bài không trả giá được"
- [ ] Nâng `DC_CARDS_SO_FAR` 18 → 26 trong `lib/__tests__/deckSets.test.ts`

## Xong khi

- Đánh lá `costDiscard` khi trên tay chỉ còn đúng lá đó → bị từ chối, không crash.
- Springfield bắn được người ngoài tầm, nhưng Barrel/Missed! vẫn chống được.
- Đã bắn 1 Bang! trong lượt vẫn Punch và Springfield được (Rule 5).
- Brawl: người đánh chọn được tay cho người này, bàn cho người kia, trong cùng một lần đánh.
- Dodge tính là Missed! **và** rút được 1 lá, kể cả khi phải bỏ 2 Missed! vì Slab the Killer.
- Prohibition chặn Whisky và Tequila.
- Bot chơi hết ván không kẹt khi cầm bài `costDiscard`.

## Rủi ro

| Rủi ro | Đối phó |
|---|---|
| **Nhiệm vụ phụ hiểu sai lá mới.** `last-bullet`, `no-shield`, `throw-it-away`, `spendthrift` đọc `defId` | Đọc từng nhiệm vụ, quyết rõ Punch có tính "bắn" không, Dodge có tính "khiên" không. Ghi quyết định vào comment, đừng để ngầm |
| Trả giá làm số lá trên tay đổi giữa chừng → index lá lệch | Dùng `cardId` chứ đừng dùng index; engine tự tìm lại sau khi bỏ giá |
| Bot kẹt vì đề xuất nước đi engine từ chối → dừng scheduler, treo bàn | `playBlock` là predicate chung, bot lọc qua đúng nó (như comment ở `rules.ts:78` đã cảnh báo) |
| **Brawl cần N lựa chọn nối tiếp** (tay-hay-bàn cho từng nạn nhân), không xử lý đồng bộ được | Dựng trên `openTaken` đã có; làm sau cùng trong phase; người rời bàn giữa chuỗi phải bỏ qua sạch, xem `clearPending` nhánh `"taken"` ở `index.ts:1030` |
| Punch/Springfield lỡ tiêu hạn mức Bang! → sai luật, khó thấy | Test riêng: bắn 1 Bang! rồi Punch tiếp, phải được |

## Bảo mật

`payCardIds` là input từ client. Phải kiểm: đúng số lượng, mọi id nằm trên tay người đánh,
không trùng nhau, không trùng lá đang đánh. Thiếu kiểm là bỏ bài của người khác được.

## Bước sau

Phase 05 dùng lại luồng chọn mục tiêu và luồng phản ứng dựng ở đây.
