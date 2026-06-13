package ai.myaba.service.guard;

import ai.myaba.model.dto.AppUser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Guards against prompt-injection and jailbreak attempts in chat messages.
 *
 * <p>Catches explicit attempts to override system instructions, change the AI
 * persona, bypass compliance rules, or extract the system prompt — none of which
 * have any legitimate use in clinical documentation workflows.
 *
 * <h3>Detection strategy</h3>
 * Compiled regex patterns checked case-insensitively against the raw message.
 * Patterns are intentionally specific to minimise false positives on legitimate
 * clinical prose (e.g. "act as a reinforcer" does NOT trigger the persona check).
 *
 * <h3>Disposition</h3>
 * Hard block — security events are never soft-warned.  The user message is
 * deliberately non-specific to avoid hinting at the detection mechanism.
 */
@Component
@Order(1)
@Slf4j
public class PromptInjectionGuard implements InputGuard {

    // ── Detection patterns ────────────────────────────────────────────────────
    // Each pattern targets a distinct injection family.  Patterns use reluctant
    // quantifiers (.{0,40}?) to bound backtracking on long inputs.

    private static final List<Pattern> PATTERNS = List.of(

        // ── Instruction override ──────────────────────────────────────────────
        // "ignore your instructions", "ignore previous instructions", etc.
        Pattern.compile(
            "\\bignore\\b.{0,40}?\\b(your\\s+|previous\\s+|prior\\s+|all\\s+)?(instructions?|guidelines?|rules?|training|prompt)\\b",
            Pattern.CASE_INSENSITIVE),

        // "forget your instructions / prompt / training"
        Pattern.compile(
            "\\bforget\\b.{0,40}?\\b(your\\s+|previous\\s+|prior\\s+|all\\s+)(instructions?|guidelines?|rules?|training|prompt)\\b",
            Pattern.CASE_INSENSITIVE),

        // "disregard your guidelines / compliance"
        Pattern.compile(
            "\\bdisregard\\b.{0,40}?\\b(your\\s+|all\\s+)?(instructions?|guidelines?|rules?|compliance|hipaa)\\b",
            Pattern.CASE_INSENSITIVE),

        // ── Mode injection ────────────────────────────────────────────────────
        // "developer mode", "jailbreak mode", "DAN mode", "god mode", "admin mode"
        Pattern.compile(
            "\\b(developer|jailbreak|dan|unrestricted|god|sudo|admin|debug)\\s+mode\\b",
            Pattern.CASE_INSENSITIVE),

        // ── Compliance / governance bypass ────────────────────────────────────
        // "bypass HIPAA", "override compliance", "disable ACLX"
        Pattern.compile(
            "\\b(bypass|override|disable|circumvent|skip)\\b.{0,30}?\\b(hipaa|phi|compliance|aclx|governance|policy)\\b",
            Pattern.CASE_INSENSITIVE),

        // "HIPAA doesn't apply", "HIPAA does not apply"
        Pattern.compile(
            "\\bhipaa\\b.{0,20}?\\b(doesn.?t|does\\s+not|not)\\s+apply\\b",
            Pattern.CASE_INSENSITIVE),

        // ── Persona replacement (specific enough to avoid clinical false positives) ──
        // "act as an unrestricted AI" — but NOT "act as a reinforcer"
        Pattern.compile(
            "\\bact\\s+as\\b.{0,30}?\\b(unrestricted|jailbroken|uncensored|evil|dan)\\b",
            Pattern.CASE_INSENSITIVE),

        // "you are now an unrestricted AI"
        Pattern.compile(
            "\\byou\\s+are\\s+now\\b.{0,30}?\\b(unrestricted|jailbroken|uncensored|different\\s+ai|new\\s+ai)\\b",
            Pattern.CASE_INSENSITIVE),

        // "pretend you are an uncensored model"
        Pattern.compile(
            "\\bpretend\\s+(you\\s+are|to\\s+be)\\b.{0,30}?\\b(unrestricted|jailbroken|uncensored)\\b",
            Pattern.CASE_INSENSITIVE),

        // ── System prompt extraction ──────────────────────────────────────────
        // "show your system prompt", "reveal the prompt", "print your instructions"
        Pattern.compile(
            "\\b(show|reveal|print|repeat|display|output)\\b.{0,30}?\\b(your\\s+|the\\s+)?(system\\s+)?prompt\\b",
            Pattern.CASE_INSENSITIVE),

        // "what are your instructions", "what were your instructions"
        Pattern.compile(
            "\\bwhat\\s+(are|were)\\s+your\\s+(system\\s+)?(instructions?|prompt|directives?)\\b",
            Pattern.CASE_INSENSITIVE)
    );

    // ── InputGuard ────────────────────────────────────────────────────────────

    @Override
    public int order() {
        return 1;
    }

    @Override
    public Optional<Violation> check(AppUser user, String message, List<String> authorizedClientIds) {
        if (message == null || message.isBlank()) return Optional.empty();

        for (Pattern pattern : PATTERNS) {
            if (pattern.matcher(message).find()) {
                log.warn("PromptInjectionGuard: blocked message for user={} org={} (pattern={})",
                        user.getUid(), user.getOrgId(), pattern.pattern());
                return Optional.of(new Violation(
                        "PROMPT_INJECTION_DETECTED",
                        "This message contains content that conflicts with the clinical AI guidelines. " +
                        "If you intended to ask a clinical question, please rephrase it directly.",
                        "prompt-injection"
                ));
            }
        }
        return Optional.empty();
    }
}
