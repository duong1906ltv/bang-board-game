# Nâng cấp sang bộ mở rộng Dodge City

**Ngày:** 2026-09-02 · **Lens:** CTO · **Trạng thái:** đã chốt hướng, chưa lập plan

## Commission

Nâng nhân vật và bộ bài của game lên bộ mở rộng chính thức **Bang! Dodge City**
(Emiliano Sciarra / DvGiochi, 2004): 15 nhân vật + 40 lá bài + bàn 8 người.

**Đã chốt ở buổi tư vấn:**

| Quyết định | Chọn | Lý do |
|---|---|---|
| Bộ nào | Dodge City | Bộ "thêm nhân vật + thêm bài" chuẩn nhất. High Noon / A Fistful of Cards thừa vì `lib/events.ts` đã là tầng sự kiện tự làm. |
| Cách trộn | Toggle theo phòng (`dodgeCityOn`) | Sao y khuôn `missionsOn` đã chạy tốt. Ván gốc còn nguyên, test cũ không vỡ. |
| Trần người | Lên 8 | Đúng luật Dodge City (1 Sheriff / 2 Deputy / 3 Outlaw / 2 Renegade). |
| Art | Ship trước, ảnh bù sau | `cardArtSources()` đã có fallback ảnh → SVG → emoji. |
| Đường đi | 5 lát, lát nào cũng chơi được | Chia nhỏ rủi ro, green nằm cuối. |
| 4 nhân vật khó | Làm hết, để lát riêng | Không chặn 11 nhân vật rẻ. |

## Khảo sát codebase

### Thuận

- `CharacterEffect` (`lib/types.ts:47-72`) là **data**, engine đọc ở checkpoint cố định.
  Thêm nhân vật = thêm 1 dòng, nếu năng lực nằm trong các field sẵn có.
- `CARD_DEFS` (`lib/cards.ts:70`) cũng là data, có `spec` (suit+rank) tự kiểm `count`.
- **`checkWin` đã đúng sẵn với 2 Renegade** (`lib/game/index.ts:1838-1850`): dùng `.every()`
  cho "renegade chết hết", và renegade thắng khi `alive.length === 1`. Không phải sửa gì.
- Toggle có khuôn đủ 6 điểm chạm: `state.ts:145` → `index.ts:283` → `view.ts:269` →
  `types.ts:312` → `rooms.ts:110` → `Lobby.tsx:92`.
- 40 lá mới chia chất **đúng 10/10/10/10** → không làm lệch thêm cửa Draw! đã đo trước đây.
  Nọc 80 → 120 chỉ làm reshuffle thưa hơn.

### Nghịch

- `lib/game/geometry.ts:57-60` hardcode `hasEquip(to,"mustang")` / `hasEquip(from,"scope")`.
  Hideout và Binocular làm đúng việc đó → phải đẩy thành data trên `CardDef` trước khi thêm,
  nếu không sẽ mọc đuôi if.
- `lib/game/index.ts:660-672` là chuỗi `if (card.defId === ...)`. Mỗi brown mới thêm 1 nhánh.
- `lib/bot.ts:78` có bảng giá trị cứng; lá lạ rơi về `?? 2`. Bot **không tự dùng green** cho
  tới khi dạy. Nếu phải nudge trong sim thì đó là dấu UI/engine chưa tới, không phải bot ngu.
- Hàng trang bị 3D vừa sửa xong ở `ed70fb2`. Green phải phân biệt "sẵn sàng / chưa sẵn sàng"
  ngay trên hàng đó.
- 3 tầng homebrew đều tham chiếu `defId` / `CardKind`, phải rà lại:
  `events.ts` (`bannedKinds`, `bannedDefIds`), `missions.ts` (13 nhiệm vụ), `predictions.ts`.

## 40 lá Dodge City, tách theo chi phí

Đây là phát hiện chính: "40 lá mới" không phải một khối.

| Nhóm | Số lá | Chi phí |
|---|---|---|
| Bản sao lá đã có | 16 | ~0 — chỉ thêm chuỗi `spec` thứ hai |
| Blue mới | 2 | rất rẻ, sau khi gom distance vào data |
| Brown mới | 8 | vừa — 5/7 loại dùng chung **một** cơ chế |
| **Green** | 14 | **cao** — `CardKind` thứ 4 |

> **Bảng 40 lá đầy đủ (rank + suit + hiệu ứng) đã chuyển sang**
> [`plans/260902-1204-dodge-city-expansion/card-spec.md`](../260902-1204-dodge-city-expansion/card-spec.md)
> — nguồn duy nhất, các phase đọc từ đó.

**Đính chính (2026-09-02, sau khi có bản in chính thức):** bộ suit tôi lấy từ web ở bản đầu
của báo cáo này **sai 26/34 lá**. Đã bỏ hẳn. Bảng đúng lấy từ bản in
[bang.dvgiochi.com/list_download.php?id=3](https://bang.dvgiochi.com/list_download.php?id=3),
đối chiếu chéo với bảng hiệu ứng do người dùng cung cấp — 33/34 dòng khớp tuyệt đối.

Hai điểm hiệu ứng cũng phải sửa theo:

- **Pepperbox** = Bang! ở **tầm bình thường của bạn**, không phải vô hạn tầm. Giá trị của nó
  là không tốn lá Bang! trên tay.
- **Brawl** — người đánh chọn **tay-hay-bàn cho từng nạn nhân**, nên nó là chuỗi lựa chọn nối
  tiếp (khuôn `openTaken` của Cat Balou), không phải hiệu ứng đồng bộ. Đây là lá đắt nhất
  của phase 04, ban đầu tôi ước lượng nhẹ tay.

Và một điểm luật được làm rõ: **Rule 5** trong bảng nguồn nằm trên Punch, Springfield, Knife,
Derringer, Pepperbox, Howitzer, Buffalo Rifle — cùng nhóm với Duel/Gatling của bộ gốc. Engine
đã xử đúng sẵn (`bangsThisTurn` chỉ tăng trong `playBang`), nên nhóm này **không tiêu hạn mức
Bang!/lượt**.

## 15 nhân vật, tách theo chi phí

| Mức | Ai | Việc |
|---|---|---|
| **Thêm 1 field** | Pixie Pete (rút 3), Sean Mallory (giới hạn tay 10), Tequila Joe (Beer hồi 2), Bill Noface (rút 1 + 1/vết thương), Greg Digger (ai chết → hồi 2), Herb Hunter (ai chết → rút 2), Elena Fuente (mọi lá làm Missed!), Apache Kid (miễn nhiễm bài Rô) | 8 người, mỗi người 1 field + 1 checkpoint |
| **Nút năng lực** | Chuck Wengam (mất 1 máu → rút 2), Doc Holyday (bỏ 2 lá → Bang!), José Delgado (bỏ 1 blue → rút 2, ×2/lượt) | 3 người, khuôn có sẵn: Sid Ketchum `burnTwoToHeal` |
| **Hook mới** | Pat Brennan (rút 1 lá trang bị trên bàn thay vì rút nọc), Molly Stark (đánh bài ngoài lượt → rút 1), Belle Star (trong lượt cô ta, mọi lá trên bàn người khác vô hiệu), **Vera Custer** (đầu lượt chọn 1 người, sao chép năng lực cả lượt) | 4 người, 4 bài toán riêng |

Vera Custer đắt nhất: bắt `charEffect()` thành hàm gián tiếp + thêm 1 pending chọn mục tiêu
đầu lượt. Một mình cô ta bằng 3 người còn lại cộng lại.

## Các đường đã cân

| Đường | Được | Mất |
|---|---|---|
| **1. Trọn bộ một nhát** | 1 branch, 1 lần review, đủ chất ngay | 4 bài toán khó rơi cùng lúc trên nhánh dài; ma trận test nhân đôi vì toggle; vỡ không biết vỡ đâu |
| **2. 5 lát** ✅ | Mỗi lát merge được và chơi được; đuối sức vẫn còn 26/40 lá đã ship | 5 lần review, 5 lần đụng cùng vài file |
| **3. Bỏ green** | Nhanh nhất, không đụng hàng trang bị 3D | Mất đúng cơ chế đặc trưng nhất; thành biến thể nhà chứ không phải Dodge City |

## Hướng đã chốt — Đường 2, 6 lát

| Lát | Nội dung | Sau lát này chơi được gì |
|---|---|---|
| 1 | `CardDef.set` + toggle `dodgeCityOn` + 16 lá bản sao + gom distance vào data + Binocular/Hideout | Nọc 120 lá, bật/tắt được |
| 2 | `MAX_PLAYERS=8`, `ROLE_SETUP[8]`, hình học ghế 3D | Bàn 8 người |
| 3 | 11 nhân vật rẻ + 3 nút năng lực | 30 nhân vật trong pool draft |
| 4 | `costDiscard` (5 lá) + Punch + Dodge | Đủ brown |
| 5 | Green trọn gói (`CardKind` thứ 4) | Dodge City thật |
| 6 | Pat Brennan, Molly Stark, Belle Star, Vera Custer | Đủ 15 nhân vật |

Thứ tự có lý do: lát 1 dọn `geometry.ts` trước khi có ai đứng lên nó; lát 2 tách riêng vì là
bài toán 3D chứ không phải bài toán luật; lát 6 xếp cuối vì 4 người này đụng 4 chỗ khác nhau
và mỗi người xứng đáng được review riêng.

## Cần canh chừng

1. **Gõ nhầm suit khi chép 40 lá.** `buildDeck()` chỉ đếm số lá nên không bắt được — số vẫn
   đúng, ván vẫn chạy, chỉ là chạy một game khác. Thêm test đếm **chất** (phải ra 10/10/10/10)
   và test không-trùng-giá-trị. Đó là cái lưới duy nhất bắt được lỗi loại này.
2. **Brawl đắt hơn vẻ ngoài.** Người đánh chọn tay-hay-bàn cho từng nạn nhân → chuỗi lựa chọn
   nối tiếp trên khuôn `openTaken`, không phải hiệu ứng đồng bộ.
3. **Green với `bannedKinds`.** `tied-hands` cấm `["blue","gun"]`. Green có bị cấm không?
   Phải quyết, và quyết ở `events.ts` chứ không rải trong engine.
4. **13 nhiệm vụ phụ** tham chiếu `defId`: `last-bullet`, `no-shield`, `throw-it-away`,
   `spendthrift`... Punch có tính là "bắn" không? Iron Plate có tính là "khiên" không?
5. **Bot mù green.** Phải dạy `bot.ts`, không được vá bằng nudge trong sim.
6. **Hình học ghế 8 người** phải tính bằng script, không đặt bằng cảm giác.
7. **Chạy lại `scripts/sim-*.ts`** sau lát 1 và lát 5 để đo lại cửa Draw! và nhịp nhiệm vụ
   trên nọc 120 lá.

## Đo thế nào là xong

- `npm test` xanh với **cả hai** trạng thái toggle, không chỉ một.
- `buildDeck({ dodgeCity: true })` trả đúng 120 lá, `buildDeck()` vẫn đúng 80.
- Ván 8 người chạy tới điều kiện thắng trong sim, cả 3 phe đều thắng được.
- Mọi nhân vật mới có ít nhất 1 test chạm đúng checkpoint năng lực của nó.
- Green: có test cho "không dùng được lượt vừa đánh ra" và cho 4 lá Missed! ngoài lượt.
- Không lá nào rơi về emoji glyph mà không cố ý (art bù dần, nhưng biết lá nào còn thiếu).

## Câu còn treo

Cả hai câu treo ban đầu **đã giải** — xem
[card-spec.md](../260902-1204-dodge-city-expansion/card-spec.md):

- ~~Effect text nguyên bản của 5 lá green~~ → có đủ từ bảng hiệu ứng.
- ~~Whisky vs Pony Express, lá nào là Q♣~~ → **Whisky = Q♥**, Pony Express = Q♦. Bản in đọc
  nhầm ♥ thành ♦ ở đúng một ô; sửa lại thì hết trùng, chất cân đúng 10/10/10/10, và không lá
  nào trùng giá trị lá nào trong cả bộ.

Còn treo:

- Green có bị `tied-hands` cấm không — luật gốc không nói vì `tied-hands` là sự kiện tự chế.
- Nhiệm vụ phụ có tính lá Dodge City không, hay chỉ tính lá bộ gốc.
- "Nhóm Rule 5 không tiêu hạn mức Bang!/lượt" là **suy luận** từ chỗ Rule 5 được đặt, chưa
  trích được nguyên văn luật. Nếu đối chiếu bài thật thấy khác thì sửa một chỗ, cả 7 lá cùng.

## Nguồn

- [Danh sách bài in được — BANG! Dodge City, DvGiochi (chính thức)](https://bang.dvgiochi.com/list_download.php?id=3) — **nguồn chốt**: rank + suit đủ 40 lá, 15 nhân vật, 8 vai
- Bảng hiệu ứng do người dùng cung cấp — đối chiếu chéo suit + effect text
- ~~[cardslist.php](https://bang.dvgiochi.com/cardslist.php?id=3&lang=en)~~ — đọc qua web sai suit 26/34 lá, **không dùng**
- [How to play BANG! Dodge City, UltraBoardGames](https://www.ultraboardgames.com/bang/dodge-city.php) — luật green, chia vai 8 người
- [BANG! Dodge City, Bang! cardgame Wiki](https://bang-cardgame.fandom.com/wiki/DODGE_CITY)
- [BANG! Dodge City — Rules (PDF), DvGiochi](https://www.dvgiochi.com/giochi/dodgecity/download/bang_dodge_city-rules.pdf) — chưa đọc được
