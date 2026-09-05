# Phase 01 — Hạ tầng bộ bài + toggle

**Ngữ cảnh:** [plan.md](plan.md) · [card-spec.md](card-spec.md) ← spec lấy từ đây · [báo cáo tư vấn](../reports/brainstorm-260902-1204-dodge-city-expansion.md)

## Tổng quan

**Ưu tiên:** cao (chặn mọi phase khác) · **Trạng thái:** ✅ xong (2026-09-02)

Dựng đường ray cho cả bộ mở rộng: cách khai báo một lá thuộc bộ nào, cách bật/tắt theo
phòng, rồi đi 18 lá rẻ nhất để chứng minh đường ray chạy.

## Nhận định then chốt

- `CardDef` hiện có **một** chuỗi `spec`. Dodge City thêm bản sao cho 12 lá đã tồn tại
  (Bang ×4, Beer ×2, ...) nên `spec` phải tách theo bộ, không phải nhân đôi `CardDef`.
- `lib/game/geometry.ts:57-60` hardcode `hasEquip(to,"mustang")` và `hasEquip(from,"scope")`.
  Binocular và Hideout làm **đúng** hai việc đó. Chép thêm 2 dòng là bắt đầu mọc đuôi —
  phải đẩy thành data trên `CardDef` **trước**, rồi 2 lá mới chỉ là 2 dòng dữ liệu.
- Toggle có khuôn `missionsOn` đủ 6 điểm chạm, sao y là xong.

## Yêu cầu

**Chức năng**
- `buildDeck()` không tham số → đúng 80 lá như hôm nay.
- `buildDeck({ dodgeCity: true })` → đúng **98 lá** (80 + 18 lá của lát này).
  Nọc chỉ đầy 120 sau phase 05 — 18 → 26 (phase 04) → 40 (phase 05).
- Chủ phòng bật/tắt được ở lobby; cài đặt sống qua `restart()` như `eventLevel`/`missionsOn`.
- Không bật/tắt được khi `phase !== "lobby"` (nọc chia một lần lúc bắt đầu).
- Binocular cộng dồn với Scope và Rose Doolan; Hideout cộng dồn với Mustang và Paul Regret.

**Phi chức năng**
- Toggle tắt → mọi test hiện có xanh, không sửa một dòng test nào.

## Kiến trúc

`CardDef.spec: string` → `CardDef.specs: { base?: string; dodgeCity?: string }`.
`buildDeck(sets)` duyệt từng def, lấy các spec của những bộ đang bật, kiểm tổng số lá
khớp `count` **theo từng bộ** (giữ nguyên tính chất tự-kiểm hiện có).

Distance chuyển từ code sang data — thêm vào `CardDef`:

```ts
seenFartherBy?: number;  // Mustang, Hideout: người khác thấy chủ nhân xa hơn
seesCloserBy?: number;   // Scope, Binocular: chủ nhân thấy người khác gần hơn
```

`distanceBetween()` cộng dồn qua `p.equipment` thay vì gọi `hasEquip` theo tên.

## File liên quan

**Sửa**
- `lib/cards.ts` — `specs`, `buildDeck(sets)`, 2 field distance, 12 spec dodgeCity, 2 def mới
- `lib/game/geometry.ts` — `distanceBetween` đọc data thay vì tên lá
- `lib/game/state.ts` — `Room.dodgeCityOn`
- `lib/game/index.ts:246` — `shuffle(buildDeck(...))` theo cài đặt phòng; setter `setDodgeCityOn`
- `lib/game/view.ts` — đẩy `dodgeCityOn` ra view
- `lib/game/rooms.ts` — mặc định `false` khi tạo phòng
- `lib/types.ts` — `TableView.dodgeCityOn`, socket `setDodgeCityOn`
- `server.ts` — handler `setDodgeCityOn` (chặn ngoài lobby, giống `setMissionsOn` ở dòng 250)
- `app/room/[code]/page.tsx` — emit
- `components/room/Lobby.tsx` — nút toggle
- `lib/i18n.ts` — nhãn toggle + tên/mô tả Binocular, Hideout
- `lib/cardArt.ts` — glyph cho 2 lá mới

**Tạo**
- `lib/__tests__/deckSets.test.ts`

## Các bước

1. Đổi `spec` → `specs`, cập nhật 22 def hiện có sang `specs: { base: "..." }`. `buildDeck()`
   giữ nguyên chữ ký (mặc định chỉ bộ gốc) để chưa gì vỡ.
2. Thêm `seenFartherBy` / `seesCloserBy` vào `CardDef`, gắn cho Mustang (1) và Scope (1).
   Sửa `distanceBetween` đọc data. Chạy `seatGeometry.test.ts` — phải xanh không sửa.
3. Thêm `specs.dodgeCity` cho 12 def — chép nguyên từ [card-spec.md](card-spec.md):
   bang `8S 5C 6C KC`, beer `6H 6S`, cat-balou `8C`, general-store `AS`, indians `5D`,
   missed `8D`, panic `JH`, barrel `AC`, dynamite `10C`, mustang `5H`, remington `6D`,
   rev-carabine `5S`.
4. Thêm 2 def mới: `binocular` (`10D`, blue, `seesCloserBy: 1`), `hideout` (`KD`, blue,
   `seenFartherBy: 1`), cả hai chỉ có `specs.dodgeCity`.
5. `buildDeck(sets?: { dodgeCity?: boolean })`.
6. Chuỗi toggle: state → setter → view → types → rooms → server → page → Lobby → i18n.
7. Test.

## Todo

- [x] `specs` thay `spec`, 22 def cũ chuyển sang `specs.base`
- [x] `seenFartherBy` / `seesCloserBy` là data, `distanceBetween` đọc data
- [x] 12 spec `dodgeCity` cho lá đã có
- [x] `binocular` + `hideout`
- [x] `buildDeck(sets)` + kiểm số lá theo bộ
- [x] `Room.dodgeCityOn` + setter (chặn ngoài lobby) + sống qua `restart()`
- [x] View → types → server → page → Lobby → i18n
- [x] Test: 80 / 98 lá, Binocular cộng dồn Scope, Hideout cộng dồn Mustang
- [x] Test: không lá Dodge City nào trùng giá trị lá nào (đúng ở mọi lát)
- [x] Test: không chất nào chiếm quá nửa phần đã chép (10/10/10/10 chỉ kiểm khi đủ 40)
- [x] Đo lại cửa Draw! trên nọc 98 → [evidence/phase-01-draw-odds.md](evidence/phase-01-draw-odds.md)

## Xong khi

- `buildDeck()` = 80 lá, `buildDeck({dodgeCity:true})` = 98 lá, cả hai đều tự kiểm `count`.
- Không hai lá Dodge City nào cùng rank+suit, và không chất nào chiếm quá nửa.
  (Kiểm 10/10/10/10 đầy đủ chỉ chạy được khi đủ 40 lá — phase 05.)
- Toàn bộ test cũ xanh **không sửa dòng nào**.
- Bật toggle giữa ván bị từ chối; bật ở lobby thì sống qua `restart()`.
- Rose Doolan + Scope + Binocular = thấy gần hơn 3.

## Rủi ro

| Rủi ro | Đối phó |
|---|---|
| Đổi `spec` → `specs` chạm cả 22 def, dễ gõ nhầm suit/rank | `buildDeck` đã tự kiểm `count`; giữ nguyên tính chất đó **theo từng bộ**, đừng gộp tổng |
| Gõ nhầm suit khi chép 40 lá — `count` không bắt được vì số lá vẫn đúng | Thêm 1 test đếm **chất**: bộ Dodge City phải ra đúng ♠10 ♣10 ♥10 ♦10, và không lá nào trùng giá trị lá nào |
| `distanceBetween` là "chỗ yên tĩnh nhất để lỗi ẩn mình" (comment ở đầu geometry.ts) | Sửa distance là bước 2 **riêng**, chạy `seatGeometry.test.ts` xanh rồi mới đi tiếp |
| Nọc dày hơn làm reshuffle thưa hơn, ảnh hưởng nhiệm vụ/sự kiện | Chạy 3 script sim, so số trước/sau, ghi vào evidence/ |

## Bảo mật

Không có bề mặt mới. `setDodgeCityOn` phải kiểm chủ phòng **và** phase giống hệt
`setMissionsOn` — nếu không, người chơi bất kỳ đổi được luật phòng.

## Bước sau

Mở đường cho phase 02, 03, 04. Sau phase này ván Dodge City đã "chơi được" ở mức nọc dày hơn.
