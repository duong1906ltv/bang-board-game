#!/bin/bash
# Cloud-init for EC2 (Amazon Linux 2023). Rendered by Terraform templatefile().
# No secrets to fetch — the game has no DB/keys, only NODE_ENV + PORT.

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
