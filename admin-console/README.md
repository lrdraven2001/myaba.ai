# myABA.ai Platform Admin Console (admin.myaba.ai)

Vendor-only operations console: Pathfinder org-creation invitations
(`approvedOrgCreators` allowlist), tenant list/status, cross-org usage,
platform config, and service health. **This is not a customer app** — access
is enforced server-side by the `PLATFORM_ADMIN_EMAILS` allowlist on the API.

## How access works

1. Sign in with Google (same Firebase identity pool as the main app).
2. Every `/api/platform/**` call is gated by `PlatformAdminGuard`: the caller's
   email must be in the `PLATFORM_ADMIN_EMAILS` env var on the `myaba-api`
   Cloud Run service (comma-separated, case-insensitive, **fails closed**).
3. Non-operators who sign in see an "access denied" screen (the console probes
   `/api/platform/health` and reads the 403).

Customer roles (including `ORG_SUPER_ADMIN`) do **not** grant platform access.

## Local dev

```powershell
cd admin-console
npm install
npm run dev          # http://localhost:5174 — proxies /api to localhost:9090
```

Uses `VITE_DEV_AUTH=true` (`.env.local`) — no sign-in; backend must run with
`DEV_AUTH=true` so the platform guard is open.

## One-time production setup

```bash
# 1. Grant yourself platform-operator access on the API
gcloud run services update myaba-api --region us-central1 \
  --update-env-vars PLATFORM_ADMIN_EMAILS=chris@cbhunt.net
#    (or add `PLATFORM_ADMIN_EMAILS` to deploy/cloud-run-api.yaml so it
#     survives declarative deploys — recommended.)

# 2. Create the Hosting site + map the target (already in .firebaserc)
firebase hosting:sites:create myaba-admin --project myapaai

# 3. Custom domain: Firebase Console → Hosting → myaba-admin →
#    "Add custom domain" → admin.myaba.ai → add the DNS records it shows
#    (an A record or CNAME on admin.myaba.ai at your DNS provider).
```

## Deploy

```powershell
cd admin-console
npm run build                                  # uses .env.production
firebase deploy --only hosting:admin --project myapaai
```

The hosting config rewrites `/api/**` to the `myaba-api` Cloud Run service
(same as the main app), so the console needs no separate API URL. The
authenticated token rides in the `X-Firebase-Token` header — the Hosting →
Cloud Run edge strips `Authorization` bearer tokens.
