#!/usr/bin/env bash
# Bật game: terraform apply → EC2 chạy, domain Namecheap tự trỏ qua DDNS, Caddy tự lấy HTTPS.
# Instance mới lúc boot tự pull image :latest từ ECR và khởi động.
# Chỉ cần --deploy khi bạn vừa đổi code và muốn build & đẩy image mới nhất.
#
#   ./scripts/game-up.sh            # bật server (dùng image :latest có sẵn trên ECR)
#   ./scripts/game-up.sh --deploy   # bật server + build & deploy code mới
#
# URL cố định (dùng chung domain Namecheap, subdomain riêng — xem infra/terraform.tfvars).
set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../infra" && pwd)"
# Tôn trọng AWS_PROFILE nếu bạn đã export; nếu không, dùng credential chain mặc định.
export AWS_PROFILE="${AWS_PROFILE:-}"

# DDNS password bắt buộc (biến terraform không có default). Hỏi nếu chưa set.
if [[ -z "${TF_VAR_ddns_password:-}" ]]; then
  read -rsp "Namecheap DDNS password: " TF_VAR_ddns_password
  echo
  export TF_VAR_ddns_password
fi

echo "==> terraform apply${AWS_PROFILE:+ (profile=$AWS_PROFILE)}"
cd "$INFRA_DIR"
# Bảo đảm backend khớp cấu hình hiện tại (tự sửa khi backend.tf đổi, ví dụ
# dynamodb_table -> use_lockfile). -reconfigure vì state không di chuyển.
terraform init -reconfigure -input=false >/dev/null
terraform apply -auto-approve

URL=$(terraform output -raw game_url)
echo
echo "==> Server đang khởi động. URL game: $URL"

if [[ "${1:-}" == "--deploy" ]]; then
  echo "==> Trigger deploy (build image mới)…"
  gh workflow run deploy.yml
  echo "    Xem tiến độ: gh run watch"
else
  echo "==> Bỏ qua deploy (instance tự pull :latest). Đợi ~1-2 phút rồi mở URL."
  echo "    Nếu vừa đổi code, chạy lại với: ./scripts/game-up.sh --deploy"
fi
