package ai.myaba.service.ehr;

import ai.myaba.model.dto.EhrClientRecord;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * EHR connector for Rethink (rethinkfirst.com).
 *
 * <p>Rethink is widely used by ABA providers in Virginia, particularly those
 * serving Medicaid-funded clients through DBHDS waiver programs.
 *
 * <h3>Authentication</h3>
 * <p>Uses an API key generated in Rethink:
 * <em>Settings → API Access → Generate API Key</em>.
 * Pass as {@code credentials.get("apiKey")}.
 *
 * <h3>Required credential keys</h3>
 * <ul>
 *   <li>{@code apiKey} — Rethink API key</li>
 *   <li>{@code accountId} — Rethink account / organization ID</li>
 * </ul>
 *
 * <h3>API reference</h3>
 * <p>Base URL: {@code https://api.rethinkfirst.com/v1}
 * API key is passed in the {@code X-Api-Key} header.
 *
 * <p><strong>NOTE:</strong> Verify exact endpoint paths and field names
 * against Rethink's developer documentation once you have sandbox credentials.
 */
@Component
@Slf4j
public class RethinkConnector implements EhrConnector {

    @Value("${ehr.rethink.base-url:https://api.rethinkfirst.com/v1}")
    private String baseUrl;

    private final ObjectMapper mapper = new ObjectMapper();

    // ── EhrConnector ──────────────────────────────────────────────────────────

    @Override
    public String getEhrType() { return "rethink"; }

    @Override
    public String getDisplayName() { return "Rethink"; }

    @Override
    public void testConnection(Map<String, String> credentials) throws Exception {
        String url = baseUrl + "/clients?limit=1";
        HttpURLConnection conn = openGet(url, credentials);
        int status = conn.getResponseCode();
        if (status != 200) {
            String body = readBody(conn, false);
            throw new Exception("Rethink returned HTTP " + status + ": " + body);
        }
    }

    @Override
    public List<EhrClientRecord> searchClients(Map<String, String> credentials,
                                                String query) throws Exception {
        String encoded = URLEncoder.encode(query, StandardCharsets.UTF_8);
        String url = baseUrl + "/clients?search=" + encoded + "&limit=20&active=true";

        HttpURLConnection conn = openGet(url, credentials);
        int status = conn.getResponseCode();
        if (status != 200) {
            String body = readBody(conn, false);
            throw new Exception("Rethink client search failed HTTP " + status + ": " + body);
        }

        JsonNode root = mapper.readTree(readBody(conn, true));
        List<EhrClientRecord> results = new ArrayList<>();

        // Rethink returns { clients: [ { id, firstName, lastName, ... } ] }
        JsonNode clients = root.path("clients");
        if (!clients.isArray()) {
            // Some API versions wrap in "data"
            clients = root.path("data");
        }
        if (clients.isArray()) {
            for (JsonNode client : clients) {
                results.add(parseClient(client));
            }
        }
        return results;
    }

    @Override
    public EhrClientRecord getClient(Map<String, String> credentials,
                                      String ehrClientId) throws Exception {
        String url = baseUrl + "/clients/" + ehrClientId;

        HttpURLConnection conn = openGet(url, credentials);
        int status = conn.getResponseCode();
        if (status != 200) {
            String body = readBody(conn, false);
            throw new Exception("Rethink client fetch failed HTTP " + status + ": " + body);
        }

        JsonNode root = mapper.readTree(readBody(conn, true));
        // Some Rethink endpoints wrap in "client" key
        JsonNode data = root.has("client") ? root.path("client") : root;
        return parseClient(data);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private HttpURLConnection openGet(String urlStr,
                                       Map<String, String> credentials) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(10_000);
        conn.setReadTimeout(15_000);
        conn.setRequestProperty("X-Api-Key", credentials.get("apiKey"));
        conn.setRequestProperty("X-Account-Id", credentials.getOrDefault("accountId", ""));
        conn.setRequestProperty("Accept", "application/json");
        return conn;
    }

    private String readBody(HttpURLConnection conn, boolean success) throws Exception {
        InputStream is = success ? conn.getInputStream() : conn.getErrorStream();
        if (is == null) return "";
        return new String(is.readAllBytes(), StandardCharsets.UTF_8);
    }

    /**
     * Maps a Rethink client JSON node to a normalised {@link EhrClientRecord}.
     *
     * <p>Rethink field names: id, firstName, lastName, preferredName,
     * birthDate (YYYY-MM-DD), gender,
     * diagnoses (array of { code, description }),
     * insuranceName, memberId
     */
    private EhrClientRecord parseClient(JsonNode c) {
        List<String> codes = new ArrayList<>();
        List<String> descs = new ArrayList<>();
        JsonNode diags = c.path("diagnoses");
        if (diags.isArray()) {
            for (JsonNode d : diags) {
                codes.add(d.path("code").asText(""));
                descs.add(d.path("description").asText(""));
            }
        }

        return EhrClientRecord.builder()
                .ehrId(c.path("id").asText())
                .ehrType("rethink")
                .firstName(c.path("firstName").asText())
                .lastName(c.path("lastName").asText())
                .preferredName(textOrNull(c, "preferredName"))
                .dateOfBirth(textOrNull(c, "birthDate"))
                .gender(textOrNull(c, "gender"))
                .diagnosisCodes(codes)
                .diagnosisDescriptions(descs)
                .primaryInsurance(textOrNull(c, "insuranceName"))
                .memberId(textOrNull(c, "memberId"))
                .syncedAt(Instant.now().toString())
                .build();
    }

    private String textOrNull(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return (v.isMissingNode() || v.isNull() || v.asText().isBlank()) ? null : v.asText();
    }
}
