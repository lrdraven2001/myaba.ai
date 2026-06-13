package ai.myaba.service.guard;

import ai.myaba.model.dto.AppUser;

import java.util.List;
import java.util.Optional;

/**
 * Contract for a single input guard in the pre-flight check pipeline.
 *
 * <p>Each guard is a Spring {@code @Component} that examines the raw chat message
 * before any tokens are sent to Claude.  Guards run in priority order (lowest
 * {@link #order()} first) and the first violation wins — subsequent guards are
 * not evaluated.
 *
 * <h3>Adding a new guard</h3>
 * <ol>
 *   <li>Create a new {@code @Component} that implements {@code InputGuard}.</li>
 *   <li>Annotate it with {@code @Order(n)} (lower = higher priority).</li>
 *   <li>Implement {@link #check}.</li>
 * </ol>
 * No other file needs to change — {@link ai.myaba.service.InputGuardService}
 * auto-collects all {@code InputGuard} beans via Spring's collection injection.
 */
public interface InputGuard {

    /**
     * Encapsulates a detected policy violation.
     *
     * @param code           machine-readable violation code returned to the frontend
     *                       (e.g. {@code CROSS_CLIENT_PHI_INPUT}, {@code PROMPT_INJECTION_DETECTED})
     * @param userMessage    human-readable explanation; safe to surface in API responses
     * @param detectedValue  what triggered the guard (name fragment, keyword, pattern name);
     *                       used for audit logs and frontend callouts
     */
    record Violation(String code, String userMessage, String detectedValue) {}

    /**
     * Examine {@code message} and return a violation if this guard fires, or
     * {@link Optional#empty()} to pass through to the next guard.
     *
     * <p>Implementations must be non-throwing for recoverable errors — use
     * {@link Optional#empty()} to pass through rather than blocking on a
     * transient data-store failure.
     *
     * @param user                requesting clinician (provides org scope)
     * @param message             raw chat message text
     * @param authorizedClientIds client IDs explicitly in scope for this chat;
     *                            empty for general / project chats
     */
    Optional<Violation> check(AppUser user, String message, List<String> authorizedClientIds);

    /**
     * Evaluation priority.  Lower values run first.
     * Override to control ordering without changing {@code @Order} annotations.
     * Defaults to {@code Integer.MAX_VALUE} so guards without an explicit order
     * run last.
     */
    default int order() {
        return Integer.MAX_VALUE;
    }
}
