package ai.myaba.security;

import ai.myaba.model.dto.AppUser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Vendor-only platform-admin tier.
 *
 * <p>Access to {@code /api/platform/**} (the admin.myaba.ai console) is granted
 * to a fixed set of vendor operator emails supplied via the
 * {@code PLATFORM_ADMIN_EMAILS} environment variable (comma-separated,
 * case-insensitive). This is deliberately NOT a customer role: an
 * {@code ORG_SUPER_ADMIN} is a customer's Practice Administrator and must never
 * see other tenants' data.
 *
 * <p><b>Fails closed</b> — when the variable is unset or empty, nobody has
 * platform access (except in dev mode, where the stub user is allowed so the
 * console can be developed locally).
 *
 * <p>Changing admins is an env-var update + redeploy (IAM-protected), never a
 * Firestore edit:
 * <pre>
 *   gcloud run services update myaba-api \
 *     --update-env-vars PLATFORM_ADMIN_EMAILS=chris@cbhunt.net
 * </pre>
 */
@Component
@Slf4j
public class PlatformAdminGuard {

    private final Set<String> adminEmails;
    private final boolean devMode;

    public PlatformAdminGuard(
            @Value("${platform.admin-emails:}") String adminEmailsCsv,
            @Value("${dev.auth-enabled:false}") boolean devMode) {
        this.devMode = devMode;
        this.adminEmails = Arrays.stream(adminEmailsCsv.split(","))
                .map(s -> s.trim().toLowerCase(Locale.ROOT))
                .filter(s -> !s.isBlank())
                .collect(Collectors.toUnmodifiableSet());
        if (this.adminEmails.isEmpty() && !devMode) {
            log.warn("PLATFORM_ADMIN_EMAILS is not set — all /api/platform access is disabled (fail-closed).");
        } else if (!this.adminEmails.isEmpty()) {
            log.info("Platform admin tier configured with {} operator email(s).", this.adminEmails.size());
        }
    }

    /** True when this user is a vendor platform operator (or dev-mode stub). */
    public boolean isPlatformAdmin(AppUser user) {
        if (user == null) return false;
        if (devMode) return true;
        String email = user.getEmail();
        return email != null && adminEmails.contains(email.trim().toLowerCase(Locale.ROOT));
    }
}
