package ai.myaba.service;

import ai.myaba.util.FirestoreCollections;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.Firestore;
import com.google.firebase.cloud.FirestoreClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * PHI-free directory lookup for external entities (schools, clinics, payers,
 * agencies) via the Google Places API, exposed to chat as the
 * {@code lookup_place} tool.
 *
 * <p>Boundary: the ONLY data that leaves the platform is the guarded entity
 * name plus the org's home locality — never client context, chat history, or
 * documents. Callers must run the entity name through the input guard first.
 *
 * <p>Cost control: resolved lookups are cached per org in
 * {@code organizations/{orgId}/directory}, keyed by the normalized query.
 * Cache entries expire after {@link #CACHE_TTL_DAYS} days so contact details
 * re-verify periodically.
 *
 * <p>Feature-gated: disabled (and the chat tool not offered) when
 * {@code PLACES_API_KEY} is unset.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PlaceLookupService {

    private static final int CACHE_TTL_DAYS = 180;
    private static final String DIRECTORY = "directory";

    private final ObjectMapper mapper;

    @Value("${places.api-key:}")
    private String apiKey;

    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    public boolean isEnabled() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * Resolve an entity's contact details, serving from the org cache when fresh.
     * Returns a map suitable for a Gemini functionResponse:
     * {@code {name, address, phone, website, source, retrievedAt, cached}} or
     * {@code {error}} when nothing was found.
     */
    public Map<String, Object> lookup(String orgId, String entityName, String locality) {
        String query = locality != null && !locality.isBlank()
                ? entityName.trim() + " " + locality
                : entityName.trim();
        String cacheKey = sha1(query.toLowerCase(Locale.ROOT).replaceAll("\\s+", " "));

        // ── Cache read ────────────────────────────────────────────────────────
        if (!devMode) {
            try {
                Firestore db = FirestoreClient.getFirestore();
                var snap = directoryRef(db, orgId, cacheKey).get().get();
                if (snap.exists()) {
                    Long retrievedAtMs = snap.getLong("retrievedAtMs");
                    boolean fresh = retrievedAtMs != null
                            && retrievedAtMs > System.currentTimeMillis() - CACHE_TTL_DAYS * 86_400_000L;
                    if (fresh) {
                        Map<String, Object> cached = new LinkedHashMap<>(snap.getData());
                        cached.remove("query");
                        cached.remove("retrievedAtMs");
                        cached.put("cached", true);
                        return cached;
                    }
                }
            } catch (Exception e) {
                log.warn("Directory cache read failed org={}: {}", orgId, e.getMessage());
            }
        }

        // ── Places API (New) Text Search ──────────────────────────────────────
        Map<String, Object> result = searchPlaces(query);
        if (result.containsKey("error")) return result;

        // ── Cache write (best effort) ─────────────────────────────────────────
        if (!devMode) {
            try {
                Firestore db = FirestoreClient.getFirestore();
                Map<String, Object> record = new HashMap<>(result);
                record.put("query", query);
                record.put("retrievedAtMs", System.currentTimeMillis());
                directoryRef(db, orgId, cacheKey).set(record).get();
            } catch (Exception e) {
                log.warn("Directory cache write failed org={}: {}", orgId, e.getMessage());
            }
        }
        result.put("cached", false);
        return result;
    }

    private DocumentReference directoryRef(Firestore db, String orgId, String cacheKey) {
        return db.collection(FirestoreCollections.ORGANIZATIONS).document(orgId)
                 .collection(DIRECTORY).document(cacheKey);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> searchPlaces(String query) {
        try {
            HttpURLConnection conn = (HttpURLConnection)
                    new URL("https://places.googleapis.com/v1/places:searchText").openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(15_000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("X-Goog-Api-Key", apiKey);
            conn.setRequestProperty("X-Goog-FieldMask",
                    "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri");
            byte[] body = mapper.writeValueAsBytes(Map.of("textQuery", query, "pageSize", 3));
            conn.getOutputStream().write(body);

            int status = conn.getResponseCode();
            String resp = new String(
                    (status == 200 ? conn.getInputStream() : conn.getErrorStream()).readAllBytes(),
                    StandardCharsets.UTF_8);
            if (status != 200) {
                log.error("Places API error {}: {}", status, resp);
                return Map.of("error", "Directory lookup service returned an error.");
            }
            Map<?, ?> parsed = mapper.readValue(resp, Map.class);
            List<Map<String, Object>> places = (List<Map<String, Object>>) parsed.get("places");
            if (places == null || places.isEmpty()) {
                return Map.of("error", "No matching place found for \"" + query + "\".");
            }
            Map<String, Object> top = places.get(0);
            Map<String, Object> out = new LinkedHashMap<>();
            Object displayName = top.get("displayName");
            out.put("name", displayName instanceof Map<?, ?> dn ? dn.get("text") : String.valueOf(displayName));
            out.put("address", top.getOrDefault("formattedAddress", ""));
            out.put("phone",   top.getOrDefault("nationalPhoneNumber", ""));
            out.put("website", top.getOrDefault("websiteUri", ""));
            out.put("source", "Google Places");
            out.put("retrievedAt", Instant.now().toString());
            return out;
        } catch (Exception e) {
            log.error("Places lookup failed for \"{}\": {}", query, e.getMessage());
            return Map.of("error", "Directory lookup is temporarily unavailable.");
        }
    }

    private static String sha1(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            StringBuilder sb = new StringBuilder();
            for (byte b : md.digest(s.getBytes(StandardCharsets.UTF_8))) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
