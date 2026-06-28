#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-hosting.sh — build both SPAs and deploy them to Firebase Hosting.
#
#   homepage → myaba.ai      (Hosting target "homepage" → site myaba-ai)
#   app      → app.myaba.ai  (Hosting target "app"      → site myaba-app)
#
# Prereqs (one-time, see DEPLOY.md):
#   • frontend/.env.production filled with the real VITE_FIREBASE_* values
#   • Two Hosting sites created and mapped to the targets:
#       firebase hosting:sites:create myaba-ai  --project myapaai
#       firebase hosting:sites:create myaba-app --project myapaai
#       firebase target:apply hosting homepage myaba-ai  --project myapaai
#       firebase target:apply hosting app      myaba-app --project myapaai
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"   # repo root (myaba.ai)
PROJECT="${PROJECT:-myapaai}"

echo "▶ Building homepage (myaba.ai)"
( cd "${HERE}/homepage" && npm ci && npm run build )

echo "▶ Building app (app.myaba.ai)"
( cd "${HERE}/frontend" && npm ci && npm run build )

echo "▶ Deploying both sites + Firestore rules to Firebase"
( cd "${HERE}" && firebase deploy \
    --only hosting,firestore:rules,firestore:indexes \
    --project "${PROJECT}" )

echo "✓ Hosting live: https://myaba.ai  and  https://app.myaba.ai"
