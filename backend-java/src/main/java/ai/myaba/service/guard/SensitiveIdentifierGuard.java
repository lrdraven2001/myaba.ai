package ai.myaba.service.guard;

import ai.myaba.model.dto.AppUser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Guards against high-sensitivity identifiers that should never appear in a
 * clinical AI chat — Social Security Numbers and financial account numbers.
 *
 * <p>These identifiers are not required for ABA clinical documentation and
 * represent a disproportionate risk if inadvertently included in an AI-generated
 * record (identity theft, data breach liability, unintended PHI persistence).
 *
 * <h3>Detection strategy</h3>
 * <ul>
 *   <li><b>SSN (formatted)</b> — {@code XXX-XX-XXXX} or {@code XXX XX XXXX}.
 *       Compact 9-digit sequences are intentionally excluded to avoid false
 *       positives on MRNs, long phone numbers without formatting, and zip+4 codes.</li>
 *   <li><b>Credit / debit card</b> — 16-digit groups separated by spaces or hyphens
 *       ({@code XXXX-XXXX-XXXX-XXXX}).  Compact 16-digit sequences excluded for
 *       the same false-positive reason.</li>
 * </ul>
 *
 * <h3>Disposition</h3>
 * Soft block — the user is told what category was detected and why it is not
 * needed, and is invited to rephrase without the identifier.
 */
@Component
@Order(2)
@Slf4j
public class SensitiveIdentifierGuard implements InputGuard {

    private record IdentifierPattern(Pattern regex, String displayName, String guidance) {}

    private static final List<IdentifierPattern> PATTERNS = List.of(

        new IdentifierPattern(
            // SSN: 123-45-6789  or  123 45 6789
            Pattern.compile("\\b\\d{3}[\\-\\s]\\d{2}[\\-\\s]\\d{4}\\b"),
            "Social Security Number",
            "SSNs are not needed for clinical documentation — please remove it and rephrase."
        ),

        new IdentifierPattern(
            // Credit / debit card: 1234-5678-9012-3456  or  1234 5678 9012 3456
            Pattern.compile("\\b\\d{4}[\\-\\s]\\d{4}[\\-\\s]\\d{4}[\\-\\s]\\d{4}\\b"),
            "financial account number",
            "Financial account numbers are not needed in clinical documentation — please remove it and rephrase."
        )
    );

    // ── InputGuard ────────────────────────────────────────────────────────────

    @Override
    public int order() {
        return 2;
    }

    @Override
    public Optional<Violation> check(AppUser user, String message, List<String> authorizedClientIds) {
        if (message == null || message.isBlank()) return Optional.empty();

        for (IdentifierPattern ip : PATTERNS) {
            if (ip.regex().matcher(message).find()) {
                log.warn("SensitiveIdentifierGuard: blocked {} in message from user={} org={}",
                        ip.displayName(), user.getUid(), user.getOrgId());
                return Optional.of(new Violation(
                        "SENSITIVE_IDENTIFIER_DETECTED",
                        "This message appears to contain a " + ip.displayName() + ". " + ip.guidance(),
                        ip.displayName()
                ));
            }
        }
        return Optional.empty();
    }
}
