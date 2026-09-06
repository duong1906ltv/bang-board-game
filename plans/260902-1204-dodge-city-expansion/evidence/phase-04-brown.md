# Phase 04 — 7 lá nâu Dodge City

Đo ngày 2026-09-06. Nọc 98 → **106**.

## Sim lại bắt lỗi mà test không bắt — hai lần nữa

`npx tsx scripts/sim-dodge-city.ts 200 6`

**41/200 ván đóng băng.** Cùng họ với lỗi phase 03, lần này do chính bản sửa phase 03:
`nearestShootable` hỏi cứng `legalTargetIds(..., "bang", card)`. Punch chỉ với tới khoảng
cách 1, nên bot ngắm theo tầm súng rồi engine từ chối. Sửa: `asDefId` thành tham số — luật
ngắm ĐANG áp, không phải lá đang cầm.

**Ba tính năng chết**, sim thấy vì nó đếm từng lá:

| Lá | Vì sao chết |
|---|---|
| `dodge` | `findUsableAs` dựng luật riêng từ `swappedFor` — cuốn luật thứ ba, chỉ biết Calamity Janet. Không biết `countsAs` (Dodge) lẫn `anyAsMissed` (Elena Fuente). Bot cầm Dodge cả ván mà không bao giờ đỡ bằng nó. |
| `hideout` | Bảng lá xanh phòng thủ của bot chép tay `["barrel","scope","mustang"]` từ bộ gốc. |
| `binocular` | Như trên. Hai lá này ship từ **phase 01** và đã chết im lặng suốt từ đó. |

Sau khi sửa, 200/200 ván tới đích và cả 9 lá mới đều được đánh:

```
punch 49 · dodge 56 · whisky 7 · tequila 21 · brawl 21
rag-time 53 · springfield 68 · hideout 65 · binocular 62
```

Whisky 7 lần là thấp nhất nhưng không phải 0 — nó cần đúng lúc thủng ≥2 máu mà tay còn dư.

## Brawl — sửa một ghi chú sai của chính kế hoạch

Kế hoạch ghi "người đánh chọn tay-hay-bàn cho TỪNG người", cần một chuỗi N lượt chọn. Sai:
bản in ghi *"all other players discard a card of their choice"* — **của họ chọn**. Tôi suy
nhầm từ khuôn Cat Balou, nơi người đánh thật sự chọn hộ.

Bản đúng rẻ hơn nhiều và đúng kiến trúc hơn: một cửa phản ứng đồng thời như Indians!, mỗi
người tự bỏ, không ai chờ ai. `Pending` kind mới `"toss"`.

Hai bẫy treo bàn ở đây, cả hai đều có test:
- Người **tay trắng bàn trắng** phải được đánh dấu xong ngay, không thì cửa không đóng.
- Cả bàn trắng tay thì **không được mở cửa** nào cả.

## Thứ tự trả giá

`costDiscard` là một cơ chế cho 5 lá. Điều duy nhất khó là thứ tự:

**Kiểm sạch → rồi mới trả giá.** Trả rồi mới phát hiện mục tiêu sai thì người chơi mất hai
lá mà chẳng được gì, và không có đường hoàn. `costPlayProblem` gom mọi điều kiện về một chỗ
đúng vì lý do đó.

Sau khi trả giá, chỉ số lá trên tay đã lệch — phải tìm lại theo `cardId`. Đây đúng chỗ một
chỉ số giữ từ trước sẽ trỏ nhầm sang lá bên cạnh.

## Một lỗ client, phát hiện lúc làm Dodge

`ReactionPanel.doAction` tìm lá đỡ bằng `hand.find(c => c.defId === a)`, cộng một nhánh vá
riêng cho Calamity Janet. Nghĩa là **nút hiện lên mà không gửi được lá nào** với Dodge và
Elena Fuente — server nói đỡ được, client không tìm ra lá.

Sửa bằng cách để server trả `PendingView.usableCardIds`. Và khi có hơn một LOẠI lá đỡ được
thì panel hiện cả hai cho người chơi chọn: một Dodge đỡ xong còn rút lại 1 lá, chọn hộ họ
là chọn mất phần hơn đó.

## Bốn quyết định về nhiệm vụ phụ, ghi rõ chứ không để ngầm

| Nhiệm vụ | Quyết định |
|---|---|
| `no-cover` | Hideout **có** tính là lớp che (bản in Mustang). Binocular **không** — nó rút ngắn khoảng cách bạn NHÌN người khác, một lá tấn công. |
| `no-shield` | Dodge **có** tính là khiên — nó là lá Mancato! có thưởng. |
| `throw-it-away` | Dodge **có** tính là lưới an toàn tự bỏ. |
| `last-bullet` | Punch và Springfield **không** tính. Nhiệm vụ nói về lá Bang! cuối, và Springfield còn phải trả thêm lá nên "bắn bằng lá cuối" không xảy ra được với nó. |

Sự kiện: `prohibition` chặn Whisky/Tequila qua `HEAD_DEF_IDS` + cờ `noHeal`, không cần thêm
vào `bannedDefIds`. `silence` giữ nguyên ba lá nó gọi tên — nó là sự kiện tự chế, không phải
luật gốc, nên mở rộng nó là đổi thiết kế chứ không phải sửa lỗi.
