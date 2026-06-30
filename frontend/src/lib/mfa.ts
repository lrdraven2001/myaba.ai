import type { User, TotpSecret } from 'firebase/auth';
import QRCode from 'qrcode';

/**
 * Centralized TOTP (authenticator-app) multi-factor helpers.
 *
 * Replaces the enrollment flow that was previously copy-pasted across
 * InviteAcceptView, AccountSettingsModal, and MfaEnrollmentGate. The sign-in
 * *challenge* resolver lives in AuthContext (it needs the MultiFactorResolver
 * from the failed sign-in attempt).
 */

const ISSUER = 'myABA.ai';

export interface TotpEnrollment {
  /** Pass back to {@link completeTotpEnrollment} after the user enters their code. */
  secret: TotpSecret;
  /** Data-URL of a QR code to scan into an authenticator app. */
  qrDataUrl: string;
  /** Base32 key for manual entry when the QR can't be scanned. */
  manualKey: string;
}

/** Generate a TOTP secret + QR code for the user to add to their authenticator app. */
export async function startTotpEnrollment(user: User, accountLabel?: string): Promise<TotpEnrollment> {
  const { multiFactor, TotpMultiFactorGenerator } = await import('firebase/auth');
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  const uri = secret.generateQrCodeUrl(accountLabel ?? user.email ?? 'account', ISSUER);
  const qrDataUrl = await QRCode.toDataURL(uri, { width: 200, margin: 2 });
  return { secret, qrDataUrl, manualKey: secret.secretKey };
}

/** Verify the 6-digit code and enroll the TOTP factor on the user. */
export async function completeTotpEnrollment(
  user: User,
  secret: TotpSecret,
  code: string,
  displayName = 'Authenticator App',
): Promise<void> {
  const { multiFactor, TotpMultiFactorGenerator } = await import('firebase/auth');
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code);
  await multiFactor(user).enroll(assertion, displayName);
}

/** True when the user has at least one enrolled second factor. */
export async function hasEnrolledFactor(user: User): Promise<boolean> {
  const { multiFactor } = await import('firebase/auth');
  return multiFactor(user).enrolledFactors.length > 0;
}
