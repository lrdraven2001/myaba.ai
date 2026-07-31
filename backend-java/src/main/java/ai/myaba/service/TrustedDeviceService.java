package ai.myaba.service;

import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.UserRecord;
import com.google.firebase.cloud.FirestoreClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Trusted-device ("remember this device") support for MFA.
 *
 * <h2>What this can and cannot do</h2>
 * The app uses Firebase / Identity Platform <b>native enrolled MFA</b>. Firebase
 * re-runs the second factor on every <i>fresh sign-in</i> and there is no supported
 * way to suppress it, so this feature does <b>not</b> (and cannot) bypass the Firebase
 * second factor.
 *
 * <p>What it does: after a user completes a full MFA challenge on a device, that device
 * can be issued a signed, server-verified, revocable trusted-device token. While the
 * token is valid, {@code FirebaseAuthFilter} <b>relaxes the absolute session cap</b>:
 * instead of forcing a full re-authentication (which would re-trigger the Firebase
 * second factor) at the 12h ceiling, the still-valid Firebase session is allowed to
 * continue — via Firebase's silent token refresh — up to the trusted-device TTL.
 *
 * <p>It deliberately does <b>not</b> touch the client inactivity auto-logoff (HIPAA
 * automatic logoff): that remains a hard session termination on every device.
 *
 * <h2>Security properties</h2>
 * <ul>
 *   <li><b>Device-bound:</b> each device gets a unique 256-bit secret; the token carries
 *       the secret and we persist only its SHA-256. Nothing spoofable (user-agent) is
 *       trusted — the UA is stored advisory-only.</li>
 *   <li><b>Unforgeable:</b> the token is HMAC-SHA256 signed with a server secret AND must
 *       match a stored, unrevoked, unexpired record for this uid.</li>
 *   <li><b>User-bound:</b> the uid inside the token must equal the authenticated uid.</li>
 *   <li><b>Proven second factor:</b> mint requires a fresh ID token carrying
 *       {@code firebase.sign_in_second_factor} — proof the factor was completed in this
 *       very sign-in — inside a short freshness window.</li>
 *   <li><b>Expiring:</b> default 30 days (configurable), enforced in both token and record.</li>
 *   <li><b>Revocable / self-invalidating:</b> user or admin can revoke; a password change
 *       or refresh-token revocation advances {@code tokensValidAfterTimestamp} and
 *       invalidates every device; a disabled account is rejected; disabling MFA revokes
 *       devices client-side.</li>
 *   <li><b>Fail-safe OFF:</b> disabled entirely unless a signing secret is configured.</li>
 *   <li><b>Org policy:</b> an org may forbid device affinity
 *       ({@code settings.trustedDevicesDisabled}); it can never disable required MFA.</li>
 * </ul>
 *
 * Firestore path: {@code users/{uid}/trustedDevices/{deviceId}}.
 */
@Service
@Slf4j
public class TrustedDeviceService {

    /** HMAC signing secret. Blank ⇒ feature disabled (fail-safe). */
    @Value("${auth.trusted-device.secret:}")
    private String signingSecret;

    /** Trusted-device lifetime in days. */
    @Value("${auth.trusted-device.days:30}")
    private int trustedDeviceDays;

    /** A device may only be minted from an ID token whose sign-in is at most this old. */
    @Value("${auth.trusted-device.mint-window-seconds:300}")
    private long mintWindowSeconds;

    private static final String TOKEN_VERSION = "v1";
    private static final String COLLECTION = "users";
    private static final String SUBCOLLECTION = "trustedDevices";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();

    /**
     * Short positive cache: a long trusted session would otherwise hit Firestore + Auth
     * on every request past the cap. Keyed by SHA-256 of the cookie → cache-entry expiry.
     * Bounds revocation latency to {@link #VERIFY_CACHE_MS}. Cleared on any revoke.
     */
    private final Map<String, Long> verifyCache = new ConcurrentHashMap<>();
    private static final long VERIFY_CACHE_MS = 60_000L;

    public boolean isEnabled() {
        return signingSecret != null && !signingSecret.isBlank();
    }

    public int getTrustedDeviceDays() {
        return trustedDeviceDays;
    }

    // ── Mint ────────────────────────────────────────────────────────────────

    /** Outcome of a mint attempt; {@code cookieValue} is null unless {@code trusted}. */
    public record MintResult(boolean trusted, String reason, String cookieValue,
                             String deviceId, long expiresAtEpochMs) {}

    /**
     * Issue a trusted-device token. The caller MUST pass values extracted from a freshly
     * verified ID token belonging to {@code uid}.
     *
     * @param uid               authenticated user
     * @param orgId             user's org (for the org-level opt-out); may be blank
     * @param authTimeEpochSec  {@code auth_time} claim — original sign-in time
     * @param usedSecondFactor  true iff the token carried {@code firebase.sign_in_second_factor}
     * @param userAgent         request User-Agent (advisory label only)
     */
    public MintResult mint(String uid, String orgId, long authTimeEpochSec,
                           boolean usedSecondFactor, String userAgent) {
        if (!isEnabled()) return new MintResult(false, "disabled", null, null, 0);
        long nowSec = Instant.now().getEpochSecond();
        if (authTimeEpochSec <= 0 || (nowSec - authTimeEpochSec) > mintWindowSeconds) {
            return new MintResult(false, "stale-signin", null, null, 0);
        }
        if (!usedSecondFactor) {
            // Never trust a device that did not just complete the second factor.
            return new MintResult(false, "no-second-factor", null, null, 0);
        }
        try {
            if (orgForbidsTrust(orgId)) {
                return new MintResult(false, "org-disabled", null, null, 0);
            }
            long boundTva = FirebaseAuth.getInstance().getUser(uid).getTokensValidAfterTimestamp();

            String deviceId = hex(randomBytes(16));
            String secret = B64.encodeToString(randomBytes(32));
            long nowMs = Instant.now().toEpochMilli();
            long expMs = nowMs + (long) trustedDeviceDays * 86_400_000L;

            Map<String, Object> doc = new HashMap<>();
            doc.put("secretHash", sha256Hex(secret));
            doc.put("createdAtEpochMs", nowMs);
            doc.put("expiresAtEpochMs", expMs);
            doc.put("lastSeenAtEpochMs", nowMs);
            doc.put("boundTokensValidAfterMs", boundTva);
            doc.put("label", deviceLabel(userAgent));
            doc.put("uaHash", userAgent == null ? null : sha256Hex(userAgent));
            doc.put("revoked", false);
            deviceDoc(uid, deviceId).set(doc).get();

            return new MintResult(true, "ok", buildCookie(uid, deviceId, expMs, secret), deviceId, expMs);
        } catch (Exception e) {
            log.warn("Trusted-device mint failed for uid={}: {}", uid, e.getMessage());
            return new MintResult(false, "error", null, null, 0);
        }
    }

    // ── Verify ──────────────────────────────────────────────────────────────

    /**
     * True when {@code cookieValue} is a valid, unexpired, unrevoked trusted-device token
     * for {@code uid} whose bound credentials are still current. Never throws (fail-safe).
     */
    public boolean verify(String uid, String cookieValue, String userAgent) {
        if (!isEnabled() || uid == null || cookieValue == null || cookieValue.isBlank()) return false;
        try {
            String[] p = cookieValue.split("\\.");
            if (p.length != 6 || !TOKEN_VERSION.equals(p[0])) return false;

            String tokUid = new String(B64D.decode(p[1]), StandardCharsets.UTF_8);
            String deviceId = p[2];
            long expMs;
            try { expMs = Long.parseLong(p[3]); } catch (NumberFormatException e) { return false; }
            String secret = p[4];
            String sig = p[5];

            // Structural checks first (no network): uid binding, signature, expiry.
            if (!uid.equals(tokUid)) return false;
            String expectedSig = hmac(TOKEN_VERSION + "|" + tokUid + "|" + deviceId + "|" + expMs + "|" + secret);
            if (!constantTimeEquals(sig, expectedSig)) return false;
            if (Instant.now().toEpochMilli() >= expMs) return false;

            // Positive cache — avoids a Firestore + Auth round-trip on every request.
            String cacheKey = sha256Hex(cookieValue);
            Long cachedUntil = verifyCache.get(cacheKey);
            long now = Instant.now().toEpochMilli();
            if (cachedUntil != null && cachedUntil > now) return true;

            DocumentSnapshot snap = deviceDoc(uid, deviceId).get().get();
            if (!snap.exists()) return false;
            if (Boolean.TRUE.equals(snap.getBoolean("revoked"))) return false;

            Long recExp = snap.getLong("expiresAtEpochMs");
            if (recExp == null || recExp <= now) return false;

            String storedHash = snap.getString("secretHash");
            if (storedHash == null || !constantTimeEquals(storedHash, sha256Hex(secret))) return false;

            // Credential-change invalidation: password change / revokeRefreshTokens advances
            // tokensValidAfterTimestamp; a disabled account is rejected outright.
            UserRecord rec = FirebaseAuth.getInstance().getUser(uid);
            if (rec.isDisabled()) return false;
            Long boundTva = snap.getLong("boundTokensValidAfterMs");
            long bound = boundTva == null ? 0L : boundTva;
            if (rec.getTokensValidAfterTimestamp() > bound) return false;

            touchLastSeen(uid, deviceId, snap, now);
            verifyCache.put(cacheKey, Math.min(now + VERIFY_CACHE_MS, expMs));
            return true;
        } catch (Exception e) {
            log.warn("Trusted-device verify failed for uid={}: {}", uid, e.getMessage());
            return false; // fail closed → full re-auth
        }
    }

    // ── Management ────────────────────────────────────────────────────────────

    /** List a user's active (non-revoked, non-expired) trusted devices, newest first. */
    public List<Map<String, Object>> list(String uid, String currentDeviceId) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (!isEnabled()) return out;
        try {
            long now = Instant.now().toEpochMilli();
            for (QueryDocumentSnapshot d : db().collection(COLLECTION).document(uid)
                    .collection(SUBCOLLECTION).get().get().getDocuments()) {
                if (Boolean.TRUE.equals(d.getBoolean("revoked"))) continue;
                Long exp = d.getLong("expiresAtEpochMs");
                if (exp == null || exp <= now) continue;
                Map<String, Object> m = new HashMap<>();
                m.put("deviceId", d.getId());
                m.put("label", d.getString("label"));
                m.put("createdAtEpochMs", d.getLong("createdAtEpochMs"));
                m.put("lastSeenAtEpochMs", d.getLong("lastSeenAtEpochMs"));
                m.put("expiresAtEpochMs", exp);
                m.put("current", d.getId().equals(currentDeviceId));
                out.add(m);
            }
            out.sort((a, b) -> Long.compare(
                    ((Number) b.getOrDefault("createdAtEpochMs", 0L)).longValue(),
                    ((Number) a.getOrDefault("createdAtEpochMs", 0L)).longValue()));
        } catch (Exception e) {
            log.warn("Trusted-device list failed for uid={}: {}", uid, e.getMessage());
        }
        return out;
    }

    /** Revoke a single device. */
    public void revoke(String uid, String deviceId) {
        try {
            deviceDoc(uid, deviceId).delete().get();
        } catch (Exception e) {
            log.warn("Trusted-device revoke failed for uid={} device={}: {}", uid, deviceId, e.getMessage());
        } finally {
            verifyCache.clear(); // cheap; revocations are rare
        }
    }

    /** Revoke all of a user's trusted devices (e.g. on MFA disable or "forget all"). */
    public void revokeAll(String uid) {
        try {
            for (QueryDocumentSnapshot d : db().collection(COLLECTION).document(uid)
                    .collection(SUBCOLLECTION).get().get().getDocuments()) {
                d.getReference().delete();
            }
        } catch (Exception e) {
            log.warn("Trusted-device revokeAll failed for uid={}: {}", uid, e.getMessage());
        } finally {
            verifyCache.clear();
        }
    }

    /** Structural (unverified) deviceId read — used only to mark the current device in a list. */
    public String peekDeviceId(String cookieValue) {
        if (cookieValue == null) return null;
        String[] p = cookieValue.split("\\.");
        return (p.length == 6 && TOKEN_VERSION.equals(p[0])) ? p[2] : null;
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    private boolean orgForbidsTrust(String orgId) throws Exception {
        if (orgId == null || orgId.isBlank()) return false;
        DocumentSnapshot org = db().collection("organizations").document(orgId).get().get();
        Object settings = org.get("settings");
        return settings instanceof Map<?, ?> s && Boolean.TRUE.equals(s.get("trustedDevicesDisabled"));
    }

    private void touchLastSeen(String uid, String deviceId, DocumentSnapshot snap, long now) {
        Long last = snap.getLong("lastSeenAtEpochMs");
        // Throttle writes — refresh at most every 30 minutes. Fire-and-forget.
        if (last == null || now - last > 30 * 60_000L) {
            try { deviceDoc(uid, deviceId).update("lastSeenAtEpochMs", now); }
            catch (Exception ignored) { /* best-effort */ }
        }
    }

    /** Token = {@code v1.<uidB64>.<deviceId>.<expMs>.<secret>.<sig>}. */
    private String buildCookie(String uid, String deviceId, long expMs, String secret) {
        String sig = hmac(TOKEN_VERSION + "|" + uid + "|" + deviceId + "|" + expMs + "|" + secret);
        return String.join(".",
                TOKEN_VERSION,
                B64.encodeToString(uid.getBytes(StandardCharsets.UTF_8)),
                deviceId,
                Long.toString(expMs),
                secret,
                sig);
    }

    private Firestore db() {
        return FirestoreClient.getFirestore();
    }

    private DocumentReference deviceDoc(String uid, String deviceId) {
        return db().collection(COLLECTION).document(uid).collection(SUBCOLLECTION).document(deviceId);
    }

    private byte[] randomBytes(int n) {
        byte[] b = new byte[n];
        RANDOM.nextBytes(b);
        return b;
    }

    private String hmac(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(signingSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return B64.encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC computation failed", e);
        }
    }

    private static String sha256Hex(String s) {
        try {
            return hex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(Character.forDigit((x >> 4) & 0xF, 16)).append(Character.forDigit(x & 0xF, 16));
        return sb.toString();
    }

    /** Best-effort friendly label from the User-Agent (advisory only, never trusted). */
    private static String deviceLabel(String ua) {
        if (ua == null || ua.isBlank()) return "Unknown device";
        String browser = ua.contains("Edg/") ? "Edge"
                : ua.contains("OPR/") || ua.contains("Opera") ? "Opera"
                : ua.contains("Firefox") ? "Firefox"
                : ua.contains("Chrome") ? "Chrome"
                : ua.contains("Safari") ? "Safari" : "Browser";
        String os = ua.contains("Windows") ? "Windows"
                : ua.contains("Mac OS") || ua.contains("Macintosh") ? "macOS"
                : ua.contains("Android") ? "Android"
                : ua.contains("iPhone") || ua.contains("iPad") ? "iOS"
                : ua.contains("Linux") ? "Linux" : "";
        return os.isEmpty() ? browser : browser + " on " + os;
    }
}
