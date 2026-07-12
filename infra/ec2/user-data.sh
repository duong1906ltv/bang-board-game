#!/bin/bash
# Cloud-init for EC2 (Amazon Linux 2023). Rendered by Terraform templatefile().
# Game không có DB/keys (chỉ NODE_ENV + PORT). Secret duy nhất là DDNS password,
# do Terraform render vào script này qua templatefile().

set -euo pipefail
exec > >(tee -a /var/log/user-data.log) 2>&1

echo "[user-data] start $(date -Iseconds)"

AWS_REGION="${aws_region}"
ECR_IMAGE="${ecr_image}"

# --- Install Docker + compose plugin ---
dnf update -y
dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user

DOCKER_PLUGINS_DIR=/usr/libexec/docker/cli-plugins
mkdir -p $DOCKER_PLUGINS_DIR
COMPOSE_VERSION=v2.29.7
ARCH=$(uname -m)
curl -fsSL "https://github.com/docker/compose/releases/download/$COMPOSE_VERSION/docker-compose-linux-$ARCH" \
  -o $DOCKER_PLUGINS_DIR/docker-compose
chmod +x $DOCKER_PLUGINS_DIR/docker-compose

# --- App directory ---
APP_DIR=/opt/bang
mkdir -p $APP_DIR
cd $APP_DIR

# --- Namecheap Dynamic DNS: point the domain at this instance's public IP ---
# Chạy MỖI lần boot (qua systemd), nên cả `terraform destroy/apply` (instance mới)
# lẫn stop/start (IP mới) đều giữ domain trỏ đúng.
cat > $APP_DIR/ddns-update.sh <<'DDNS_SH'
#!/bin/bash
set -uo pipefail
TOKEN=$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60") || exit 0
IP=$(curl -sf -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/public-ipv4) || exit 0
curl -sf "https://dynamicdns.park-your-domain.com/update?host=${ddns_host}&domain=${ddns_domain}&password=${ddns_password}&ip=$IP" \
  && echo "[ddns] updated ${ddns_host}.${ddns_domain} -> $IP" \
  || echo "[ddns] update failed"
DDNS_SH
chmod +x $APP_DIR/ddns-update.sh

cat > /etc/systemd/system/ddns-update.service <<'UNIT'
[Unit]
Description=Update Namecheap DDNS with current public IP
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/bang/ddns-update.sh

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable ddns-update.service
# Cập nhật ngay để Caddy resolve được domain cho ACME (Let's Encrypt) challenge.
$APP_DIR/ddns-update.sh || true

cat > $APP_DIR/docker-compose.prod.yml <<'COMPOSE_END'
${compose_file}
COMPOSE_END

cat > $APP_DIR/Caddyfile <<'CADDY_END'
${caddyfile}
CADDY_END

cat > $APP_DIR/.env <<EOF
NODE_ENV=production
PORT=3000
ECR_IMAGE=$ECR_IMAGE
REWARD_SECRET=${reward_secret}
ESCAPE_BASE_URL=${escape_base_url}
EOF
chmod 600 $APP_DIR/.env

# --- ECR login + pull + start ---
ECR_HOST=$(echo $ECR_IMAGE | cut -d/ -f1)
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ECR_HOST

# The image may not exist yet on the very first apply (CI pushes it).
# Don't fail cloud-init if the pull can't find it — the deploy workflow will
# pull + start once the image is in ECR.
cd $APP_DIR
docker compose -f docker-compose.prod.yml --env-file .env pull || \
  echo "[user-data] image not in ECR yet; run the deploy workflow to push it"
docker compose -f docker-compose.prod.yml --env-file .env up -d || true

echo "[user-data] done $(date -Iseconds)"
