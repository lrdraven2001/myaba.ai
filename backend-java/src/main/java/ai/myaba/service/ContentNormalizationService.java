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

    /**
     * Rewrite each in-scope client's names to their first+last INITIALS (e.g. "J.D.") — a
     * stronger de-identification than preferred names, applied to chats + chat labels. Replaces
     * the legal full name, "Last, First", preferred name, and standalone first name. (Standalone
     * last names are intentionally left alone — too many collide with common words.) Best-effort
     * backstop to the model instruction.
     */
    public String initialsOnly(String text, Collection<Map<String, Object>> clients, boolean enabled) {
        if (!enabled || text == null || text.isBlank() || clients == null || clients.isEmpty()) return text;
        String out = text;
        for (Map<String, Object> c : clients) {
            if (c == null) continue;
            String first     = str(c.get("firstName"));
            String last      = str(c.get("lastName"));
            String preferred = str(c.get("preferredName"));
            String initials  = initialsOf(first, last, preferred);
            if (initials.isEmpty()) continue;
            String full = (first + " " + last).trim();

            if (!full.isEmpty())                       out = replaceWord(out, full, initials, true);   // full legal (ci)
            if (!first.isEmpty() && !last.isEmpty())   out = out.replace(last + ", " + first, initials); // "Last, First"
            if (!preferred.isEmpty())                  out = replaceWord(out, preferred, initials, true); // preferred (ci)
            if (!first.isEmpty())                      out = replaceWord(out, first, initials, false);   // first name (cs)
        }
        return out;
    }

    /**
     * Rewrite each in-scope client's GUARDIAN names to their user-defined relationship label
     * (e.g. "Mother", "Father"). Applied to chats + documents when the org enables it — an
     * additional pass on top of the client-name rules (guardians are different people). Each
     * guardian is {@code { name, relationship }}; entries missing either field are skipped.
     */
    @SuppressWarnings("unchecked")
    public String guardianLabels(String text, Collection<Map<String, Object>> clients, boolean enabled) {
        if (!enabled || text == null || text.isBlank() || clients == null || clients.isEmpty()) return text;
        String out = text;
        for (Map<String, Object> c : clients) {
            if (c == null || !(c.get("guardians") instanceof Collection<?> gs)) continue;
            for (Object g : gs) {
                if (!(g instanceof Map<?, ?> gm)) continue;
                String name  = str(((Map<String, Object>) gm).get("name"));
                String label = str(((Map<String, Object>) gm).get("relationship"));
                if (name.isEmpty() || label.isEmpty() || name.equalsIgnoreCase(label)) continue;
                out = replaceWord(out, name, label, true); // full guardian name → relationship (ci)
                // Also a standalone first token of a multi-word guardian name (e.g. "Jane" from "Jane Doe").
                String firstTok = name.split("\\s+")[0];
                if (!firstTok.equalsIgnoreCase(name) && firstTok.length() > 1) {
                    out = replaceWord(out, firstTok, label, false);
                }
            }
        }
        return out;
    }

    /** First+last initials like "J.D." — first initial from firstName (or preferred), last from lastName. */
    private static String initialsOf(String first, String last, String preferred) {
        char f = firstLetter(!first.isEmpty() ? first : preferred);
        char l = firstLetter(last);
        StringBuilder sb = new StringBuilder();
        if (f != 0) sb.append(Character.toUpperCase(f)).append('.');
        if (l != 0) sb.append(Character.toUpperCase(l)).append('.');
        return sb.toString();
    }

    private static char firstLetter(String s) {
        for (int i = 0; i < s.length(); i++) if (Character.isLetter(s.charAt(i))) return s.charAt(i);
        return 0;
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
