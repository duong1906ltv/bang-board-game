# ─── Latest Amazon Linux 2023 AMI (x86_64) ──────────────────────────────────

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-kernel-6.1-x86_64"]
  }
}

# ─── EC2 instance ────────────────────────────────────────────────────────────

resource "aws_instance" "app" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  root_block_device {
    volume_size           = 10
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  metadata_options {
    http_tokens                 = "required" # IMDSv2 only
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 2
  }

  user_data = templatefile("${path.module}/ec2/user-data.sh", {
    aws_region   = var.aws_region
    ecr_image    = "${aws_ecr_repository.app.repository_url}:latest"
    compose_file = file("${path.module}/ec2/docker-compose.prod.yml")
    # Render the Caddyfile with the public domain so Caddy can auto-provision TLS.
    caddyfile = templatefile("${path.module}/ec2/Caddyfile", { domain = local.ec2_domain })
    # Namecheap DDNS: keep the domain pointing at this instance's public IP.
    ddns_host     = var.ddns_host
    ddns_domain   = var.ddns_domain
    ddns_password = var.ddns_password
  })

  user_data_replace_on_change = true

  tags = {
    Name = "${var.project_name}-prod"
  }
}

# ─── Public domain (Namecheap DDNS, no Elastic IP) ────────────────────────────
# Không dùng EIP: subnet tự gán public IP (map_public_ip_on_launch), và instance tự
# cập nhật record Namecheap DDNS về IP đó mỗi lần boot (xem ec2/user-data.sh). Nhờ vậy
# `terraform destroy` về $0 mà domain vẫn cố định. Caddy xin cert Let's Encrypt cho host này.
# Domain dùng chung với project khác được — chỉ khác `ddns_host` (subdomain).

locals {
  ec2_domain = var.ddns_host == "@" ? var.ddns_domain : "${var.ddns_host}.${var.ddns_domain}"
}
