package ai.myaba.service.guard;

import ai.myaba.model.dto.AppUser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * DLP input guard — blocks non-clinical sensitive identifiers before they
 * reach the AI.  Identifiers in this list have no legitimate purpose in an
 * ABA clinical prompt and represent disproportionate breach / identity-theft
 * risk if inadvertently persisted in an AI-generated record.
 *
 * <h3>What is blocked</h3>
 * <ul>
 *   <li><b>SSN</b>              — {@code XXX-XX-XXXX} or {@code XXX XX XXXX}</li>
 *   <li><b>Payment card</b>     — 16-digit groups separated by spaces or hyphens</li>
 *   <li><b>Driver's license</b> — common US alphanumeric formats
 *       (1 letter + 7–8 digits, 2 letters + 6–7 digits, or state-prefix variants).
 *       False-positive rate is low because the pattern requires a leading letter.</li>
 * </ul>
 *
 * <h3>What is allowed through</h3>
 * Clinical PHI — client names, dates of birth, diagnoses, insurance IDs,
 * session details — passes through untouched so AI responses remain coherent
 * and clinically useful.  ACLX governs the output side.
 *
 * <h3>Configuration</h3>
 * <pre>
 *   dlp.enabled:          true   # master kill-switch
 *   dlp.ssn:              true
 *   dlp.payment-cards:    true
 *   dlp.drivers-license:  true
 * </pre>
 *
 * <h3>Disposition</h3>
 * Soft block — the user sees a plain-language explanation of what was
 * detected and is invited to rephrase without the identifier.
 */
@Component
@Order(2)
@Slf4j
public class SensitiveIdentifierGuard implements InputGuard {

    // ── Configuration ─────────────────────────────────────────────────────────

    @Value("${dlp.enabled:true}")
    private boolean dlpEnabled;

    @Value("${dlp.ssn:true}")
    private boolean blockSsn;

    @Value("${dlp.payment-cards:true}")
    private boolean blockPaymentCards;

    @Value("${dlp.drivers-license:true}")
    private boolean blockDriversLicense;

    // ── Pattern definitions ───────────────────────────────────────────────────

    private record IdentifierPattern(
            Pattern regex,
            String displayName,
            String guidance,
            String configKey   // used in log messages
    ) {}

    // SSN: 123-45-6789  or  123 45 6789
    // Compact 9-digit sequences intentionally excluded (false-positive risk: MRNs, phone numbers)
    private static final IdentifierPattern PATTERN_SSN = new IdentifierPattern(
        Pattern.compile("\\b\\d{3}[\\-\\s]\\d{2}[\\-\\s]\\d{4}\\b"),
        "Social Security Number",
        "SSNs are not needed for clinical documentation. Please remove it and rephrase.",
        "ssn"
    );

    // Credit / debit card: 1234-5678-9012-3456  or  1234 5678 9012 3456
    // Compact 16-digit sequences excluded (false-positive risk: long numeric IDs)
    private static final IdentifierPattern PATTERN_PAYMENT_CARD = new IdentifierPattern(
        Pattern.compile("\\b\\d{4}[\\-\\s]\\d{4}[\\-\\s]\\d{4}[\\-\\s]\\d{4}\\b"),
        "payment card number",
        "Payment card numbers are not needed in clinical documentation. Please remove it and rephrase.",
        "payment-cards"
    );

    // Driver's license — common US formats:
    //   1 uppercase letter followed by 7 or 8 digits  (e.g. CA: A1234567, TX: A12345678)
    //   2 uppercase letters followed by 6 or 7 digits  (e.g. some state formats)
    // Word boundary anchors prevent matching license plate or VIN substrings.
    // Requires explicit uppercase to reduce false-positive collisions with
    // clinical abbreviations (e.g. "B6" in measurement notation).
    private static final IdentifierPattern PATTERN_DRIVERS_LICENSE = new IdentifierPattern(
        Pattern.compile("\\b[A-Z]{1,2}\\d{6,8}\\b"),
        "driver's license number",
        "Driver's license numbers are not needed in clinical documentation. Please remove it and rephrase.",
        "drivers-license"
    );

    // ── InputGuard ────────────────────────────────────────────────────────────

    @Override
    public int order() {
        return 2;
    }

    @Override
    public Optional<Violation> check(AppUser user, String message, List<String> authorizedClientIds) {
        if (!dlpEnabled)                        return Optional.empty();
        if (message == null || message.isBlank()) return Optional.empty();

        List<IdentifierPattern> activePatterns = buildActivePatterns();

        for (IdentifierPattern ip : activePatterns) {
            if (ip.regex().matcher(message).find()) {
                log.warn("DLP SensitiveIdentifierGuard: blocked {} [config=dlp.{}=true] " +
                         "user={} org={}",
                        ip.displayName(), ip.configKey(), user.getUid(), user.getOrgId());
                return Optional.of(new Violation(
                        "SENSITIVE_IDENTIFIER_DETECTED",
                        "This message appears to contain a " + ip.displayName() + ". " + ip.guidance(),
                        ip.displayName()
                ));
            }
        }
        return Optional.empty();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private List<IdentifierPattern> buildActivePatterns() {
        List<IdentifierPattern> active = new ArrayList<>();
        if (blockSsn)            active.add(PATTERN_SSN);
        if (blockPaymentCards)   active.add(PATTERN_PAYMENT_CARD);
        if (blockDriversLicense) active.add(PATTERN_DRIVERS_LICENSE);
        return active;
    }
}
