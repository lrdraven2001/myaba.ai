package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.service.TrustedDeviceService;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Trusted-device ("remember this device") endpoints. See {@link TrustedDeviceService}
 * for the mechanism and its security properties. The token is carried in an
 * <b>httpOnly</b> cookie named {@code __session} — the only cookie name Firebase Hosting
 * forwards to the Cloud Run backend — so it is never readable from JavaScript.
 */
@RestController
@RequestMapping("/api/auth/trusted-devices")
@RequiredArgsConstructor
@Slf4j
public class TrustedDeviceController {

    /** Firebase Hosting forwards ONLY a cookie literally named __session to the backend. */
    private static final String COOKIE_NAME = "__session";

    private final TrustedDeviceService trustedDeviceService;

    /**
     * Register the current device as trusted. Only succeeds when the caller's ID token
     * proves a second factor was just completed (see the service). Fail-graceful: returns
     * {@code {trusted:false, reason}} rather than an error when trust can't be granted.
     */
    @PostMapping
    public ResponseEntity<?> register(@AuthenticationPrincipal AppUser user,
                                      HttpServletRequest req, HttpServletResponse res) {
        if (user == null) return ResponseEntity.status(401).build();
        if (!trustedDeviceService.isEnabled()) {
            return ResponseEntity.ok(Map.of("trusted", false, "reason", "disabled"));
        }
        String token = extractToken(req);
        if (token == null) {
            return ResponseEntity.ok(Map.of("trusted", false, "reason", "no-token"));
        }

        long authTime;
        boolean usedSecondFactor;
        try {
            FirebaseToken decoded = FirebaseAuth.getInstance().verifyIdToken(token);
            if (!decoded.getUid().equals(user.getUid())) {
                return ResponseEntity.status(401).build();
            }
            Object at = decoded.getClaims().get("auth_time");
            authTime = at instanceof Number n ? n.longValue() : 0L;
            usedSecondFactor = extractSecondFactor(decoded);
        } catch (Exception e) {
            log.warn("Trusted-device register: token verification failed: {}", e.getMessage());
            return ResponseEntity.status(401).build();
        }

        TrustedDeviceService.MintResult r = trustedDeviceService.mint(
                user.getUid(), user.getOrgId(), authTime, usedSecondFactor, req.getHeader("User-Agent"));

        if (!r.trusted()) {
            return ResponseEntity.ok(Map.of("trusted", false, "reason", r.reason()));
        }

        long maxAgeSec = Math.max(0, (r.expiresAtEpochMs() - System.currentTimeMillis()) / 1000L);
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, r.cookieValue())
                .httpOnly(true)
                .secure(true)
                .sameSite("Strict")
                .path("/")
                .maxAge(Duration.ofSeconds(maxAgeSec))
                .build();
        res.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
        return ResponseEntity.ok(Map.of("trusted", true, "deviceId", r.deviceId(), "expiresAt", r.expiresAtEpochMs()));
    }

    /** List this user's active trusted devices (marks the calling device as {@code current}). */
    @GetMapping
    public List<Map<String, Object>> list(@AuthenticationPrincipal AppUser user, HttpServletRequest req) {
        if (user == null) return List.of();
        String current = trustedDeviceService.peekDeviceId(readSessionCookie(req));
        return trustedDeviceService.list(user.getUid(), current);
    }

    /** Revoke one device. If it's the calling device, also clear its cookie. */
    @DeleteMapping("/{deviceId}")
    public ResponseEntity<?> revoke(@AuthenticationPrincipal AppUser user, @PathVariable String deviceId,
                                    HttpServletRequest req, HttpServletResponse res) {
        if (user == null) return ResponseEntity.status(401).build();
        trustedDeviceService.revoke(user.getUid(), deviceId);
        if (deviceId.equals(trustedDeviceService.peekDeviceId(readSessionCookie(req)))) {
            clearCookie(res);
        }
        return ResponseEntity.noContent().build();
    }

    /** Revoke every trusted device for this user and clear the calling device's cookie. */
    @DeleteMapping
    public ResponseEntity<?> revokeAll(@AuthenticationPrincipal AppUser user, HttpServletResponse res) {
        if (user == null) return ResponseEntity.status(401).build();
        trustedDeviceService.revokeAll(user.getUid());
        clearCookie(res);
        return ResponseEntity.noContent().build();
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static String extractToken(HttpServletRequest req) {
        String token = req.getHeader("X-Firebase-Token");
        if (token != null && !token.isBlank()) return token;
        String header = req.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) return header.substring(7);
        return null;
    }

    /** The {@code firebase.sign_in_second_factor} claim is present only when a factor was used. */
    @SuppressWarnings("unchecked")
    private static boolean extractSecondFactor(FirebaseToken decoded) {
        Object firebase = decoded.getClaims().get("firebase");
        if (firebase instanceof Map<?, ?> m) {
            Object sf = ((Map<String, Object>) m).get("sign_in_second_factor");
            return sf != null && !sf.toString().isBlank();
        }
        return false;
    }

    private static String readSessionCookie(HttpServletRequest req) {
        Cookie[] cookies = req.getCookies();
        if (cookies == null) return null;
        for (Cookie c : cookies) {
            if (COOKIE_NAME.equals(c.getName())) return c.getValue();
        }
        return null;
    }

    private static void clearCookie(HttpServletResponse res) {
        ResponseCookie cleared = ResponseCookie.from(COOKIE_NAME, "")
                .httpOnly(true).secure(true).sameSite("Strict").path("/").maxAge(0).build();
        res.addHeader(HttpHeaders.SET_COOKIE, cleared.toString());
    }
}
