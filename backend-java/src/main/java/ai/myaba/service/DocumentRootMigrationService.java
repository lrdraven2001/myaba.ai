package ai.myaba.service;

import ai.myaba.util.FirestoreCollections;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.Firestore;
import com.google.firebase.cloud.FirestoreClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * One-time consolidation of the legacy {@code orgs/{orgId}/clients/{clientId}/documents}
 * tree into the canonical {@code organizations/...} tree (same sub-path), so all org
 * data lives under a single root.
 *
 * <p>The copy pass is idempotent (existing destination documents are never
 * overwritten) and runs automatically at startup, so a deploy that flips
 * {@link FirestoreCollections#DOCUMENTS_ROOT} self-heals: any document written to
 * the legacy tree by a previous revision is copied forward on next boot. The
 * legacy tree is only ever deleted explicitly, via the platform admin endpoint
 * ({@code POST /api/platform/migrate-doc-root?deleteSource=true}), once the copy
 * has been verified.
 */
@Service
@Slf4j
public class DocumentRootMigrationService {

    /** The historical top-level root client documents used to live under. */
    private static final String LEGACY_DOCUMENTS_ROOT = "orgs";

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    @EventListener(ApplicationReadyEvent.class)
    public void migrateOnStartup() {
        if (devMode) return; // in-memory dev mode — no Firestore
        try {
            Map<String, Object> result = migrate(false);
            int copied = (int) result.getOrDefault("documentsCopied", 0);
            if (copied > 0) {
                log.info("Doc-root migration: copied {} legacy documents into '{}' ({})",
                        copied, FirestoreCollections.ORGANIZATIONS, result);
            } else {
                log.info("Doc-root migration: nothing to copy ({})", result);
            }
        } catch (Exception e) {
            // Never block startup on migration — the endpoint can re-run it.
            log.warn("Doc-root startup migration failed (will retry on next boot): {}", e.getMessage());
        }
    }

    /**
     * Copy every legacy client document into the canonical tree, preserving org,
     * client, and document IDs. Existing destination documents are left untouched,
     * so re-running is always safe. When {@code deleteSource} is true, each source
     * document is deleted after its destination is confirmed present — clearing
     * the legacy tree entirely (Firestore drops empty phantom ancestors).
     */
    public Map<String, Object> migrate(boolean deleteSource) throws Exception {
        Firestore db = FirestoreClient.getFirestore();
        int orgs = 0, clients = 0, copied = 0, alreadyMigrated = 0, deleted = 0;

        // listDocuments() (not get()) — legacy org/client parents are phantom
        // documents that only exist as subcollection ancestors.
        for (DocumentReference orgRef : db.collection(LEGACY_DOCUMENTS_ROOT).listDocuments()) {
            orgs++;
            for (DocumentReference clientRef : orgRef.collection(FirestoreCollections.CLIENTS).listDocuments()) {
                clients++;
                var snaps = clientRef.collection(FirestoreCollections.DOCUMENTS).get().get().getDocuments();
                for (var snap : snaps) {
                    DocumentReference dest = db
                            .collection(FirestoreCollections.ORGANIZATIONS).document(orgRef.getId())
                            .collection(FirestoreCollections.CLIENTS).document(clientRef.getId())
                            .collection(FirestoreCollections.DOCUMENTS).document(snap.getId());
                    if (dest.get().get().exists()) {
                        alreadyMigrated++;
                    } else {
                        dest.set(snap.getData()).get();
                        copied++;
                    }
                    if (deleteSource) {
                        snap.getReference().delete().get();
                        deleted++;
                    }
                }
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("legacyOrgs",       orgs);
        result.put("legacyClients",    clients);
        result.put("documentsCopied",  copied);
        result.put("alreadyMigrated",  alreadyMigrated);
        result.put("legacyDeleted",    deleted);
        return result;
    }
}
