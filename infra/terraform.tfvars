# Fill in your GitHub repo (owner/name) before `terraform apply`.
# No secrets live here — GitHub Actions auth uses OIDC, not a token.
github_repo = "duong1906ltv/bang-board-game"

# Namecheap Dynamic DNS — domain của game (không chứa secret):
# Dùng CHUNG domain với project khác được, chỉ cần khác host (subdomain).
ddns_host   = "bang"
ddns_domain = "boardgamehocbai.website"
# DDNS password là secret — KHÔNG để ở đây. Truyền lúc apply:
#   export TF_VAR_ddns_password='<Namecheap Dynamic DNS Password>'
#   terraform apply

# Optional overrides:
# aws_profile   = "your-aws-cli-profile"
# aws_region    = "ap-southeast-1"
# instance_type = "t4g.micro"
