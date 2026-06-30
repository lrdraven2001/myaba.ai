package ai.myaba.util;

/**
 * Canonical Firestore collection / sub-document names.
 *
 * <p>Replaces hardcoded string literals (e.g. {@code "organizations"} appears
 * 100+ times) scattered across services. Reference these constants so renames
 * and typos are caught at compile time.
 */
public final class FirestoreCollections {

    private FirestoreCollections() {}

    public static final String ORGANIZATIONS = "organizations";
    public static final String CONFIG        = "config";
    public static final String MEMBERS       = "members";
    public static final String CLIENTS       = "clients";
    public static final String DOCUMENTS     = "documents";
    public static final String PROJECTS      = "projects";
    public static final String TEMPLATES     = "templates";
    public static final String POLICIES      = "policies";
}
