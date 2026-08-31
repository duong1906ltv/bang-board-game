# 🤠 Bang! — Online

Board game **Bang!** chơi realtime nhiều người qua trình duyệt.
Next.js (App Router) + TypeScript + Socket.IO, state lưu in-memory theo phòng.

## Cách chạy (local)

```bash
npm install
npm run dev
```

Mở http://localhost:3000. Để bạn bè cùng chơi trong LAN, họ vào
`http://<IP-máy-bạn>:3000`.

## Test

```bash
npm test
```

Test cho engine (`lib/game.ts`): hình học ghế, giải bài, Draw! check, vòng lượt và
điều kiện thắng. Chạy bằng test runner sẵn có của Node, không thêm dependency.
Engine xáo bài ngẫu nhiên nên test không đấu với shuffle — `lib/__tests__/helpers/table.ts`
dựng ván rồi ghi đè thế bài cho xác định.

## Cấu trúc

| File | Vai trò |
|---|---|
| `server.ts` | Custom server: Next.js + Socket.IO transport |
| `lib/game.ts` | Game engine in-memory (phòng, chia bài, lượt chơi) |
| `lib/cards.ts` | Định nghĩa lá bài & hiệu ứng |
| `lib/cardArt.ts` | Ánh xạ ảnh/mặt bài |
| `lib/types.ts` | Types & sự kiện socket dùng chung client/server |
| `lib/i18n.ts` | Chuỗi ngôn ngữ (Tiếng Việt / English) |
| `lib/socketClient.ts` | Socket singleton + lưu danh tính người chơi |
| `app/page.tsx` | Trang chủ: danh sách phòng đang chờ, tạo phòng |
| `components/RoomList.tsx` | Danh sách phòng chờ (hiển thị) |
| `app/room/[code]/page.tsx` | Phòng game |
| `components/PlayingCard.tsx` | Mặt lá bài (CSS) |
| `app/health/route.ts` | Health check cho deploy smoke test |
| `lib/__tests__/` | Test engine + harness dựng bàn xác định |

## Deploy lên AWS (chơi online thật)

Kiến trúc: `Người chơi → EC2 (Caddy HTTPS → Docker app)`. Domain trỏ qua **Namecheap
Dynamic DNS** (`<subdomain>.<domain>`), instance tự cập nhật IP mỗi lần boot; Caddy tự
xin chứng chỉ Let's Encrypt. CI/CD bằng GitHub Actions + OIDC (không lưu access key).
Không dùng EIP/RDS/CloudFront (game không có DB, là monolith). Chi phí ~ vài đô/tháng
khi bật (EC2 t3.micro), **$0 khi tắt** và **URL giữ nguyên**.

> Domain dùng **chung** với project khác được — chỉ cần khác `ddns_host` (subdomain)
> trong `infra/terraform.tfvars`. DDNS password của Namecheap là chung cho cả domain.
> Nhớ vào Namecheap → Advanced DNS thêm 1 host **"A + Dynamic DNS Record"** đúng tên
> subdomain (mặc định `bang`) trước khi apply.

**Yêu cầu:** AWS CLI đã cấu hình profile, Terraform ≥ 1.6, `gh` CLI, một repo GitHub,
một domain trên Namecheap đã bật Dynamic DNS.

### Cài đặt lần đầu

```bash
# 0. Sửa infra/terraform.tfvars → github_repo = "<owner>/<repo>", ddns_host/ddns_domain
#    (đổi bucket trong infra/backend.tf + scripts/bootstrap-backend.sh nếu tên đã bị chiếm)

# 1. Tạo S3 state bucket (1 lần/account; khoá state dùng lockfile trên S3)
export AWS_PROFILE=<profile-của-bạn>
./scripts/bootstrap-backend.sh

# 2. Provision hạ tầng (DDNS password truyền qua env, không commit)
export TF_VAR_ddns_password='<Namecheap Dynamic DNS Password>'
cd infra && terraform init && terraform apply

# 3. Lấy giá trị đưa vào GitHub repo Variables
#    (Settings → Secrets and variables → Actions → Variables)
terraform output aws_account_id   # → AWS_ACCOUNT_ID
terraform output game_url         # → API_URL

# 4. Push code lên nhánh main → workflow "Deploy game" tự build image,
#    đẩy ECR, rồi SSM redeploy EC2. Xong là mở game_url và chơi!
```

> Lần `apply` đầu, EC2 chưa có image nên container chưa chạy — đó là bình thường.
> Chạy workflow deploy (bước 4) để đẩy image, EC2 sẽ tự pull và khởi động.

### Bật / tắt hằng ngày

Sau khi đã cài đặt lần đầu, dùng 2 script này để bật/tắt cho đỡ tốn tiền:

```bash
./scripts/game-up.sh            # bật server (dùng image :latest có sẵn trên ECR)
./scripts/game-up.sh --deploy   # bật server + build & deploy code mới nhất
./scripts/game-down.sh          # tắt sạch, chi phí về $0
```

`game-up.sh` sẽ hỏi **Namecheap DDNS password** nếu chưa `export TF_VAR_ddns_password`,
rồi tự in ra `game_url`. Nếu đã set profile riêng thì `export AWS_PROFILE=<profile>`
trước khi chạy.

> **URL cố định:** vì dùng Namecheap DDNS (không phải EIP), down→up vẫn giữ nguyên URL
> — không cần chia sẻ lại link hay đổi `API_URL` mỗi lần bật.
