# ─── GitHub OIDC provider ────────────────────────────────────────────────────
# The provider is account-wide and may already exist (e.g. shared with another
# project on the same AWS account). Reference it as a data source so we neither
# fail on "already exists" nor delete a shared provider on destroy.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

# ─── IAM role assumed by GitHub Actions ──────────────────────────────────────

data "aws_iam_policy_document" "gha_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Restrict to this repo (any branch/tag).
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:*"]
    }
  }
}

resource "aws_iam_role" "gha" {
  name               = "${var.project_name}-github-actions"
  assume_role_policy = data.aws_iam_policy_document.gha_assume.json
  tags               = { Name = "${var.project_name}-github-actions" }
}

# ─── Permissions: ECR push + SSM RunCommand (deploy) ─────────────────────────

data "aws_iam_policy_document" "gha_perms" {
  # ECR auth token (any registry, AWS-mandated)
  statement {
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  # ECR push/pull on the app repo only
  statement {
    actions = [
      "ecr:BatchGetImage",
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.app.arn]
  }

  # Invoke the shell-script SSM document (no tag condition possible on documents)
  statement {
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript"]
  }

  # Restrict target instances to the prod box via tag
  statement {
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ec2:${var.aws_region}:${local.account_id}:instance/*"]
    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Name"
      values   = ["${var.project_name}-prod"]
    }
  }

  # Read command results
  statement {
    actions   = ["ssm:GetCommandInvocation"]
    resources = ["*"]
  }

  # Find the prod instance by tag (workflow wait step)
  statement {
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "gha" {
  name   = "${var.project_name}-gha-deploy"
  role   = aws_iam_role.gha.id
  policy = data.aws_iam_policy_document.gha_perms.json
}
