# myABA.ai — Production Deployment Runbook

Target: **project `myapaai`**, domain **`myaba.ai`**, all on Google Cloud.

| URL | Service | Where |
|---|---|---|
| `https://myaba.ai` | Homepage (marketing) | Firebase Hosting site `myaba-ai` |
| `https://app.myaba.ai` | The application | Firebase Hosting site `myaba-app` |
| `https://app.myaba.ai/api/**` | Java API (rewritten, same-origin) | Cloud Run `myaba-api` |
| *(private, internal only)* | ACLX gateway + OPA | Cloud Run `aclx-gateway` |
| — | Auth + Firestore | Firebase on `myapaai` |
| — | Gemini tiers + DLP | Vertex AI / DLP on `myapaai` |

> The frontend calls a **relative** `/api`, and Firebase Hosting rewrites `/api/**`
> to the `myaba-api` Cloud Run service — so the app is **same-origin** and needs no
> CORS. ACLX is **never public**; the API reaches it over the VPC connector.

Artifacts in this folder: `cloud-run-api.yaml`, `cloud-run-aclx.yaml`,
`build-and-push.sh`, `deploy-hosting.sh`. Hosting config lives in `../firebase.json`
and `../.firebaserc`; prod env in `../frontend/.env.production` and
`../homepage/.env.production`.

---

## 0. One-time prerequisites

```bash
gcloud config set project myapaai

# Enable APIs
gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  aiplatform.googleapis.com dlp.googleapis.com firestore.googleapis.com \
  firebase.googleapis.com identitytoolkit.googleapis.com \
  secretmanager.googleapis.com vpcaccess.googleapis.com

# Artifact Registry repos
gcloud artifacts repositories create myaba --repository-format=docker --location=us
gcloud artifacts repositories create aclx  --repository-format=docker --location=us
```

### Firebase / Firestore (in the console)
1. Add Firebase to `myapaai` (console.firebase.google.com → Add project → pick existing).
2. **Firestore**: create database (Native mode, region `nam5`/`us-central`).
3. **Authentication** → enable **Email/Password** and **Google**.
4. **Project settings → Your apps → Web app** → register `myaba-app`, copy the SDK
   config into `../frontend/.env.production` (the 6 `VITE_FIREBASE_*` values).
5. *(Optional, for the 2FA + passkeys we built)* upgrade Authentication to
   **Identity Platform** and enable MFA / WebAuthn. Plain Firebase Auth only does
   SMS MFA, so TOTP + passkeys require GCIP.

### Service accounts + IAM
```bash
# API runtime SA
gcloud iam service-accounts create myaba-api --display-name="myABA API"
for ROLE in roles/aiplatform.user roles/datastore.user roles/firebaseauth.admin \
            roles/dlp.user roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding myapaai \
    --member="serviceAccount:myaba-api@myapaai.iam.gserviceaccount.com" --role="$ROLE"
done

# ACLX runtime SA
gcloud iam service-accounts create aclx-gateway --display-name="ACLX Gateway"
for ROLE in roles/aiplatform.user roles/secretmanager.secretAccessor roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding myapaai \
    --member="serviceAccount:aclx-gateway@myapaai.iam.gserviceaccount.com" --role="$ROLE"
done
```

### Let the API invoke the IAM-gated ACLX (run *after* ACLX is deployed in §2)
ACLX is private via IAM (`ingress=all`, no public invoker); the API authenticates
with a Google ID token. Grant the API's runtime SA invoker on the ACLX service —
no VPC connector needed (that keeps idle networking cost at zero).
```bash
gcloud run services add-iam-policy-binding aclx-gateway --region us-central1 \
  --member="serviceAccount:myaba-api@myapaai.iam.gserviceaccount.com" \
  --role=roles/run.invoker
```

### ACLX label-signing key (Secret Manager)
ACLX signs labels with **Ed25519** (`SIGNING_ALG=ed25519`) and loads the key as
base64 of the **DER (PKCS8)** private key — not PEM, not RSA.
```bash
openssl genpkey -algorithm ed25519 -outform DER -out aclx-ed.der
base64 -w0 aclx-ed.der | gcloud secrets create aclx-signing-key --data-file=-
rm aclx-ed.der
```

### 0a. Continuous deployment (GitHub → Cloud Run)
The repos are on **GitHub** (`github.com/lrdraven2001/{myaba.ai,ACL}`). Because
the API needs persistent env/SA/VPC config and ACLX is a multi-container service,
the triggers run a **`cloudbuild.yaml`** (build → `services replace`) rather than
the basic single-container "deploy from repository".

```bash
# 1) Connect GitHub to Cloud Build in THIS project (per-project; redo it in myapaai)
#    Console → Cloud Build → Repositories (2nd gen) → Create host connection → GitHub
#    → install the app on lrdraven2001/myaba.ai and lrdraven2001/ACL.

# 2) Cloud Build SA needs deploy rights
CB_SA="$(gcloud projects describe myapaai --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
for ROLE in roles/run.admin roles/iam.serviceAccountUser roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding myapaai --member="serviceAccount:${CB_SA}" --role="$ROLE"
done

# 3) API trigger — only fires on backend/API-config changes (SPAs go to Hosting)
gcloud builds triggers create github \
  --name=myaba-api --repo-name=myaba.ai --repo-owner=lrdraven2001 \
  --branch-pattern='^main$' --build-config=cloudbuild.yaml \
  --included-files='backend-java/**,deploy/cloud-run-api.yaml' --region=us-central1

# 4) ACLX trigger (separate repo) — see deploy/cloud-run-aclx in the ACL repo
gcloud builds triggers create github \
  --name=aclx-gateway --repo-name=ACL --repo-owner=lrdraven2001 \
  --branch-pattern='^main$' --build-config=cloudbuild.yaml --region=us-central1
```

> With triggers in place, **steps 1 + 3 below happen automatically on push.** The
> manual commands remain valid for the first deploy / out-of-band rollouts.

### 0b. Continuous deployment (GitHub Actions → Firebase Hosting + Firestore)
The **frontend** (all 3 SPAs) and **Firestore rules + indexes** auto-deploy via a
GitHub Actions workflow — `.github/workflows/deploy-frontend.yml` — so `firebase deploy`
no longer has to be run by hand. (The backend stays on Cloud Build, §0a; the two
pipelines are independent and don't overlap.)

What it does:
- **push → `main`** (paths `frontend/**`, `homepage/**`, `admin-console/**`, `firestore.*`,
  `firebase.json`, `.firebaserc`): builds all three SPAs with `npx vite build` and runs
  `firebase deploy --only hosting,firestore:indexes,firestore:rules`. So Hosting **and**
  rules/indexes go live on merge (and only on merge).
- **pull_request → `main`**: builds + deploys to a temporary Hosting **preview channel**
  (`pr-<n>`, 7-day expiry). Never touches the live sites or Firestore.

> Uses `npx vite build`, not `npm run build`: the frontend's `tsc -b` has pre-existing
> strict-config type errors. Vite still hard-fails on real breakage, so a broken build
> never deploys. No `--force` on the prod deploy → an index in the project but absent from
> `firestore.indexes.json` is kept, never dropped. Each app's committed `.env.production`
> supplies the live Firebase config (no VITE_* secrets needed).

One-time setup:
```bash
# 1) Run from the repo root (D:\myaba.ai\myaba.ai). Creates a deploy service account,
#    uploads its JSON key to the repo as secret FIREBASE_SERVICE_ACCOUNT_MYAPAAI, and
#    writes a starter workflow.
firebase login
firebase init hosting:github        # → repo: lrdraven2001/myaba.ai; accept the build-script default

# 2) DELETE the wizard's generated workflow(s) and keep ours:
#      .github/workflows/firebase-hosting-merge.yml
#      .github/workflows/firebase-hosting-pull-request.yml   (remove these)
#      .github/workflows/deploy-frontend.yml                 (keep this one)

# 3) firebase init grants the new SA Firebase Hosting admin ONLY. Our workflow also
#    deploys Firestore rules + indexes, so grant those two roles to the SA it created
#    (github-action-XXXXXXXXXX@myapaai.iam.gserviceaccount.com — see the init output):
SA="github-action-1247589595@myapaai.iam.gserviceaccount.com"   # ← use YOUR SA email
gcloud projects add-iam-policy-binding myapaai --member="serviceAccount:${SA}" --role="roles/firebaserules.admin"
gcloud projects add-iam-policy-binding myapaai --member="serviceAccount:${SA}" --role="roles/datastore.indexAdmin"
```

> Secret name matters: the workflow reads `secrets.FIREBASE_SERVICE_ACCOUNT_MYAPAAI`
> (the name `firebase init hosting:github` uses for project `myapaai`). Manage it at
> GitHub → repo → Settings → Secrets and variables → Actions.

---

## 1. Build & push images (manual — or let the trigger do it)
```bash
PROJECT=myapaai ACLX_DIR=/d/aegislayer/ACL ./deploy/build-and-push.sh
```

## 2. Deploy ACLX (private) — first, so we have its URL
```bash
gcloud run services replace deploy/cloud-run-aclx.yaml --region us-central1
ACLX_URL=$(gcloud run services describe aclx-gateway --region us-central1 \
            --format='value(status.url)')
echo "ACLX_GATEWAY_URL = $ACLX_URL"
```
Put `$ACLX_URL` into `deploy/cloud-run-api.yaml` (the `ACLX_GATEWAY_URL` env value).

## 3. Deploy the API
```bash
gcloud run services replace deploy/cloud-run-api.yaml --region us-central1
```

## 4. Deploy the SPAs + Firestore rules
> **Now automated** — pushing to `main` deploys the SPAs + Firestore rules/indexes via
> GitHub Actions (§0b). The commands below are the one-time site setup + a manual
> fallback for the first deploy / out-of-band rollouts.
```bash
# one-time: create the two Hosting sites + bind targets
firebase hosting:sites:create myaba-ai  --project myapaai
firebase hosting:sites:create myaba-app --project myapaai
firebase target:apply hosting homepage myaba-ai  --project myapaai
firebase target:apply hosting app      myaba-app --project myapaai

# build + deploy
./deploy/deploy-hosting.sh
```

## 5. Domain mapping + DNS
In **Firebase Hosting → each site → Add custom domain**:
- site `myaba-ai`  → `myaba.ai`
- site `myaba-app` → `app.myaba.ai`

Firebase prints the exact records to add at your `myaba.ai` registrar
(apex `A`/`AAAA` for the root; `CNAME` for `app`). Add them; SSL provisions
automatically (minutes to a few hours).

> The API does **not** need its own domain — it is served under
> `app.myaba.ai/api/**` via the Hosting rewrite. If you also want a public
> `api.myaba.ai`, add a Cloud Run domain mapping for `myaba-api`.

---

## 6. Smoke test (production)
```bash
curl -s https://app.myaba.ai/api/health           # API up (same-origin rewrite)
curl -s "$ACLX_URL/health"                          # only from inside VPC; expect refused publicly
```
Then in the browser:
1. `https://myaba.ai` loads; **Sign In** → `app.myaba.ai`.
2. Create org / sign in (real Firebase Auth, MFA if GCIP enabled).
3. **Chat** returns text (Gemini Flash-Lite, Tier 1).
4. **Generate** a BIP (Tier 2, Gemini 2.5 Pro) and a Session Note (Tier 1).
5. Trigger an ACLX block path to confirm governance is enforced end-to-end.

## Rollback
```bash
gcloud run services update-traffic myaba-api --region us-central1 --to-revisions PREVIOUS=100
# Hosting: firebase hosting:rollback (or redeploy a previous build)
```
