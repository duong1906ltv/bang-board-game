# Phase 03 — 11 nhân vật rẻ + 3 nút năng lực

**Ngữ cảnh:** [plan.md](plan.md) · [phase 01](phase-01-deck-infrastructure-and-toggle.md) · **số đo:** [evidence/phase-03-characters.md](evidence/phase-03-characters.md)

## Tổng quan

**Ưu tiên:** cao · **Trạng thái:** 🟡 xong engine + bot, còn ảnh nhân vật và xem mắt · **Phụ thuộc:** phase 01

11 nhân vật Dodge City diễn đạt được bằng `CharacterEffect`, cộng 3 người cần nút bấm
chủ động theo khuôn Sid Ketchum đã có. Để lại 4 người khó cho phase 06.

## Nhận định then chốt

- `CharacterEffect` đã là data và engine đọc ở checkpoint cố định — đó chính là lý do
  8 nhân vật đầu chỉ tốn 1 field + 1 checkpoint mỗi người.
- 3 nhân vật "nút bấm" có tiền lệ nguyên vẹn: `burnTwoToHeal` của Sid Ketchum, xem
  `lib/game/index.ts:1638` (`useAbility`) và `components/room/Table.tsx:169`.
- Pool draft **tự động** rộng ra: `startGame` lấy `shuffle(CHARACTERS).slice(0, n*2)`
  (`index.ts:188`). Nhưng phải lọc theo `dodgeCityOn`, nếu không bộ gốc cũng ra nhân vật mới.

## Yêu cầu

**Chức năng — 8 nhân vật 1 field**

| Nhân vật | Máu | Năng lực | Field mới | Checkpoint |
|---|---|---|---|---|
| Pixie Pete | 3 | rút 3 thay vì 2 | `drawCountDelta: 1` | `index.ts:486` (draw phase) |
| Sean Mallory | 3 | giữ tối đa 10 lá cuối lượt | `handLimitOverride: 10` | `rules.ts:handLimitOf` |
| Tequila Joe | 4 | mỗi Beer hồi 2 | `beerHealDelta: 1` | `playBeer` + nhánh Beer trong `respond` |
| Bill Noface | 4 | rút 1 + 1 mỗi vết thương | `drawMode: "noface"` | `index.ts:486` |
| Greg Digger | 4 | ai đó chết → hồi 2 | `healOnDeath: 2` | `index.ts:1797` (xử lý chết) |
| Herb Hunter | 4 | ai đó chết → rút 2 | `drawOnDeath: 2` | `index.ts:1797` |
| Elena Fuente | 3 | mọi lá dùng làm Missed! | `anyAsMissed: true` | `rules.ts:canUseAs` |
| Apache Kid | 3 | miễn nhiễm bài Rô của người khác | `immuneSuit: "diamonds"` | `rules.ts:targetProblem` |

**Chức năng — 3 nút năng lực**

| Nhân vật | Máu | Năng lực | Ghi chú |
|---|---|---|---|
| Chuck Wengam | 4 | mất 1 máu → rút 2, trong lượt mình | **không** dùng được ở máu cuối |
| Doc Holyday | 4 | bỏ 2 lá → bắn 1 Bang!, 1 lần/lượt | Bang! này **không** tính vào hạn mức |
| José Delgado | 4 | bỏ 1 lá blue trên tay → rút 2, 2 lần/lượt | đếm lượt dùng riêng |

## Kiến trúc

`useAbility(code, playerId, kind, cardIds?)` — mở rộng hàm đã có cho Sid Ketchum thành
nhiều `kind`. Bộ đếm số lần dùng trong lượt sống ở `Room` cạnh `bangsThisTurn`
(`docHolydayUsed`, `joseDelgadoUses`), reset cùng chỗ.

`immuneSuit` đặt ở `targetProblem` chứ không ở từng handler: đó là cửa duy nhất mà cả
engine lẫn view đi qua, nên crosshair client vẽ và play server nhận không thể lệch nhau.

`anyAsMissed` mở rộng `canUseAs` — Elena Fuente là trường hợp tổng quát của `useAs`,
đừng thêm nhánh riêng.

## File liên quan

**Sửa**
- `lib/types.ts` — 8 field mới trên `CharacterEffect`, 11 entry `CHARACTERS` + cờ bộ
- `lib/game/index.ts` — draw phase, xử lý chết, `playBeer`, `useAbility`, bộ đếm lượt
- `lib/game/rules.ts` — `handLimitOf`, `canUseAs`, `targetProblem`
- `lib/game/state.ts` — bộ đếm dùng năng lực trong lượt
- `lib/game/view.ts` — cờ "nút năng lực nào đang bấm được"
- `components/room/Table.tsx` — nút cho 3 năng lực mới
- `lib/i18n.ts` — 11 tên + mô tả (vi/en)
- `lib/characterArt.ts` — 11 id
- `lib/bot.ts` — bot phải biết dùng nút, ít nhất Chuck Wengam khi đang giàu máu

**Tạo**
- `lib/__tests__/dodgeCityCharacters.test.ts`

## Các bước

1. Thêm cờ bộ vào `Character` (`set: "base" | "dodge-city"`), lọc pool draft theo
   `room.dodgeCityOn` ở `index.ts:188`. Test: tắt toggle → pool chỉ có 16 người cũ.
2. 8 field một-checkpoint, mỗi người một commit nhỏ, mỗi người một test.
3. Bộ đếm lượt + `useAbility` nhiều `kind`.
4. 3 nút năng lực + UI + view flag.
5. i18n + art id (ảnh bù sau, glyph 🤠 là fallback chấp nhận được).
6. Dạy bot 3 nút mới.

## Todo

- [x] `Character.set` + lọc pool draft theo toggle — `charactersInPlay()` cùng khuôn
      `buildDeck()`. Field **bắt buộc**, không optional: quên khai là lọt sang bàn bộ gốc.
- [x] Pixie Pete · Sean Mallory · Tequila Joe · Bill Noface
- [x] Greg Digger · Herb Hunter (cùng checkpoint xử lý chết)
- [x] Elena Fuente (`canUseAs` tổng quát) · Apache Kid (`targetProblem`)
- [x] Bộ đếm lượt + `useAbility` nhiều kind — đếm theo `AbilityKind` chứ **không** theo
      `docHolydayUsed`/`joseDelgadoUses` như plan ghi: tên nhân vật trong engine đúng là
      thứ cả dự án tránh. Hạn mức nằm ở `ABILITY_USES_PER_TURN` dạng data.
- [x] Chuck Wengam · Doc Holyday · José Delgado + nút UI (`components/room/AbilityBar.tsx`)
- [x] i18n 11 dòng vi/en + test chặn trôi
- [ ] ~~11 id art~~ — **cố ý không làm.** `characterArt.ts` cho phép danh sách tụt lại và
      rơi về glyph 🤠; thêm id mà chưa có file PNG mới là hỏng.
- [x] Bot biết dùng 4 nút (kể cả Sid Ketchum, vốn là tính năng chết từ bộ gốc)
- [x] Test: mỗi nhân vật ≥ 1 test chạm đúng checkpoint
- [x] `scripts/sim-dodge-city.ts` — sim riêng hỏi "tính năng có tới được tay người chơi
      không", cấm mớm bài. Nó bắt được lỗi treo bàn mà 191 test đều bỏ sót.
- [ ] Xem bằng mắt thanh nút năng lực — cần trình duyệt

Phát sinh, đã sửa:

- [x] **Bot treo bàn 19/200 ván.** `playBlock` không kiểm mục tiêu, và
      `nearestEnemyInRange` là cuốn luật thứ hai chép tay. Bot giờ ngắm bằng
      `legalTargetIds`, và duyệt từng lá vì hai lá Bang! khác chất với tới hai tập mục
      tiêu khác nhau. Có test hồi quy, đã thử đỏ/xanh cả hai chiều.

## Xong khi

- Toggle tắt → pool draft đúng 16 nhân vật cũ; bật → 27.
- Mỗi nhân vật mới có ≥ 1 test chạm đúng checkpoint năng lực của nó.
- Chuck Wengam **không** tự sát được ở 1 máu.
- Doc Holyday bắn thêm được cả khi đã hết hạn mức Bang! trong lượt.
- Tequila Joe hồi 2 cả khi chơi Beer chủ động lẫn khi cứu mình lúc hấp hối.
- Apache Kid không bị Bang! Rô, nhưng **vẫn** dính Dynamite Rô (không phải "bài của người khác").

## Rủi ro

| Rủi ro | Đối phó |
|---|---|
| Apache Kid: "bài của người chơi khác" ≠ "mọi lá Rô". Dynamite/Draw! không tính | Viết test cho cả 2 chiều trước khi code |
| Tequila Joe có 2 đường hồi máu (chủ động + hấp hối), dễ sót đường thứ hai | Test cả hai; `respond` nhánh `"beer"` ở `index.ts:1490` là đường dễ quên |
| Nút năng lực mở ra đường bỏ qua luật nếu quên kiểm lượt/phase | `useAbility` kiểm y hệt Sid Ketchum: đúng người, đúng phase, không có `pending` |
| Elena Fuente + `anyAsMissed` có thể làm Duel/Indians hiểu sai | Duel cần **Bang!** chứ không phải Missed! — test riêng để chắc không lẫn |

## Bảo mật

`useAbility` là điểm vào từ socket. Phải kiểm chủ thể (`playerId` khớp người đang chơi),
phase, và `room.pending` — thiếu một cái là mở đường rút bài vô hạn.

## Bước sau

Mở đường cho phase 06 (4 nhân vật khó dùng chung hạ tầng draft/i18n/art của phase này).
