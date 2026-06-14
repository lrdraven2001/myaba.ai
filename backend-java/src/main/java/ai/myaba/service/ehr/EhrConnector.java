package ai.myaba.service.ehr;

import ai.myaba.model.dto.EhrClientRecord;

import java.util.List;
import java.util.Map;

/**
 * Common interface for EHR system connectors.
 *
 * <p>Credentials are passed in as a plain {@code Map<String, String>} so each
 * connector can declare its own required keys (e.g. {@code apiToken},
 * {@code apiKey + accountId}).  The caller ({@link ai.myaba.service.EhrService})
 * decrypts credentials from Firestore before passing them here.
 *
 * <p>All methods throw checked {@link Exception} so callers can wrap failures
 * into structured API error responses.
 */
public interface EhrConnector {

    /** Short stable identifier, stored in Firestore and used in API paths. */
    String getEhrType();

    /** Human-readable name for UI display. */
    String getDisplayName();

    /**
     * Verify that the supplied credentials work.
     * Should make a lightweight authenticated request (e.g. list 1 client).
     *
     * @throws Exception with a human-readable message if the connection fails
     */
    void testConnection(Map<String, String> credentials) throws Exception;

    /**
     * Search for clients by name fragment.
     * Returns up to 20 results ordered by relevance.
     */
    List<EhrClientRecord> searchClients(Map<String, String> credentials,
                                         String query) throws Exception;

    /**
     * Fetch the full record for one client by their EHR-native ID.
     */
    EhrClientRecord getClient(Map<String, String> credentials,
                               String ehrClientId) throws Exception;
}
