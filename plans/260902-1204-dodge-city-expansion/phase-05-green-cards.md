# Phase 05 — Green

**Ngữ cảnh:** [plan.md](plan.md) · [card-spec.md](card-spec.md) ← spec lấy từ đây · [phase 04](phase-04-new-brown-cards.md)

## Tổng quan

**Ưu tiên:** trung bình · **Trạng thái:** ⬜ chưa làm · **Phụ thuộc:** phase 01, phase 04

Phần đắt nhất của bộ mở rộng: 14 lá, 13 loại, một `CardKind` hoàn toàn mới. Chiếm 35%
số lá nhưng khoảng 60% công.

## Nhận định then chốt

- Green đặt trước mặt như blue, **không dùng được trong chính lượt vừa đánh ra**, lượt sau
  kích hoạt rồi bỏ. Cat Balou / Panic vẫn cướp được như mọi lá trên bàn.
- **Green tách đôi, đây là chỗ dễ sót nhất:** 9 loại kích hoạt trong lượt mình, 4 loại
  (5 lá) mang ký hiệu Missed! nên dùng được **ngoài lượt**.
- Nhóm ngoài lượt phải chen vào `respond()`. Hiện `lib/game/index.ts:1491` tìm lá Missed!
  bằng `target.hand.findIndex(...)` — **chỉ trên tay**. Green nằm ở `equipment`, nên đây
  chính xác là dòng phải mở rộng.
- Bot mù green: bảng giá trị ở `lib/bot.ts:78` cho lá lạ về `?? 2`, và bot không có khái
  niệm "kích hoạt đồ trên bàn". Nếu sim phải nudge mới thấy bot dùng green thì đó là dấu
  **UI/engine chưa tới**, không phải bot ngu — đừng vá bằng nudge.
- Hàng trang bị 3D vừa sửa xong ở `ed70fb2`. Green thêm trạng thái thứ hai lên đúng hàng đó.

## Yêu cầu

**Kích hoạt trong lượt mình (9 loại)**

| Lá | Spec | Hiệu ứng | Tiêu hạn mức Bang!? |
|---|---|---|---|
| Buffalo Rifle | `QC` | Bang! người bất kỳ, mọi khoảng cách | không (Rule 5) |
| Can Can | `JC` | ép 1 người bất kỳ bỏ 1 lá | — |
| Canteen | `7H` | hồi 1 máu | — |
| Conestoga | `9D` | cướp 1 lá của người bất kỳ | — |
| Derringer | `7S` | Bang! khoảng cách 1, rút 1 lá | không (Rule 5) |
| Howitzer | `9S` | Bang! vào **tất cả** người khác (= Gatling) | không (Rule 5) |
| Knife | `8H` | Bang! khoảng cách 1 | không (Rule 5) |
| Pepperbox | `AH` | Bang! ở **tầm bình thường của bạn** | không (Rule 5) |
| Pony Express | `QD` | rút 3 lá | — |

**Dùng ngoài lượt (4 loại, 5 lá)**

| Lá | Spec | Hiệu ứng |
|---|---|---|
| Bible | `10H` | tính là Missed! + rút 1 lá |
| Iron Plate | `AD QS` | tính là Missed! |
| Sombrero | `7C` | tính là Missed! |
| Ten Gallon Hat | `JD` | tính là Missed! |

**Pepperbox không phải "vô hạn tầm".** Nó là Bang! ở tầm súng bình thường của bạn — giá trị
nằm ở chỗ nó không tốn lá Bang! trên tay. Bản kế hoạch đầu ghi sai chỗ này, đã sửa.

## Kiến trúc

```ts
type CardKind = "brown" | "blue" | "gun" | "green";

// CardDef
greenUse?: "turn" | "reaction";  // kích hoạt trong lượt, hay dùng làm Missed! ngoài lượt

// Card (instance)
readyOnTurn?: number;  // số thứ tự lượt của chủ nhân, tính từ đó mới dùng được
```

Đặt `readyOnTurn` trên **instance lá** chứ không trên player: lá bị cướp rồi đánh lại
phải reset đúng — cùng lý do `playedBy` của Dynamite nằm trên instance.

Action mới `useEquip(code, playerId, cardId, targetId?)`. Nó **không** phải `playCard`:
lá đi từ `equipment` chứ không từ `hand`, và kiểm khác nhau.

Nhóm `reaction` mở rộng `respond()`: khi tìm nguồn Missed!, tìm cả trên tay lẫn trong
equipment có `greenUse: "reaction"` và đã sẵn sàng.

## File liên quan

**Sửa**
- `lib/cards.ts` — `"green"` vào `CardKind`, `greenUse`, `Card.readyOnTurn`, 13 def
- `lib/game/index.ts` — `useEquip`; đặt `readyOnTurn` khi green vào bàn; `respond` tìm
  cả trong equipment (dòng ~1491)
- `lib/game/rules.ts` — green có bị `bannedKinds` chạm không; `canUseAs` cho reaction green
- `lib/game/view.ts` — đẩy trạng thái sẵn sàng của từng green ra view
- `lib/types.ts` — socket `useEquip`; `PendingView` biết có green phản ứng dùng được
- `server.ts` — handler
- `components/room/Table.tsx` — bấm được lá green trên bàn mình
- `components/room/ReactionPanel.tsx` — nút cho 4 lá Missed! green
- `components/three/scene/Cards.tsx` — phân biệt green sẵn sàng / chưa
- `lib/bot.ts` — biết kích hoạt green
- `lib/events.ts` — quyết `bannedKinds` với green
- `lib/i18n.ts` — 13 tên + mô tả

**Tạo**
- `lib/__tests__/greenCards.test.ts`

## Các bước

1. `CardKind` thêm `"green"`, `greenUse`, `readyOnTurn`. Chưa lá nào — chỉ kiểu.
2. `useEquip` + luật "chưa sẵn sàng trong lượt vừa đánh ra". Test bằng 1 def giả.
3. Canteen (đơn giản nhất, không target) → chứng minh vòng đời green chạy.
4. 8 loại `turn` còn lại. Buffalo Rifle / Howitzer / Pepperbox / Knife / Derringer dùng lại
   luật bắn của `playBang`/`playMulti`, đừng viết lại — nhưng **không** tăng `bangsThisTurn`.
5. Mở rộng `respond()` cho 4 lá reaction. Test riêng với Slab the Killer (cần 2 Missed!).
6. 3D: hàng trang bị phân biệt sẵn sàng / chưa.
7. Dạy bot; chạy sim **không nudge**.
8. Quyết `bannedKinds` với green, ghi lý do vào `events.ts`.

## Todo

- [ ] `CardKind: "green"` + `greenUse` + `Card.readyOnTurn`
- [ ] `useEquip` + luật chưa-sẵn-sàng
- [ ] Canteen (lá chứng minh)
- [ ] 8 loại `turn` còn lại, dùng lại handler sẵn có, không tăng `bangsThisTurn`
- [ ] `respond()` tìm Missed! cả trong equipment
- [ ] Bible · Iron Plate ×2 · Sombrero · Ten Gallon Hat
- [ ] 3D: green sẵn sàng vs chưa sẵn sàng
- [ ] Bot kích hoạt được green, sim chạy **không nudge**
- [ ] Quyết `bannedKinds` với green + ghi lý do
- [ ] Rà 13 nhiệm vụ với green
- [ ] Nâng `DC_CARDS_SO_FAR` 26 → 40; lúc này test 10/10/10/10 mới tự bật
- [ ] Chạy lại 3 script sim, so số với phase 01

## Xong khi

- Đánh green ra bàn rồi thử dùng ngay trong lượt đó → bị từ chối.
- Lượt sau dùng được, dùng xong lá vào discard.
- Cat Balou cướp được green chưa sẵn sàng.
- Green bị cướp rồi người khác đánh lại → `readyOnTurn` reset đúng, không dùng được ngay.
- Iron Plate chống được Bang! khi **trên tay không còn lá nào**.
- Slab the Killer: 1 Iron Plate + 1 Missed! trên tay = đủ 2, dodge thành công.
- Bot chơi hết ván có dùng green, **không cần nudge**.
- Đã bắn 1 Bang! trong lượt vẫn kích hoạt được Knife/Derringer/Pepperbox/Buffalo Rifle/Howitzer.
- Pepperbox **không** với tới người ngoài tầm súng; Buffalo Rifle thì có.

## Rủi ro

| Rủi ro | Đối phó |
|---|---|
| **Quên nhánh reaction.** Dễ làm xong 9 lá `turn` rồi tưởng xong | Bước 6 là bước riêng, có test riêng. `respond()` là dòng 1491, không phải `playCard` |
| `readyOnTurn` đặt sai chỗ (trên player thay vì trên lá) → cướp bài phá luật | Test "cướp rồi đánh lại" là test bắt buộc, không phải tuỳ chọn |
| Hàng trang bị 3D vừa sửa xong, dễ hồi quy | Chụp ảnh trước/sau vào `evidence/`, so mắt |
| Bot mù green làm sim che mất tính năng chết | Cấm nudge. Bot không dùng được = engine/UI chưa tới, sửa engine |
| Green vs `bannedKinds: ["blue","gun"]` — luật gốc không nói vì `tied-hands` là sự kiện tự chế | Quyết một lần, ghi lý do vào comment `events.ts`, đừng để mỗi chỗ hiểu một kiểu |
| Pepperbox dễ bị hiểu nhầm thành "vô hạn tầm" | Nó là tầm **bình thường**. Test: đứng ngoài tầm súng thì Pepperbox không với tới |
| 5 lá Bang!-like lỡ tiêu hạn mức Bang!/lượt | Test: bắn 1 Bang! rồi kích hoạt Knife, phải được |

## Bảo mật

`useEquip` là điểm vào socket mới. Kiểm: lá thuộc equipment của chính người gọi, `greenUse`
hợp với ngữ cảnh (`turn` phải trong lượt mình và không có pending; `reaction` phải đúng
đang là người bị nhắm), và lá đã sẵn sàng. Thiếu kiểm "thuộc về ai" là dùng đồ người khác.

## Bước sau

Sau phase này bộ Dodge City đã đủ chất. Còn phase 06 cho trọn 15 nhân vật.
