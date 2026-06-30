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

    /**
     * Root for client-generated documents: {@code orgs/{orgId}/clients/{clientId}/documents}.
     *
     * <p><b>Intentionally NOT {@link #ORGANIZATIONS}.</b> Client documents live under
     * a separate top-level {@code "orgs"} tree, while client records / members / config
     * live under {@code "organizations"}. This split is historical but consistent: both
     * the write path ({@code DocumentPersistenceService}) and the read paths
     * ({@code ClientController#getClientDocuments}, {@code #getClientDocument},
     * {@code #exportClient}) use this root. Production data already lives here, so do
     * not "consolidate" by pointing it at {@link #ORGANIZATIONS} without a data migration —
     * that would orphan every existing document. Use this constant so the divergence is
     * explicit and greppable rather than a bare {@code "orgs"} literal.
     */
    public static final String DOCUMENTS_ROOT = "orgs";
}
