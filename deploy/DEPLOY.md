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

### VPC connector (so the API can reach private ACLX)
```bash
gcloud compute networks vpc-access connectors create myaba-connector \
  --region us-central1 --range 10.8.0.0/28
```

### ACLX label-signing key (Secret Manager)
```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out aclx-key.pem
base64 -w0 aclx-key.pem | gcloud secrets create aclx-signing-key --data-file=-
rm aclx-key.pem
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
