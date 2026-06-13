package ai.myaba.service;

import ai.myaba.model.dto.AppUser;
import ai.myaba.service.guard.InputGuard;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * Orchestrates all pre-flight input guards in priority order.
 *
 * <p>Every chat message passes through this service before any tokens are sent to
 * Claude.  Guards run sequentially, lowest {@link InputGuard#order()} first, and
 * evaluation stops at the first violation.
 *
 * <h3>Guard registry</h3>
 * Spring auto-collects every {@code @Component} bean implementing {@link InputGuard}
 * and injects them as a {@code List<InputGuard>}.  To add a new guard, create a new
 * component — this service requires no changes.
 *
 * <h3>Current pipeline (in evaluation order)</h3>
 * <ol>
 *   <li><b>@Order(1) PromptInjectionGuard</b>      — jailbreak / instruction-override patterns</li>
 *   <li><b>@Order(2) SensitiveIdentifierGuard</b>  — SSN, credit-card, and similar super-PHI</li>
 *   <li><b>@Order(3) CrossClientPhiGuard</b>        — cross-client name references (HIPAA §164.514(d))</li>
 * </ol>
 */
@Service
@Slf4j
public class InputGuardService {

    private final List<InputGuard> guards;

    /**
     * Spring injects ALL {@link InputGuard} beans here.
     * The list is sorted once at construction time; evaluation order is stable.
     */
    public InputGuardService(List<InputGuard> guards) {
        this.guards = guards.stream()
                .sorted(Comparator.comparingInt(InputGuard::order))
                .toList();
        log.info("InputGuardService initialised with {} guard(s): {}",
                guards.size(),
                this.guards.stream().map(g -> g.getClass().getSimpleName()).toList());
    }

    /**
     * Run all guards in priority order and return the first violation found.
     *
     * @param user                requesting clinician
     * @param message             raw chat message text
     * @param authorizedClientIds client IDs in scope for this chat
     * @return first violation, or {@link Optional#empty()} if all guards pass
     */
    public Optional<InputGuard.Violation> check(AppUser user,
                                                 String message,
                                                 List<String> authorizedClientIds) {
        if (message == null || message.isBlank()) return Optional.empty();

        for (InputGuard guard : guards) {
            Optional<InputGuard.Violation> result =
                    guard.check(user, message, authorizedClientIds);
            if (result.isPresent()) {
                log.debug("InputGuard '{}' blocked message for user={}",
                        guard.getClass().getSimpleName(), user.getUid());
                return result;
            }
        }
        return Optional.empty();
    }
}
