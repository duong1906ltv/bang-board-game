# Phase 02 — số đo bàn 8 người

Đo ngày 2026-09-05. Lệnh tái lập nằm ở cuối mỗi mục.

Cách đọc chung: **so với bàn 4→7 đang chạy thật**, không so với ngưỡng tự nghĩ ra.
Bàn 7 người đã sống ngoài production, nên bất cứ con số nào nó chịu được thì bàn 8
cũng chịu được. Chỉ khi bàn 8 tệ **hơn** mới là việc phải sửa.

## 1. Ghế có đè nhau không — KHÔNG

`arc` chạm trần 1.5π (270°) từ 6 đối thủ, nên người thứ 7 không làm cung rộng thêm,
họ chỉ chen vào. Chen tới mức này:

| Bàn | Đối thủ | seatR | Ghế liền kề gần nhất | Hở so với figure (0.56) |
|---|---|---|---|---|
| 4 | 3 | 2.74 | 4.024 | 3.464 |
| 5 | 4 | 2.87 | 3.374 | 2.814 |
| 6 | 5 | 3.00 | 3.034 | 2.474 |
| 7 | 6 | 3.13 | 2.842 | 2.282 |
| **8** | **7** | **3.26** | **2.495** | **1.935** |

Bàn 8 vẫn hở gấp 3.5 lần bề rộng một figure. `layout()` **không sửa gì** — bước 4 của
phase nói rõ chỉ chỉnh khi số chỉ ra vấn đề.

## 2. Có ai lọt khỏi khung không — KHÔNG, và bàn 8 còn dễ hơn bàn 6

Ghế lệch trục ngắm nhiều nhất đòi khung hình rộng bao nhiêu lần chiều cao:

| Bàn | Ghế lệch nhất | Góc | Khung cần |
|---|---|---|---|
| 4 | seat 3 | 35.7° | 1.38× |
| 5 | seat 1 | 37.9° | 1.50× |
| 6 | seat 5 | 38.7° | **1.54×** ← rộng nhất |
| 7 | seat 6 | 37.2° | 1.46× |
| **8** | **seat 7** | **36.6°** | **1.43×** |

Đỉnh nằm ở bàn **6** người, không phải bàn 8 — vì từ 6 đối thủ trở đi cung không rộng
thêm nữa mà bán kính vẫn nở, nên ghế rìa lùi ra sau chứ không dạt sang ngang.

**Chuyện có sẵn, không phải của phase này:** khung 1.54× nghĩa là điện thoại dựng đứng
(~0.46×) đã cắt mất ghế rìa **từ bàn 4 người**. Nó không phải thứ bàn 8 gây ra.

## 3. Áo có phân biệt được không — có, sau khi thêm màu thứ 8

`AVATAR_COLORS` chỉ có 7 màu và `Players.tsx` đánh màu bằng `i % length`, nên bàn 8 sẽ
cho hai người mặc trùng áo mà không báo lỗi gì. Thêm vàng `#f1c40f`.

Chọn bằng ΔE (CIE Lab), không bằng mắt:

| | ΔE |
|---|---|
| `#f1c40f` tới màu áo gần nhất | 56.9 |
| `#f1c40f` tới nỉ/nền gần nhất | 77.8 |
| Cặp áo sát nhau nhất trong bảng (`#c0392b` đỏ vs `#d35400` cam) | 24.5 |
| Áo chìm vào nền nhất (`#16a085` trên nỉ `#2f7d47`) | 22.3 |

Áo mới cách xa gấp 2.3 lần cặp sát nhau nhất vốn đã dùng được. Vàng chanh `#d4d400`
đo cao hơn (65.2) nhưng chói; gold hợp tông saloon hơn mà vẫn thừa cách biệt.

```
npx tsx scripts/check-table-readability.ts
```

## 4. Ván 8 người có chạy tới đích không — có, 400/400

Cả mục 1–3 đều là hình học. Mục này là ván thật.

| Bàn | events | frozen | overCap | avgTurns | sheriff | outlaws | renegade |
|---|---|---|---|---|---|---|---|
| 5 | off | 0 | 0 | 44.7 | 36% | 59% | 6% |
| 5 | on | 0 | 0 | 39.9 | 37% | 58% | 6% |
| 6 | off | 0 | 0 | 41.5 | 12% | **85%** | 4% |
| 6 | on | 0 | 0 | 37.2 | 10% | **87%** | 4% |
| 7 | off | 0 | 0 | 49.4 | 30% | 67% | 4% |
| 7 | on | 0 | 0 | 46.7 | 39% | 59% | 3% |
| **8** | **off** | **0** | **0** | **52.3** | **28%** | **69%** | **3%** |
| **8** | **on** | **0** | **0** | **49.2** | **23%** | **72%** | **6%** |

200 ván mỗi ô. Cả ba phe đều thắng được ở bàn 8.

**Cán cân:** bàn 8 (outlaw 69–72%) nằm giữa bàn 7 và bàn 6, mà bàn **6** mới là bàn lệch
nhất (85–87%) và nó đang chạy thật. Hai renegade **không** làm cán cân xấu đi.

**Độ dài ván:** 52.3 lượt, dài hơn bàn 7 khoảng 6%. Thêm một ghế thì thêm một lượt mỗi
vòng — đúng như dự đoán, không có gì bất thường.

Đây là bot đánh bot, nên các con số nói về chất lượng bot chứ không nói về người chơi.
Dùng chúng để so bàn với bàn, đừng dùng để chỉnh luật.

```
npx tsx scripts/sim-events.ts 200 8
```

## Còn thiếu

- **Ảnh bàn 8 người.** Cần trình duyệt, chưa chụp. Ba mục hình học ở trên đã trả lời
  câu "có đè nhau / có lọt khung / có trùng áo không" bằng số, nhưng chưa ai nhìn thấy
  nó thật.
