#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build-and-push.sh — build the three container images and push them to
# Artifact Registry in project myapaai (us-docker.pkg.dev/myapaai/...).
#
# Uses Cloud Build (no local Docker needed). Run once per release.
#
#   PROJECT=myapaai  ACLX_DIR=/d/aegislayer/ACL  ./deploy/build-and-push.sh
#
# Prereqs (one-time, see DEPLOY.md):
#   gcloud artifacts repositories create myaba --repository-format=docker \
#       --location=us --project=myapaai
#   gcloud artifacts repositories create aclx  --repository-format=docker \
#       --location=us --project=myapaai
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT="${PROJECT:-myapaai}"
REGISTRY="us-docker.pkg.dev/${PROJECT}"
ACLX_DIR="${ACLX_DIR:-/d/aegislayer/ACL}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"   # repo root (myaba.ai)

echo "▶ Building myaba-api  →  ${REGISTRY}/myaba/api:latest"
gcloud builds submit "${HERE}/backend-java" \
  --tag "${REGISTRY}/myaba/api:latest" \
  --project "${PROJECT}"

echo "▶ Building ACLX gateway-api  →  ${REGISTRY}/aclx/gateway-api:latest"
gcloud builds submit "${ACLX_DIR}/services/gateway-api" \
  --tag "${REGISTRY}/aclx/gateway-api:latest" \
  --project "${PROJECT}"

echo "▶ Building ACLX opa (policies baked in)  →  ${REGISTRY}/aclx/opa:latest"
gcloud builds submit "${ACLX_DIR}/services/opa" \
  --tag "${REGISTRY}/aclx/opa:latest" \
  --project "${PROJECT}"

echo "✓ All images pushed to ${REGISTRY}"
