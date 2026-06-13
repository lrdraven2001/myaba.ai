package ai.myaba.service;

/**
 * @deprecated Replaced by {@link ai.myaba.service.guard.CrossClientPhiGuard}.
 *
 * <p>This class is intentionally NOT annotated {@code @Service}.  All logic has
 * moved to the guard pipeline under {@code service/guard/}.  The orchestration
 * entry point is {@link InputGuardService}.
 *
 * <p>Safe to delete once all references (if any) are confirmed removed.
 */
@Deprecated(since = "2.0", forRemoval = true)
public class CrossClientGuardService {
    // Intentionally empty — see CrossClientPhiGuard
}
