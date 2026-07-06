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
