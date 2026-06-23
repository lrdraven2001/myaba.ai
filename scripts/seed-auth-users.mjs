/**
 * seed-auth-users.mjs
 *
 * Creates test users in the Firebase Auth + Firestore emulators and sets their
 * custom claims (role, orgId, purpose, supervisorId).
 *
 * Run against the local emulator:
 *   node scripts/seed-auth-users.mjs
 *
 * Requires the Firebase emulator to be running (docker compose up).
 * Auth emulator:      http://localhost:9099
 * Firestore emulator: http://localhost:9150
 *
 * The script is idempotent — if a user / doc already exists it is updated.
 *
 * Auth: uses Firebase Admin SDK (which works with a custom credential for the emulator).
 * Firestore: uses the emulator's unauthenticated REST API (no real credentials needed).
 *
 * Demo orgs:
 *   dev-org-001  → Sunrise ABA Therapy    (full team of 6 users + 2 demo clients)
 *   dev-org-002  → Coastal ABA Partners   (2 users — multi-tenancy isolation demo)
 *   newuser      → no orgId               (triggers onboarding / BAA flow)
 */

import { generateKeyPairSync }           from 'crypto';
import { initializeApp, cert }           from 'firebase-admin/app';
import { getAuth }                       from 'firebase-admin/auth';
import { getFirestore }                  from 'firebase-admin/firestore';

// ── Point Admin SDK at the local emulators ─────────────────────────────────
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
process.env.FIRESTORE_EMULATOR_HOST     = 'localhost:9150';

// Generate a throwaway RSA key so firebase-admin's cert() type-check passes.
// The emulator never validates this key — it accepts any credential.
const { privateKey: rsaKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = rsaKey.export({ type: 'pkcs8', format: 'pem' });

const dummyServiceAccount = {
  type:           'service_account',
  project_id:     'demo-myaba',
  private_key_id: 'seed-dummy-key',
  private_key:    privateKeyPem,
  client_email:   'seed@demo-myaba.iam.gserviceaccount.com',
  client_id:      '000000000000000000000',
  auth_uri:       'https://accounts.google.com/o/oauth2/auth',
  token_uri:      'https://oauth2.googleapis.com/token',
};

initializeApp({
  credential: cert(dummyServiceAccount),
  projectId:  'demo-myaba',
});

const auth = getAuth();
const db   = getFirestore();

// ── Firestore helpers ────────────────────────────────────────────────────────

async function fsSet(path, docId, data) {
  // Admin SDK bypasses security rules; emulator host is set via env var above
  await db.collection(path).doc(docId).set(data, { merge: true });
}

// ── Password used for all test accounts ─────────────────────────────────────
const PASSWORD = 'Test1234!';
const NOW_ISO  = new Date().toISOString();

// ── Auth user definitions ───────────────────────────────────────────────────

const USERS = [
  // ── Org 1: Sunrise ABA Therapy ──────────────────────────────────────────
  {
    email:       'superadmin@sunrise.demo',
    displayName: 'Alex Admin',
    claims: { role: 'ORG_SUPER_ADMIN', orgId: 'dev-org-001', purpose: 'oversight' },
  },
  {
    email:       'orgadmin@sunrise.demo',
    displayName: 'Orla Admin',
    claims: { role: 'ORG_ADMIN', orgId: 'dev-org-001', purpose: 'oversight' },
  },
  {
    email:       'bcba@sunrise.demo',
    displayName: 'Beth BCBA',
    claims: { role: 'TREATING_BCBA', orgId: 'dev-org-001', purpose: 'treatment' },
  },
  {
    email:       'supervisor@sunrise.demo',
    displayName: 'Sam Supervisor',
    claims: { role: 'SUPERVISING_BCBA', orgId: 'dev-org-001', purpose: 'oversight' },
  },
  {
    email:       'rbt@sunrise.demo',
    displayName: 'Riley RBT',
    claims: { role: 'RBT', orgId: 'dev-org-001', purpose: 'treatment' },
    // supervisorId patched below after we know the BCBA's uid
  },
  {
    email:       'billing@sunrise.demo',
    displayName: 'Billie Billing',
    claims: { role: 'BILLING_ADMIN', orgId: 'dev-org-001', purpose: 'payment' },
  },

  // ── Org 2: Coastal ABA Partners (isolation demo) ─────────────────────────
  {
    email:       'admin@coastal.demo',
    displayName: 'Casey Coastal',
    claims: { role: 'ORG_ADMIN', orgId: 'dev-org-002', purpose: 'oversight' },
  },
  {
    email:       'bcba@coastal.demo',
    displayName: 'Dakota BCBA',
    claims: { role: 'TREATING_BCBA', orgId: 'dev-org-002', purpose: 'treatment' },
  },

  // ── New-user test account (no orgId — triggers onboarding / BAA flow) ────
  {
    email:       'newuser@test.demo',
    displayName: 'New User',
    claims:      {},   // no orgId → OnboardingView shown after login
  },
];

// ── Firestore org documents ──────────────────────────────────────────────────

const ORGS = [
  {
    id:   'dev-org-001',
    data: {
      id:        'dev-org-001',
      name:      'Sunrise ABA Therapy',
      plan:      'team',
      adminUid:  'seed-superadmin',
      createdAt: NOW_ISO,
      settings: {
        sessionTimeoutMinutes: 15,
        mfaRequired:    false,
        reviewRequired: true,
        aclxEnabled:    true,
        hipaaMode:      true,
        aiAudit:        true,
      },
      insuranceCompanies: [
        'Aetna', 'Anthem / BCBS', 'BlueCross BlueShield', 'Cigna',
        'Humana', 'Medicaid', 'United Healthcare',
      ],
      // baaAcceptance — matches OrgService.acceptBaa() field name
      baaAcceptance: {
        accepted:    true,
        acceptedAt:  NOW_ISO,
        acceptedBy:  'seed-script',
        signerName:  'Alex Admin',
        signerTitle: 'Executive Director',
        version:     '1.1',
      },
    },
  },
  {
    id:   'dev-org-002',
    data: {
      id:        'dev-org-002',
      name:      'Coastal ABA Partners',
      plan:      'solo',
      adminUid:  'seed-admin2',
      createdAt: NOW_ISO,
      settings: {
        sessionTimeoutMinutes: 15,
        mfaRequired:    false,
        reviewRequired: false,
        aclxEnabled:    true,
        hipaaMode:      true,
        aiAudit:        false,
      },
      baaAcceptance: {
        accepted:    true,
        acceptedAt:  NOW_ISO,
        acceptedBy:  'seed-script',
        signerName:  'Casey Coastal',
        signerTitle: 'Owner',
        version:     '1.1',
      },
    },
  },
];

// ── Demo clients for org-001 ─────────────────────────────────────────────────

const CLIENTS_ORG1 = [
  {
    id:   'client-001',
    data: {
      firstName:    'Jamie',
      lastName:     'Rivera',
      dateOfBirth:  '2018-03-14',
      diagnosis:    'Autism Spectrum Disorder (Level 2)',
      insurerId:    'BCBS-0012345',
      assignedBcba: 'bcba@sunrise.demo',
      createdAt:    NOW_ISO,
    },
  },
  {
    id:   'client-002',
    data: {
      firstName:    'Morgan',
      lastName:     'Patel',
      dateOfBirth:  '2019-07-22',
      diagnosis:    'Autism Spectrum Disorder (Level 1)',
      insurerId:    'Aetna-0098765',
      assignedBcba: 'bcba@sunrise.demo',
      createdAt:    NOW_ISO,
    },
  },
];

// ── Auth helpers ─────────────────────────────────────────────────────────────

async function upsertUser(spec) {
  let uid;
  try {
    const existing = await auth.getUserByEmail(spec.email);
    uid = existing.uid;
    console.log(`  ↺  ${spec.email} already exists (uid=${uid}) — updating claims`);
  } catch {
    const created = await auth.createUser({
      email:       spec.email,
      password:    PASSWORD,
      displayName: spec.displayName,
    });
    uid = created.uid;
    console.log(`  ✓  Created ${spec.email} (uid=${uid})`);
  }
  await auth.setCustomUserClaims(uid, spec.claims);
  return uid;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔑  Seeding Firebase emulators (demo-myaba)\n');

  // 1. Create / update Auth users
  console.log('── Auth users ───────────────────────────────────');
  const uids = {};
  for (const user of USERS) {
    uids[user.email] = await upsertUser(user);
  }

  // Patch the RBT's supervisorId to the BCBA's actual uid
  const rbtUid    = uids['rbt@sunrise.demo'];
  const bcbaUid   = uids['bcba@sunrise.demo'];
  const rbtClaims = { role: 'RBT', orgId: 'dev-org-001', purpose: 'treatment', supervisorId: bcbaUid };
  await auth.setCustomUserClaims(rbtUid, rbtClaims);
  console.log(`  ↺  Patched RBT supervisorId → ${bcbaUid}`);

  // 2. Seed Firestore orgs via emulator REST API (no credentials needed)
  console.log('\n── Firestore orgs ───────────────────────────────');
  for (const org of ORGS) {
    await fsSet('organizations', org.id, org.data);
    console.log(`  ✓  Org ${org.id} (${org.data.name})`);
  }

  // 3. Seed member subcollection for org-001
  console.log('\n── Firestore members (dev-org-001) ──────────────');
  const ORG1_MEMBERS = [
    { uid: uids['superadmin@sunrise.demo'], email: 'superadmin@sunrise.demo', displayName: 'Alex Admin',    role: 'ORG_SUPER_ADMIN',  purpose: 'oversight', active: true },
    { uid: uids['orgadmin@sunrise.demo'],   email: 'orgadmin@sunrise.demo',   displayName: 'Orla Admin',    role: 'ORG_ADMIN',        purpose: 'oversight', active: true },
    { uid: uids['bcba@sunrise.demo'],       email: 'bcba@sunrise.demo',       displayName: 'Beth BCBA',     role: 'TREATING_BCBA',    purpose: 'treatment', active: true },
    { uid: uids['supervisor@sunrise.demo'], email: 'supervisor@sunrise.demo', displayName: 'Sam Supervisor',role: 'SUPERVISING_BCBA', purpose: 'oversight', active: true },
    { uid: uids['rbt@sunrise.demo'],        email: 'rbt@sunrise.demo',        displayName: 'Riley RBT',     role: 'RBT',              purpose: 'treatment', active: true, supervisorId: bcbaUid },
    { uid: uids['billing@sunrise.demo'],    email: 'billing@sunrise.demo',    displayName: 'Billie Billing',role: 'BILLING_ADMIN',    purpose: 'payment',   active: true },
  ];
  for (const m of ORG1_MEMBERS) {
    const data = {
      uid:         m.uid,
      email:       m.email,
      displayName: m.displayName,
      role:        m.role,
      purpose:     m.purpose,
      active:      m.active,
      joinedAt:    NOW_ISO,
    };
    if (m.supervisorId) data.supervisorId = m.supervisorId;
    await db.collection('organizations').doc('dev-org-001').collection('members').doc(m.uid).set(data, { merge: true });
    console.log(`  ✓  ${m.email} (${m.role})`);
  }

  // 4. Seed demo clients for org-001
  console.log('\n── Demo clients (dev-org-001) ───────────────────');
  for (const client of CLIENTS_ORG1) {
    await db.collection('organizations').doc('dev-org-001').collection('clients').doc(client.id).set(client.data, { merge: true });
    console.log(`  ✓  ${client.data.firstName} ${client.data.lastName} (${client.id})`);
  }

  // 5. Summary
  console.log('\n✅  Done.\n');
  console.log('  All passwords: ' + PASSWORD);
  console.log('\n  ── Org 1: Sunrise ABA Therapy (dev-org-001) ──');
  console.log('  superadmin@sunrise.demo  → ORG_SUPER_ADMIN  (full access)');
  console.log('  orgadmin@sunrise.demo    → ORG_ADMIN        (users / policies)');
  console.log('  bcba@sunrise.demo        → TREATING_BCBA    (clinical docs, chat)');
  console.log('  supervisor@sunrise.demo  → SUPERVISING_BCBA (caseload review)');
  console.log('  rbt@sunrise.demo         → RBT              (session notes only)');
  console.log('  billing@sunrise.demo     → BILLING_ADMIN    (billing codes only)');
  console.log('\n  ── Org 2: Coastal ABA Partners (dev-org-002) ─');
  console.log('  admin@coastal.demo       → ORG_ADMIN        (isolation demo)');
  console.log('  bcba@coastal.demo        → TREATING_BCBA    (isolation demo)');
  console.log('\n  ── Onboarding / BAA test ─────────────────────');
  console.log('  newuser@test.demo        → (no orgId)       → triggers OnboardingView');
  console.log('\n  Login at http://localhost:5173\n');
}

main().catch(err => { console.error(err); process.exit(1); });
