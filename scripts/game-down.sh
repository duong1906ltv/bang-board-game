#!/usr/bin/env bash
# Tắt game: terraform destroy → xóa sạch tài nguyên, chi phí về $0.
# Domain giữ nguyên (Namecheap DDNS), lần sau ./scripts/game-up.sh là chạy lại.
#
#   ./scripts/game-down.sh
set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../infra" && pwd)"
export AWS_PROFILE="${AWS_PROFILE:-}"

# destroy vẫn cần biến ddns_password tồn tại (giá trị không dùng khi hủy).
export TF_VAR_ddns_password="${TF_VAR_ddns_password:-unused}"

echo "==> terraform destroy${AWS_PROFILE:+ (profile=$AWS_PROFILE)}"
cd "$INFRA_DIR"
terraform destroy -auto-approve

echo "==> Đã tắt. Chi phí về \$0. Bật lại: ./scripts/game-up.sh"
