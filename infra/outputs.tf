output "vpc_id" {
  value = aws_vpc.main.id
}

output "ecr_repository_url" {
  description = "Push target for the game image"
  value       = aws_ecr_repository.app.repository_url
}

output "ec2_public_ip" {
  description = "Current public IP of the game server (changes on destroy/apply; DDNS tracks it)"
  value       = aws_instance.app.public_ip
}

output "game_url" {
  description = "Open this to play — Caddy HTTPS on the Namecheap domain"
  value       = "https://${local.ec2_domain}"
}

output "gha_role_arn" {
  description = "IAM role ARN assumed by GitHub Actions"
  value       = aws_iam_role.gha.arn
}

output "aws_account_id" {
  description = "Set as GitHub repo Variable AWS_ACCOUNT_ID"
  value       = local.account_id
}
