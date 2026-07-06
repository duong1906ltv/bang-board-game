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
  })

  user_data_replace_on_change = true

  tags = {
    Name = "${var.project_name}-prod"
  }
}

# ─── Elastic IP (stable public IP) ───────────────────────────────────────────
# sslip.io is free wildcard DNS: 1-2-3-4.sslip.io → 1.2.3.4, giving Caddy a real
# hostname to obtain a Let's Encrypt certificate for (no domain purchase needed).

resource "aws_eip" "app" {
  domain = "vpc"
  tags   = { Name = "${var.project_name}-app" }
}

locals {
  ec2_domain = "${replace(aws_eip.app.public_ip, ".", "-")}.sslip.io"
}

resource "aws_eip_association" "app" {
  instance_id   = aws_instance.app.id
  allocation_id = aws_eip.app.id
}
