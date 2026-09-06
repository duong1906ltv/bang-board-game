# Phase 06 — 4 nhân vật khó

**Ngữ cảnh:** [plan.md](plan.md) · [phase 03](phase-03-characters-data-driven.md)

## Tổng quan

**Ưu tiên:** thấp · **Trạng thái:** 🟡 xong engine + bot, chưa xem mắt · **Phụ thuộc:** phase 03

Bốn nhân vật còn lại, mỗi người một bài toán riêng, đụng bốn chỗ khác nhau trong engine.
Xếp cuối vì thế — mỗi người xứng đáng một lượt review riêng, không gộp.

## Nhận định then chốt

- Đây **không** phải một nhóm. Nó là 4 việc độc lập tình cờ cùng là "nhân vật".
  Làm tuần tự, review riêng, và bỏ bớt được nếu đuối sức mà không hỏng phần còn lại.
- Vera Custer một mình đắt bằng 3 người kia cộng lại: cô ta bắt `charEffect()` — hàm mà
  **toàn bộ** engine gọi để hỏi năng lực — thành hàm gián tiếp.

## Yêu cầu

### Pat Brennan (4 máu)
Thay vì rút 2 lá, có thể rút **1 lá trang bị trên bàn** của người bất kỳ.

`drawMode: "brennan"`. Có tiền lệ gần: Jesse Jones (`drawMode: "jesse"`) đã rút từ tay
người khác, và `view.ts:236-238` đã có cơ chế công bố "tay của ai với tới được". Làm y
khuôn đó, đổi nguồn từ `hand` sang `equipment`.

### Molly Stark (4 máu)
Mỗi lần **chủ động** đánh hoặc bỏ một lá **ngoài lượt mình**, rút 1 lá.

`drawOnOutOfTurnPlay: true`. Khó ở chỗ "ngoài lượt" rải khắp: `respond()` các nhánh
missed/beer/bang, nhánh bỏ bài của Indians/Brawl/Duel. Phải tìm **một** chỗ chung để đặt
hook, không rải 6 chỗ.
- "Chủ động" loại trừ: bị Cat Balou/Panic lấy, bị Brawl ép bỏ, bỏ bài cuối lượt.
- Duel: mỗi lá Bang! bỏ ra trong Duel **có** tính, kể cả khi cô ta là người khởi Duel? →
  không, khi cô ta khởi Duel thì đó là lượt cô ta. Chỉ tính khi cô ta là bên bị thách.

### Belle Star (4 máu)
Trong lượt cô ta, **mọi lá trên bàn của người khác không có tác dụng**.

`suppressOthersEquip: true`. Chạm `geometry.ts` (Mustang/Hideout của người khác thôi cộng
khoảng cách) và `barrelAttempts` (Barrel của người khác thôi chống đỡ). Cả hai hàm hiện
**không** biết "đang là lượt của ai" — `barrelAttempts(p)` còn không nhận `room`.
Phải luồn ngữ cảnh vào, và đó là thay đổi chữ ký lan ra nhiều chỗ gọi.

Không chạm: Jail/Dynamite (đó là lá của **chính** chủ nhân, không phải "tác dụng lên
Belle Star"), và súng (người khác không bắn trong lượt cô ta).

### Vera Custer (3 máu)
Đầu mỗi lượt của mình, chọn 1 người khác còn sống và **sao chép năng lực người đó** cả lượt.

Cần: một `pending` chọn mục tiêu đầu lượt (khuôn có sẵn: `kind: "kit"` cũng là pending
chọn ở đầu lượt), một field `room.veraCopyId`, và `charEffect()` ở `lib/game/deck.ts:22`
trả năng lực của người được sao chép khi hỏi về Vera.

Bẫy: Vera sao chép Vera khác → phải chặn (bàn 8 người có thể có 2 Vera? Không — mỗi
nhân vật chỉ một bản trong pool). Vera sao chép người có `drawMode` → phải chọn **trước**
draw phase, nên pending đặt trước `turnPhase = "draw"`.

## File liên quan

**Sửa**
- `lib/types.ts` — 4 field mới trên `CharacterEffect`, 4 entry `CHARACTERS`
- `lib/game/deck.ts:22` — `charEffect` gián tiếp cho Vera
- `lib/game/index.ts` — drawMode brennan; hook Molly; pending Vera đầu lượt
- `lib/game/geometry.ts` — `barrelAttempts` / `distanceBetween` nhận ngữ cảnh lượt (Belle Star)
- `lib/game/state.ts` — `room.veraCopyId`
- `lib/game/view.ts` — Pat Brennan: bàn của ai với tới được; Vera: đang sao chép ai
- `components/room/DrawControls.tsx` — chế độ rút của Pat Brennan
- `components/room/Table.tsx` — chọn mục tiêu cho Vera đầu lượt
- `lib/i18n.ts`, `lib/characterArt.ts`, `lib/bot.ts`

**Tạo**
- `lib/__tests__/hardCharacters.test.ts`

## Các bước

Làm **tuần tự**, mỗi người một commit, dễ trước khó sau:

1. **Pat Brennan** — gần Jesse Jones nhất, dùng lại khuôn view sẵn có.
2. **Molly Stark** — tìm **một** chỗ chung đặt hook trước khi viết dòng nào. Nếu không có
   chỗ chung thì dựng một chỗ (ví dụ một hàm `notePlayedOutOfTurn`), đừng rải 6 nơi.
3. **Belle Star** — đổi chữ ký `barrelAttempts` / `distanceBetween` trước, chạy
   `seatGeometry.test.ts` xanh, rồi mới cắm năng lực.
4. **Vera Custer** — cuối cùng. Pending đầu lượt trước, `charEffect` gián tiếp sau.

## Todo

- [x] Pat Brennan: `drawMode: "brennan"` + view công bố bàn với tới được. Client dùng lại
      đúng cơ chế chọn-lá-trên-bàn của Cat Balou / Panic, kể cả bàn của chính anh ta.
- [x] Molly Stark: **một** chỗ chung — `spendReaction`. Hoá ra "chủ động, ngoài lượt"
      không rải khắp engine như plan lo: bạn chỉ tự nguyện bỏ lá ngoài lượt khi TRẢ LỜI
      một cửa phản ứng, và mọi đường đều hẹp về đó. Duel được kéo qua cùng cửa.
- [x] Molly Stark: loại trừ bị-cướp (đi `openTaken`), bị-ép-bỏ (nhánh `toss`),
      bỏ-cuối-lượt (đang là lượt mình). Điều kiện lượt kiểm TRONG hook, không ở nơi gọi.
- [x] Belle Star: đổi chữ ký `barrelAttempts` trước, 223 test cũ xanh, rồi mới cắm năng lực
- [x] Belle Star: Mustang/Hideout/Barrel **và cả Iron Plate** của người khác vô hiệu —
      green trên bàn cũng là lá trên bàn. Nhân vật thì KHÔNG bị chạm (Jourdonnais giữ
      Barrel bẩm sinh, Paul Regret giữ +1 khoảng cách).
- [x] Vera Custer: pending `"copy"` mở **trước** draw phase, và mở lại đúng lúc tấm thẻ
      Dynamite/Jail được gạt đi
- [x] Vera Custer: `effectiveEffect` gián tiếp một tầng, reset ở `beginTurn` và `restart`
- [x] i18n 4 dòng + bot biết trả lời cửa của Vera và rút kiểu Brennan
- [ ] ~~4 id art~~ — cùng lý do phase 03, `characterArt.ts` cố ý cho phép tụt lại
- [x] Test riêng cho từng người — 14 test
- [ ] Xem bằng mắt — cần trình duyệt

## Xong khi

- Đủ 15 nhân vật Dodge City, pool draft = 31 người khi bật toggle.
- Pat Brennan rút được lá trang bị trên bàn người khác, và bàn trống thì rút nọc như thường.
- Molly Stark rút khi bỏ Missed! chống Bang!, **không** rút khi bị Cat Balou lấy bài.
- Belle Star bắn xuyên Mustang và Barrel của người khác trong lượt cô ta; ngoài lượt thì không.
- Vera Custer sao chép Kit Carlson → draw phase lượt đó chạy đúng kiểu Kit.
- Vera Custer hết lượt thì trả về năng lực rỗng, không dính sang lượt sau.

## Rủi ro

| Rủi ro | Đối phó |
|---|---|
| **Molly Stark rải hook 6 chỗ** rồi sót 1 chỗ, thành bug im lặng | Bước 2 bắt buộc tìm/dựng chỗ chung **trước**. Nếu không tìm được, dừng và hỏi |
| **Belle Star đổi chữ ký `distanceBetween`** — "chỗ yên tĩnh nhất để lỗi ẩn mình" | Đổi chữ ký là bước riêng, `seatGeometry.test.ts` phải xanh trước khi cắm năng lực |
| **Vera Custer làm `charEffect` đệ quy** nếu sao chép chính mình hoặc vòng | Chặn tự-sao-chép; `charEffect` không được gọi lại chính nó quá 1 tầng |
| Vera + drawMode: chọn sau draw phase thì năng lực vô nghĩa | Pending đặt **trước** `turnPhase = "draw"` |
| Cả 4 người đều đụng chỗ nóng, gộp vào 1 PR thì không review nổi | 1 người = 1 commit = 1 lượt review. Bỏ bớt được người cuối mà không hỏng 3 người trước |

## Bảo mật

Pending của Vera là điểm vào socket. Kiểm: đúng người, đúng thời điểm (đầu lượt mình),
mục tiêu còn sống và khác chính mình. `veraCopyId` phải reset ở `endTurn` — quên reset là
giữ năng lực người khác vĩnh viễn.

## Bước sau

Đóng bộ mở rộng. Sau phase này chạy lại toàn bộ sim và cập nhật `README.md`.
