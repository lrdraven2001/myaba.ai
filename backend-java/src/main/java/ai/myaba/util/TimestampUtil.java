package ai.myaba.util;

import java.time.Instant;

/**
 * Centralized ISO-8601 timestamp generation.
 *
 * <p>Replaces the {@code Instant.now().toString()} call repeated 50+ times
 * across services, giving a single place to change timestamp formatting.
 */
public final class TimestampUtil {

    private TimestampUtil() {}

    /** Current instant as an ISO-8601 string (e.g. {@code 2026-06-30T03:11:48.354Z}). */
    public static String now() {
        return Instant.now().toString();
    }
}
