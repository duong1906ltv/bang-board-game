terraform {
  # use_lockfile (native S3 state locking) requires Terraform >= 1.10.
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }

  # Remote state in S3 with native S3 lockfile locking (a .tflock object next to
  # the state) — no DynamoDB table needed. The bucket is created once by
  # scripts/bootstrap-backend.sh.
  # NOTE: an S3 bucket name is globally unique — change `bucket` if it clashes,
  # and keep it in sync with scripts/bootstrap-backend.sh.
  # The AWS profile is picked up from the AWS_PROFILE env var at `terraform init`
  # (run: `export AWS_PROFILE=<your-profile>` first), so no profile is hard-coded here.
  backend "s3" {
    bucket       = "bang-board-game-tfstate-mml"
    key          = "infra/terraform.tfstate"
    region       = "ap-southeast-1"
    use_lockfile = true
    encrypt      = true
  }
}
