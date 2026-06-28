package ai.myaba.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Deterministic output-shaping rules applied to AI text before it reaches the user.
 *
 * <p>Currently: when an org enables "use client preferred names", any occurrence of an
 * in-scope client's legal name in the output is rewritten to their preferred/display name.
 * This is a best-effort substitution (the prompt instruction is the first line of defense;
 * this pass is the deterministic backstop), and it reduces legal-name exposure.
 */
@Service
@Slf4j
public class ContentNormalizationService {

    /**
     * Rewrite legal client names to preferred/display names for each in-scope client.
     * Returns the text unchanged when disabled or when no client has a distinct preferred name.
     */
    public String preferDisplayNames(String text, Collection<Map<String, Object>> clients, boolean enabled) {
        if (!enabled || text == null || text.isBlank() || clients == null || clients.isEmpty()) return text;
        String out = text;
        for (Map<String, Object> c : clients) {
            if (c == null) continue;
            String preferred = str(c.get("preferredName"));
            if (preferred.isEmpty()) continue; // nothing to normalize to
            String first = str(c.get("firstName"));
            String last  = str(c.get("lastName"));
            String full  = (first + " " + last).trim();

            // 1) Full legal name → preferred (case-insensitive).
            if (!full.isEmpty() && !full.equalsIgnoreCase(preferred)) {
                out = replaceWord(out, full, preferred, true);
            }
            // 2) "Last, First" form → preferred.
            if (!first.isEmpty() && !last.isEmpty()) {
                out = out.replace(last + ", " + first, preferred);
            }
            // 3) Standalone first name → preferred (case-SENSITIVE to avoid matching common
            //    lowercase words like "will" or "mark" used as verbs).
            if (!first.isEmpty() && !first.equalsIgnoreCase(preferred)) {
                out = replaceWord(out, first, preferred, false);
            }
        }
        return out;
    }

    private String replaceWord(String text, String target, String replacement, boolean ignoreCase) {
        try {
            String flags = ignoreCase ? "(?i)" : "";
            Pattern p = Pattern.compile(flags + "\\b" + Pattern.quote(target) + "\\b");
            return p.matcher(text).replaceAll(Matcher.quoteReplacement(replacement));
        } catch (Exception e) {
            log.warn("Name normalization skipped a target: {}", e.getMessage());
            return text;
        }
    }

    private static String str(Object o) { return o == null ? "" : o.toString().trim(); }
}
