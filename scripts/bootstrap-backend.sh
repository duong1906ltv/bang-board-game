#!/usr/bin/env bash
# One-time bootstrap of the Terraform S3 state backend.
# Run ONCE per AWS account, BEFORE the first `terraform init`.
# Idempotent: re-running skips resources that already exist.
#
# State locking uses S3's native lockfile (backend `use_lockfile = true`),
# so no DynamoDB table is needed. Values must match infra/backend.tf.
set -euo pipefail

PROFILE=${AWS_PROFILE:-default}
REGION=${AWS_REGION:-ap-southeast-1}
BUCKET=${TF_STATE_BUCKET:-bang-board-game-tfstate-mml}

ACCOUNT=$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)
echo "▶ Account $ACCOUNT / region $REGION / profile $PROFILE"
echo "  bucket=$BUCKET"
echo

# ─── S3 state bucket ─────────────────────────────────────────────────────────
if aws s3api head-bucket --bucket "$BUCKET" --profile "$PROFILE" 2>/dev/null; then
  echo "  ✓ bucket $BUCKET already exists"
else
  echo "  + creating bucket $BUCKET"
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" --profile "$PROFILE"
  aws s3api put-bucket-versioning --bucket "$BUCKET" \
    --versioning-configuration Status=Enabled --profile "$PROFILE"
  aws s3api put-bucket-encryption --bucket "$BUCKET" --profile "$PROFILE" \
    --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
  aws s3api put-public-access-block --bucket "$BUCKET" --profile "$PROFILE" \
    --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
fi

echo
echo "✓ Backend ready. Next:  cd infra && terraform init && terraform apply"
