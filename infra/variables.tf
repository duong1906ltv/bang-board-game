variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-1"
}

variable "aws_profile" {
  description = "Local AWS CLI profile (~/.aws/credentials). Leave empty to use env/instance creds."
  type        = string
  default     = null
}

variable "project_name" {
  description = "Short prefix used for resource names and tags"
  type        = string
  default     = "bang"
}

variable "github_repo" {
  description = "GitHub repo in <owner>/<name> form (for OIDC trust policy)"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "instance_type" {
  description = "EC2 instance type (x86_64 — matches the amd64 Docker image)"
  type        = string
  default     = "t3.micro"
}

# ─── Namecheap Dynamic DNS ─────────────────────────────────────────────────────
# Không dùng Elastic IP (để `terraform destroy` về $0). Thay vào đó domain được trỏ
# về public IP hiện tại qua Namecheap DDNS, cập nhật mỗi lần boot. Bật Dynamic DNS ở
# tab Advanced DNS của domain và thêm 1 host "A + Dynamic DNS Record" để lấy password.
# Domain dùng CHUNG với project khác được — chỉ cần khác `ddns_host` (subdomain).

variable "ddns_host" {
  description = "Namecheap DDNS host record (subdomain). '@' cho domain gốc."
  type        = string
  default     = "bang"
}

variable "ddns_domain" {
  description = "Root domain quản lý trên Namecheap"
  type        = string
  default     = "boardgamehocbai.website"
}

variable "ddns_password" {
  description = "Namecheap Dynamic DNS password. Truyền qua TF_VAR_ddns_password; không commit."
  type        = string
  sensitive   = true
}

# Secret CHUNG với game Escape để ký vé thưởng (HMAC). Truyền qua TF_VAR_reward_secret;
# KHÔNG commit. Dùng chuỗi hex/base64url. Phải KHỚP HỆT giá trị bên Escape.
variable "reward_secret" {
  description = "Shared HMAC secret for cross-game reward tickets (same value on Escape). Để trống = dùng secret DEV (app tự fallback) — đủ để mn chơi, KHÔNG an toàn cho prod thật."
  type        = string
  sensitive   = true
  default     = "" # bỏ trống -> Terraform không hỏi; app dùng secret dev chung
}

# URL gốc của game Escape — nơi người thắng bấm link nhận thưởng.
variable "escape_base_url" {
  description = "Escape Room public base URL (its `terraform output game_url`)."
  type        = string
  default     = "https://escape.room.boardgamehocbai.website"
}
