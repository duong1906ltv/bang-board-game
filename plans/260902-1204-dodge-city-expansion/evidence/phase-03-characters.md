# Phase 03 — 11 nhân vật Dodge City

Đo ngày 2026-09-06.

## Lỗi sim bắt được, test không bắt được

Đáng ghi trước mọi thứ khác. Bộ test 191 bài **xanh hết** trong khi **19/200 ván đóng
băng vĩnh viễn**.

Chuỗi nhân quả:

1. Bot lọc nước đi qua `playBlock` — và `playBlock` **không kiểm mục tiêu**, nó chỉ kiểm
   lá bài có được phép đánh không.
2. Bot ngắm bằng `nearestEnemyInRange`, hàm tự lọc theo tầm súng và tự nhớ Truce che
   Sheriff. Một cuốn luật thứ hai, chép tay.
3. Apache Kid thêm luật thứ ba, mà cuốn thứ hai không biết: miễn nhiễm bài chất Rô — và
   nó phụ thuộc vào **chính lá đang cầm**, không chỉ vào hai người.
4. Bot chọn Bang! ♦ nhắm Apache Kid → `playCard` từ chối → `bot.step()` trả `false`.
5. Không chỗ nào trong game có timeout: lịch bot dừng, bàn đứng vĩnh viễn.

Sửa: bot ngắm bằng `game.legalTargetIds(room, me, "bang", card)` — chính danh sách engine
dùng để kiểm. Và duyệt **từng lá** thay vì lấy lá đầu tiên, vì hai lá Bang! khác chất với
tới hai tập mục tiêu khác nhau.

Đã khoá bằng test hồi quy. Bỏ bản sửa ra thì test đỏ, để vào thì xanh — đã thử cả hai chiều.

**Bài học lặp lại:** `nearestEnemyInRange` sinh ra để "bot khỏi phí lượt vào nước engine sẽ
từ chối", rồi tự nó trở thành nguồn của đúng nước đó. Bot không được có luật riêng.

## Sim — không mớm gì

`npx tsx scripts/sim-dodge-city.ts 200 6`

| | Bàn 6 | Bàn 8 |
|---|---|---|
| Tới đích | 200/200 | 150/150 |
| Đóng băng | 0 | 0 |
| Trung bình | 39.5 lượt | 49.8 lượt |
| Nhân vật chưa bao giờ được chia | không ai | không ai |
| Nhân vật chưa bao giờ được chọn | không ai | không ai |

Năng lực bấm nút, số lần bot thật sự bấm (bàn 6, 200 ván):

| | |
|---|---|
| `burn-two-to-heal` (Sid Ketchum) | 51 |
| `lose-life-to-draw` (Chuck Wengam) | 59 |
| `burn-two-to-shoot` (Doc Holyday) | 35 |
| `burn-blue-to-draw` (José Delgado) | 70 |

Sim này cố ý **cấm mớm bài**. Một năng lực không bao giờ chạy nghĩa là engine hoặc UI chưa
tới được nó; mớm chỉ giấu đi đúng cái cần thấy.

Bên lề: Sid Ketchum có từ bộ gốc nhưng bot **chưa bao giờ** dùng năng lực của anh ta. Giờ
51 lần/200 ván — một tính năng chết từ trước, nay sống.

Bộ gốc không hồi quy: `sim-events 150 7` → 0 đóng băng ở cả hai mức sự kiện.

## Ba quyết định về kiến trúc

**`useAbility` một cửa, không phải bốn.** Nó là điểm vào từ socket, nên mỗi lối vào thêm
là một lối nữa phải nhớ kiểm chủ thể, phase và hạn mức. `sidHeal` cũ được gộp vào chứ
không để song song.

**`abilityProblem` ở `rules.ts`, dùng chung view và engine.** Nút sáng lên là vì server nói
bấm được, không phải vì client tự suy. "Nút sáng mà server từ chối" không xảy ra được.

**Bộ đếm theo `AbilityKind`, không theo tên nhân vật.** Kế hoạch ban đầu ghi `docHolydayUsed`
/ `joseDelgadoUses`; đó đúng là kiểu engine-biết-tên-ai mà cả dự án tránh. `abilityUsesThisTurn`
khoá theo việc, và hạn mức mỗi lượt nằm trong `ABILITY_USES_PER_TURN` dạng data.

## Chi tiết luật dễ sai

**José Delgado — "lá xanh" gồm cả súng.** Bản in gốc in súng viền xanh; engine tách `gun`
thành `CardKind` riêng. Không nhận cả hai thì anh ta mất đúng một nửa số lá được phép đốt.

**Apache Kid — "bài của người KHÁC", không phải "mọi lá Rô".** Bài của chính anh ta bình
thường, và Dynamite ♦ vẫn nổ vào anh ta vì nó không đi qua `targetProblem`. Có test cả hai
chiều.

**Tequila Joe — hai đường hồi máu.** Chủ động qua `playBeer`, và lúc hấp hối qua nhánh
`"beer"` của `respond`. Đường thứ hai còn phải trừ `beersNeeded` đúng **số máu vừa hồi**,
không phải trừ 1 cứng — nếu không anh ta vẫn phải uống đủ số chai của người thường và năng
lực chỉ có tác dụng một nửa.

**Elena Fuente — một chiều.** Mọi lá đỡ được Bang!, nhưng không lá nào biến thành Bang!.
Duel đòi Bang! thật. Có test riêng cho chiều ngược.

**Doc Holyday — Bang! không mang chất.** Hai lá bỏ đi là cái giá, không phải viên đạn, nên
Apache Kid **không** miễn nhiễm với phát này.

## Còn thiếu

- **Ảnh 11 nhân vật.** `characterArt.ts` cố ý cho phép danh sách tụt lại — thiếu id thì rơi
  về glyph 🤠, còn thêm id mà không có file PNG mới là hỏng. Nên không đụng vào nó.
- **Chưa xem bằng mắt.** Thanh nút năng lực (`AbilityBar.tsx`) chưa ai mở trình duyệt nhìn.
