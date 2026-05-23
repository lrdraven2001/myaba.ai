package ai.myaba.service;

import ai.myaba.model.dto.ClientRequest;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.firebase.cloud.FirestoreClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

@Service
@Slf4j
public class ClientService {

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    // In-memory store for dev mode
    private final Map<String, Map<String, Object>> devClients = new HashMap<>();

    public List<Map<String, Object>> getClients(String orgId) throws Exception {
        if (devMode) {
            return new ArrayList<>(devClients.values());
        }
        Firestore db = FirestoreClient.getFirestore();
        List<QueryDocumentSnapshot> docs = db
                .collection("organizations").document(orgId)
                .collection("clients")
                .orderBy("createdAt")
                .get().get().getDocuments();

        return docs.stream().map(d -> {
            Map<String, Object> m = new HashMap<>(d.getData());
            m.put("id", d.getId());
            return m;
        }).toList();
    }

    public Map<String, Object> getClient(String orgId, String clientId) throws Exception {
        if (devMode) {
            Map<String, Object> c = devClients.get(clientId);
            if (c == null) throw new NoSuchElementException("Client not found: " + clientId);
            return c;
        }
        Firestore db = FirestoreClient.getFirestore();
        var snap = db.collection("organizations").document(orgId)
                .collection("clients").document(clientId).get().get();
        if (!snap.exists()) throw new NoSuchElementException("Client not found: " + clientId);
        Map<String, Object> data = new HashMap<>(snap.getData());
        data.put("id", snap.getId());
        return data;
    }

    public String createClient(String orgId, String createdBy, ClientRequest req) throws Exception {
        Map<String, Object> data = clientData(req);
        data.put("createdBy", createdBy);
        data.put("createdAt", Instant.now().toString());

        if (devMode) {
            String id = "client-" + UUID.randomUUID().toString().substring(0, 8);
            data.put("id", id);
            devClients.put(id, data);
            return id;
        }

        Firestore db = FirestoreClient.getFirestore();
        var ref = db.collection("organizations").document(orgId)
                .collection("clients").add(data).get();
        return ref.getId();
    }

    public void updateClient(String orgId, String clientId, ClientRequest req) throws Exception {
        Map<String, Object> data = clientData(req);
        data.put("updatedAt", Instant.now().toString());

        if (devMode) {
            devClients.merge(clientId, data, (old, updates) -> {
                old.putAll(updates);
                return old;
            });
            return;
        }

        Firestore db = FirestoreClient.getFirestore();
        db.collection("organizations").document(orgId)
                .collection("clients").document(clientId)
                .update(data).get();
    }

    private Map<String, Object> clientData(ClientRequest req) {
        Map<String, Object> data = new HashMap<>();
        data.put("legalName", req.getLegalName());
        data.put("preferredName", req.getPreferredName() != null ? req.getPreferredName() : req.getLegalName());
        data.put("dateOfBirth", req.getDateOfBirth());
        data.put("gender", req.getGender());
        data.put("diagnosis", req.getDiagnosis());
        data.put("primaryInsurance", req.getPrimaryInsurance());
        data.put("ehrProvider", req.getEhrProvider());
        data.put("ehrCaseId", req.getEhrCaseId());
        return data;
    }
}
