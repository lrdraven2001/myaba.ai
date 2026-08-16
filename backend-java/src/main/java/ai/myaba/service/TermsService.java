package ai.myaba.service;

import ai.myaba.model.dto.AppUser;
import ai.myaba.util.TimestampUtil;
import com.google.firebase.cloud.FirestoreClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

/**
 * Records affirmative acceptance of the published legal terms (Terms of Service,
 * Privacy Policy, DPA) so the click-through agreement is legally provable: who
 * accepted, which version, and when. Backs the acceptance gate in the app.
 *
 * <p>The latest acceptance per user is stored at {@code termsAcceptances/{uid}}
 * (fast gate check) and every acceptance is also written to the audit log
 * ({@code TERMS_ACCEPTED}) as an append-only record.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class TermsService {

    /**
     * Current published version of the legal terms. Bump this (to the effective
     * date of the update) whenever the Terms/Privacy/DPA change materially — every
     * user is then re-prompted to accept the new version.
     */
    public static final String CURRENT_TERMS_VERSION = "2026-08-16";

    private static final String COLLECTION = "termsAcceptances";

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    private final AuditService auditService;

    /** Current version + whether this user has accepted it (and when). */
    public Map<String, Object> getStatus(AppUser user) {
        Map<String, Object> out = new HashMap<>();
        out.put("currentVersion", CURRENT_TERMS_VERSION);
        if (devMode) {
            out.put("accepted", true);
            out.put("acceptedVersion", CURRENT_TERMS_VERSION);
            return out;
        }
        try {
            var snap = FirestoreClient.getFirestore().collection(COLLECTION).document(user.getUid()).get().get();
            String acceptedVersion = snap.exists() ? String.valueOf(snap.get("version")) : null;
            out.put("accepted", CURRENT_TERMS_VERSION.equals(acceptedVersion));
            out.put("acceptedVersion", acceptedVersion);
            out.put("acceptedAt", snap.exists() ? snap.get("acceptedAt") : null);
        } catch (Exception e) {
            log.warn("Terms status read failed for {}: {}", user.getUid(), e.getMessage());
            out.put("accepted", false);   // fail closed → the gate prompts
        }
        return out;
    }

    /**
     * Record that this user affirmatively accepted the given terms version.
     *
     * @throws IllegalArgumentException if {@code version} is not the current version
     *         (the client is stale and must reload before accepting)
     */
    public void recordAcceptance(AppUser user, String version, String sourceIp) throws Exception {
        if (!CURRENT_TERMS_VERSION.equals(version)) {
            throw new IllegalArgumentException("Stale terms version");
        }
        if (devMode) return;
        String now = TimestampUtil.now();
        Map<String, Object> rec = new HashMap<>();
        rec.put("uid",        user.getUid());
        rec.put("orgId",      user.getOrgId());
        rec.put("version",    version);
        rec.put("acceptedAt", now);
        if (sourceIp != null && !sourceIp.isBlank()) {
            // Only the first hop of X-Forwarded-For is the client; avoid logging the proxy chain.
            rec.put("sourceIp", sourceIp.split(",")[0].trim());
        }
        FirestoreClient.getFirestore().collection(COLLECTION).document(user.getUid()).set(rec).get();
        auditService.log("TERMS_ACCEPTED", user.getOrgId(), user.getUid(), null, null, null, version, null);
    }
}
