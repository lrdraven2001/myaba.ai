package ai.myaba.service.guard;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.AclxResponse;
import ai.myaba.service.AclxService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * Pre-flight input guard that evaluates the user's message through the ACLX
 * governance layer before forwarding it to Gemini.
 *
 * <p>This guard runs after the local regex guards (prompt injection, sensitive
 * identifiers, cross-client PHI) and before any Gemini tokens are spent.
 * It provides ACLX's full DLP pipeline on user input — including cloud DLP
 * when {@code ENABLE_CLOUD_DLP=true} on the gateway — without duplicating
 * the local pattern logic.
 *
 * <p>Failure behaviour: ACLX unreachable → pass-through (non-fatal, logged).
 * The local guards at lower order values provide fallback protection.
 * This is intentional — input guard failure should never block every message
 * when ACLX is temporarily unreachable.
 *
 * <h3>Order</h3>
 * {@code @Order(10)} — runs after the local guards (order 1–3) so cheap local
 * checks always fire first and cheap short-circuits avoid ACLX round-trips for
 * obvious violations.
 *
 * <h3>Violation codes</h3>
 * <ul>
 *   <li>{@code ACLX_INPUT_BLOCKED} — ACLX BLOCK decision on input text</li>
 *   <li>{@code ACLX_INPUT_ESCALATED} — ACLX ESCALATE decision on input text</li>
 * </ul>
 */
@Component
@Order(10)
@RequiredArgsConstructor
@Slf4j
public class AclxInputGuard implements InputGuard {

    private final AclxService aclxService;

    @Override
    public int order() { return 10; }

    @Override
    public Optional<Violation> check(AppUser user, String message, List<String> authorizedClientIds) {
        AclxResponse result = aclxService.evaluateInput(message, user);
        if (result == null || result.getDecision() == null) return Optional.empty();

        String decision = result.getDecision().getDecision();

        if ("BLOCK".equals(decision)) {
            log.warn("AclxInputGuard BLOCK: user={} org={} contentId={}",
                    user.getUid(), user.getOrgId(), result.getContentId());
            return Optional.of(new Violation(
                    "ACLX_INPUT_BLOCKED",
                    "Your message was blocked by the compliance system. " +
                    "Please remove any sensitive identifiers and try again.",
                    null // do not surface detected value — may be PHI
            ));
        }

        if ("ESCALATE".equals(decision)) {
            // ESCALATE on input means "flag for review" — not a hard block.
            // The message is allowed through; the output guard runs after Gemini responds
            // and will escalate the AI response to the review queue if needed.
            // Blocking user input on ESCALATE is too aggressive and prevents legitimate
            // messages from being processed when the org has no custom ACLX policy yet.
            String reason = result.getDecision().getReason();
            boolean isSynthesis = reason != null && reason.startsWith("SYNTHESIS_DETECTED");
            log.warn("AclxInputGuard ESCALATE (pass-through): user={} org={} contentId={} synthesis={}",
                    user.getUid(), user.getOrgId(), result.getContentId(), isSynthesis);
            return Optional.empty();
        }

        return Optional.empty();
    }
}
