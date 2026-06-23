/**
 * myABA.ai Firebase Cloud Functions
 *
 * Functions in this file:
 *
 *  1. onUserCreate  — Auth onCreate trigger.
 *     When a new user signs up (email/password OR Google OAuth), looks up whether
 *     an invite exists for their email.  If found, sets custom claims (role, orgId,
 *     purpose, supervisorId) from the invite.  If not found, sets a "pending" role
 *     so the frontend can show an "awaiting approval" screen.
 *
 *  2. beforeSignIn  — Auth blocking function.
 *     Optionally enforces domain allowlists per org (enterprise SAML/OIDC tenants).
 *     Runs before the sign-in completes — can reject unauthorized users.
 *
 *  3. setUserClaims — Callable function (admin-only).
 *     Lets the myABA admin console update a user's role without a Cloud Function deploy.
 *     Called by the Team Management screen when an admin changes a user's role.
 *
 *  4. onInviteAccepted — Firestore onCreate trigger on invites/{inviteId}.
 *     When the backend writes a completed invite record, this function sets claims
 *     on the invitee's Firebase account if they have already signed up.
 */

const { initializeApp } = require('firebase-admin/app');
const { getAuth }       = require('firebase-admin/auth');
const { getFirestore }  = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated }  = require('firebase-functions/v2/firestore');
const { beforeUserSignedIn } = require('firebase-functions/v2/identity');

// ── Firebase Admin init ────────────────────────────────────────────────────
// On Cloud Functions, credentials are picked up automatically from the runtime env.
initializeApp();

// ── Role constants (mirror of UserRole.java) ───────────────────────────────
const ROLES = {
  ORG_SUPER_ADMIN:  'ORG_SUPER_ADMIN',
  ORG_ADMIN:        'ORG_ADMIN',
  TREATING_BCBA:    'TREATING_BCBA',
  SUPERVISING_BCBA: 'SUPERVISING_BCBA',
  BCBA_STUDENT:     'BCBA_STUDENT',
  RBT:              'RBT',
  SCHEDULING_ADMIN: 'SCHEDULING_ADMIN',
  BILLING_ADMIN:    'BILLING_ADMIN',
  PENDING:          'PENDING', // awaiting admin approval
};

const VALID_ROLES = new Set(Object.values(ROLES));

// ── 1. onUserCreate ────────────────────────────────────────────────────────
/**
 * Fired when a user account is created — regardless of sign-in method
 * (email/password, Google OAuth, SAML, OIDC).
 *
 * Logic:
 *  a) Look for a pending invite in Firestore where email matches and status='pending'.
 *  b) If found: set claims from the invite record, mark invite status='accepted'.
 *  c) If not found: set role=PENDING (frontend shows "Contact your admin" screen).
 *
 * Note: for the Firebase Auth emulator, this trigger fires when you create a user
 * via the Emulator UI or the seed script.  Use the seed script to skip this and
 * set claims directly for test users.
 */
exports.onUserCreate = require('firebase-functions/v2/auth').onUserCreated(async (event) => {
  const user  = event.data;
  const auth  = getAuth();
  const db    = getFirestore();

  try {
    // Search for a matching invite across all orgs
    // (invites are stored at organizations/{orgId}/invites/{inviteId})
    const inviteSnap = await db.collectionGroup('invites')
        .where('email', '==', user.email.toLowerCase())
        .where('status', '==', 'pending')
        .limit(1)
        .get();

    if (!inviteSnap.empty) {
      const invite = inviteSnap.docs[0].data();

      const claims = {
        role:    invite.role   || ROLES.TREATING_BCBA,
        orgId:   invite.orgId,
        purpose: invite.purpose || 'treatment',
      };
      if (invite.supervisorId) {
        claims.supervisorId = invite.supervisorId;
      }

      await auth.setCustomUserClaims(user.uid, claims);
      await inviteSnap.docs[0].ref.update({
        status:     'accepted',
        acceptedAt: new Date().toISOString(),
        acceptedBy: user.uid,
      });

      console.log(`[onUserCreate] Set claims for ${user.email} from invite: role=${claims.role} orgId=${claims.orgId}`);
    } else {
      // No invite found — mark as pending.
      // The frontend AuthContext reads role='PENDING' and shows an "awaiting access" screen.
      await auth.setCustomUserClaims(user.uid, {
        role:  ROLES.PENDING,
        orgId: '',
      });
      console.log(`[onUserCreate] No invite found for ${user.email} — set role=PENDING`);
    }
  } catch (err) {
    console.error('[onUserCreate] Error setting claims:', err);
    // Don't throw — a claim-setting failure shouldn't prevent account creation.
    // The user will have no claims and the backend will deny them with 401.
  }
});

// ── 2. beforeSignIn ────────────────────────────────────────────────────────
/**
 * Blocking function — runs before sign-in completes.
 * Enforces org-level domain restrictions for enterprise SAML/OIDC tenants.
 *
 * Example: an org configures allowedDomains: ['agency.com'] in their Firestore
 * org doc.  This function blocks sign-in for any email not matching.
 *
 * For orgs without a domain restriction configured, all sign-ins are allowed
 * and the PENDING role handles the authorization layer.
 */
exports.beforeSignIn = beforeUserSignedIn(async (event) => {
  const user  = event.data;
  const db    = getFirestore();

  if (!user.email) return; // anonymous / phone auth — no domain check

  try {
    // Look up the user's org by email domain (if they already have claims from a prior session)
    const tokenClaims = user.customClaims || {};
    const orgId       = tokenClaims.orgId;
    if (!orgId) return; // no orgId yet — new user, let onUserCreate handle it

    const orgSnap = await db.collection('organizations').doc(orgId).get();
    if (!orgSnap.exists) return;

    const orgData = orgSnap.data();
    const allowedDomains = orgData.allowedSignInDomains; // e.g. ['agency.com', 'partner.com']
    if (!allowedDomains || allowedDomains.length === 0) return;

    const emailDomain = user.email.split('@')[1]?.toLowerCase();
    if (!allowedDomains.includes(emailDomain)) {
      throw new HttpsError('permission-denied',
          `Sign-in from @${emailDomain} is not permitted for this organization. ` +
          `Allowed domains: ${allowedDomains.join(', ')}`);
    }
  } catch (err) {
    if (err.code === 'permission-denied') throw err; // re-throw our own error
    console.error('[beforeSignIn] Domain check error (non-fatal):', err);
    // Don't block sign-in on infrastructure errors — fail open, let the backend decide.
  }
});

// ── 3. setUserClaims (admin callable) ─────────────────────────────────────
/**
 * Callable function — invoked by the myABA admin console to update a user's role.
 *
 * Requires the caller to be authenticated and to have role=ORG_SUPER_ADMIN or ORG_ADMIN.
 * ORG_ADMIN can set any role except ORG_SUPER_ADMIN.
 *
 * Request body:
 *   { uid, role, orgId, purpose, supervisorId? }
 */
exports.setUserClaims = onCall({ cors: true }, async (request) => {
  const callerClaims = request.auth?.token;
  if (!callerClaims) {
    throw new HttpsError('unauthenticated', 'Must be signed in');
  }

  const callerRole  = callerClaims.role;
  const callerOrgId = callerClaims.orgId;

  if (callerRole !== ROLES.ORG_SUPER_ADMIN && callerRole !== ROLES.ORG_ADMIN) {
    throw new HttpsError('permission-denied', 'Admin role required');
  }

  const { uid, role, orgId, purpose, supervisorId } = request.data;

  if (!uid || !role || !orgId) {
    throw new HttpsError('invalid-argument', 'uid, role, and orgId are required');
  }
  if (!VALID_ROLES.has(role)) {
    throw new HttpsError('invalid-argument', `Unknown role: ${role}`);
  }
  // ORG_ADMIN cannot elevate to ORG_SUPER_ADMIN or cross-org assign
  if (callerRole === ROLES.ORG_ADMIN) {
    if (role === ROLES.ORG_SUPER_ADMIN) {
      throw new HttpsError('permission-denied', 'ORG_ADMIN cannot grant ORG_SUPER_ADMIN');
    }
    if (orgId !== callerOrgId) {
      throw new HttpsError('permission-denied', 'Cannot assign users to a different org');
    }
  }

  const claims = { role, orgId, purpose: purpose || 'treatment' };
  if (supervisorId) claims.supervisorId = supervisorId;

  await getAuth().setCustomUserClaims(uid, claims);
  console.log(`[setUserClaims] ${callerClaims.email} set uid=${uid} role=${role} orgId=${orgId}`);

  return { success: true, uid, role, orgId };
});

// ── 4. onInviteAccepted ────────────────────────────────────────────────────
/**
 * Firestore trigger — fires when a new invite document is created.
 * Path: organizations/{orgId}/invites/{inviteId}
 *
 * If the invitee has already created their Firebase account (they signed up before
 * receiving the invite, or clicked a link after signing in), this sets their claims
 * immediately without waiting for their next login.
 *
 * The invite document shape:
 * {
 *   email: 'user@example.com',
 *   role: 'TREATING_BCBA',
 *   orgId: 'org-abc',
 *   purpose: 'treatment',
 *   supervisorId: 'uid-of-bcba',  // optional
 *   status: 'pending',
 *   createdBy: 'admin-uid',
 *   createdAt: ISO string
 * }
 */
exports.onInviteCreated = onDocumentCreated(
  'organizations/{orgId}/invites/{inviteId}',
  async (event) => {
    const invite = event.data.data();
    if (!invite.email) return;

    const auth = getAuth();
    try {
      const user = await auth.getUserByEmail(invite.email.toLowerCase());
      // User already exists — set their claims now
      const claims = {
        role:    invite.role   || ROLES.TREATING_BCBA,
        orgId:   invite.orgId,
        purpose: invite.purpose || 'treatment',
      };
      if (invite.supervisorId) claims.supervisorId = invite.supervisorId;

      await auth.setCustomUserClaims(user.uid, claims);
      await event.data.ref.update({
        status:     'accepted',
        acceptedAt: new Date().toISOString(),
        acceptedBy: user.uid,
      });
      console.log(`[onInviteCreated] Claimed set for existing user ${invite.email}`);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        // User hasn't signed up yet — onUserCreate will handle it when they do.
        console.log(`[onInviteCreated] ${invite.email} not yet registered — waiting for signup`);
      } else {
        console.error('[onInviteCreated] Error:', err);
      }
    }
  }
);
