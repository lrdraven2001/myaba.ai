package ai.myaba.service.guard;

import ai.myaba.model.dto.AppUser;
import ai.myaba.service.ClientService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Input guard against cross-client PHI references in chat messages.
 *
 * <p>Before a chat message is forwarded to Gemini this guard checks whether the
 * user's text references a client that is <em>not</em> in the current chat's
 * authorized scope.  The canonical trigger is a clinician typing something like
 * {@code "make a schedule like Jeff's for Jane"} inside Jane's chat — Jeff's PHI
 * must not enter Jane's clinical record.
 *
 * <p>This is <strong>Layer 1</strong> of the three-layer cross-client defence:
 * <ol>
 *   <li><strong>Input scan (this guard)</strong> — catches explicit name references
 *       before any tokens are spent and returns a redirect to the template workflow.</li>
 *   <li><strong>Context scoping</strong> — only records belonging to the chat's
 *       {@code clientIds} are injected into the Gemini system prompt.</li>
 *   <li><strong>ACLX output detection</strong> — HIPAA Minimum Necessary check
 *       (45 CFR §164.514(d)) flags cross-patient PHI in the AI response.</li>
 * </ol>
 *
 * <h3>Detection strategy</h3>
 * <ul>
 *   <li><strong>Full legal name</strong> — checked anywhere in the message.</li>
 *   <li><strong>Preferred / first name in possessive form</strong> — checked as
 *       {@code "name's"} to reduce false positives on common first names.</li>
 * </ul>
 *
 * <h3>Scope rule</h3>
 * Only fires when the chat has at least one explicitly authorized client
 * ({@code authorizedClientIds} non-empty).  General chats rely on Layers 2 and 3.
 */
@Component
@Order(3)
@RequiredArgsConstructor
@Slf4j
public class CrossClientPhiGuard implements InputGuard {

    private final ClientService clientService;

    // ── InputGuard ────────────────────────────────────────────────────────────

    @Override
    public int order() {
        return 3;
    }

    @Override
    public Optional<Violation> check(AppUser user,
                                      String message,
                                      List<String> authorizedClientIds) {

        // Only applies to client-scoped chats
        if (message == null || message.isBlank()) return Optional.empty();
        if (authorizedClientIds == null || authorizedClientIds.isEmpty()) return Optional.empty();

        List<Map<String, Object>> allClients;
        try {
            allClients = clientService.getAuthorizedClients(user);
        } catch (Exception e) {
            // Non-fatal — skip guard rather than blocking legitimate messages
            log.warn("CrossClientPhiGuard: could not load roster for org={} (guard skipped): {}",
                    user.getOrgId(), e.getMessage());
            return Optional.empty();
        }

        String lowerMsg = message.toLowerCase();

        for (Map<String, Object> client : allClients) {
            String clientId = (String) client.get("id");
            if (authorizedClientIds.contains(clientId)) continue;  // in scope — skip

            String firstName  = safeStr(client, "firstName");
            String lastName   = safeStr(client, "lastName");
            String preferred  = safeStr(client, "preferredName");

            // ── Check 1: full legal name anywhere ─────────────────────────────
            if (!firstName.isEmpty() && !lastName.isEmpty()) {
                String fullName = (firstName + " " + lastName).toLowerCase();
                if (lowerMsg.contains(fullName)) {
                    return Optional.of(buildViolation(firstName + " " + lastName));
                }
            }

            // ── Check 2: preferred name in possessive ("Jeff's") ──────────────
            String nameForPossessive = preferred.isEmpty() ? firstName : preferred;
            if (!nameForPossessive.isEmpty()) {
                if (lowerMsg.contains(nameForPossessive.toLowerCase() + "'s")) {
                    return Optional.of(buildViolation(nameForPossessive));
                }
            }

            // ── Check 3: first name possessive when preferred ≠ first ─────────
            if (!firstName.isEmpty() && !firstName.equalsIgnoreCase(nameForPossessive)) {
                if (lowerMsg.contains(firstName.toLowerCase() + "'s")) {
                    return Optional.of(buildViolation(firstName));
                }
            }
        }

        return Optional.empty();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Violation buildViolation(String detectedName) {
        String msg =
                "This chat is scoped to a specific client. Referencing \"" + detectedName + "\" " +
                "here would bring another client's information into this record, which is not " +
                "permitted under HIPAA's Minimum Necessary Rule (45 CFR §164.514(d)).\n\n" +
                "To reuse a clinical structure without carrying PHI across clients, save it as " +
                "a de-identified template first: open the source chat, click \"Save as Template\" " +
                "on the relevant response, then apply that template here.";
        return new Violation("CROSS_CLIENT_PHI_INPUT", msg, detectedName);
    }

    private String safeStr(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return (v instanceof String s) ? s.trim() : "";
    }
}
