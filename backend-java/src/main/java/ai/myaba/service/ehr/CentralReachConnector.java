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
 * EHR connector for CentralReach.
 *
 * <p>CentralReach is the most widely used ABA practice management platform in Virginia.
 *
 * <h3>Authentication</h3>
 * <p>Uses a per-org API token generated in CentralReach:
 * <em>Settings → Integrations → API Access → Generate Token</em>.
 * Pass the token as {@code credentials.get("apiToken")}.
 *
 * <h3>Required credential keys</h3>
 * <ul>
 *   <li>{@code apiToken} — CentralReach API token</li>
 *   <li>{@code subdomain} — org's CentralReach subdomain (e.g. {@code myagency})</li>
 * </ul>
 *
 * <h3>API reference</h3>
 * <p>CentralReach developer docs: https://developers.centralreach.com
 * Base URL pattern: {@code https://{subdomain}.centralreach.com/api/v2/}
 *
 * <p><strong>NOTE:</strong> Exact endpoints below are based on the CentralReach
 * public API specification.  Verify against your org's sandbox credentials
 * before going to production.
 */
@Component
@Slf4j
public class CentralReachConnector implements EhrConnector {

    @Value("${ehr.centralreach.base-url:https://{subdomain}.centralreach.com/api/v2}")
    private String baseUrlTemplate;

    private final ObjectMapper mapper = new ObjectMapper();

    // ── EhrConnector ──────────────────────────────────────────────────────────

    @Override
    public String getEhrType() { return "centralreach"; }

    @Override
    public String getDisplayName() { return "CentralReach"; }

    @Override
    public void testConnection(Map<String, String> credentials) throws Exception {
        String url = buildUrl(credentials, "/members?limit=1");
        HttpURLConnection conn = openGet(url, credentials.get("apiToken"));
        int status = conn.getResponseCode();
        if (status != 200) {
            String body = readBody(conn, false);
            throw new Exception("CentralReach returned HTTP " + status + ": " + body);
        }
    }

    @Override
    public List<EhrClientRecord> searchClients(Map<String, String> credentials,
                                                String query) throws Exception {
        String encoded = URLEncoder.encode(query, StandardCharsets.UTF_8);
        String url = buildUrl(credentials, "/members?search=" + encoded + "&limit=20&status=active");

        HttpURLConnection conn = openGet(url, credentials.get("apiToken"));
        int status = conn.getResponseCode();
        if (status != 200) {
            String body = readBody(conn, false);
            throw new Exception("CentralReach search failed HTTP " + status + ": " + body);
        }

        JsonNode root = mapper.readTree(readBody(conn, true));
        List<EhrClientRecord> results = new ArrayList<>();

        // CentralReach returns { data: [ { id, first_name, last_name, ... } ] }
        JsonNode data = root.path("data");
        if (data.isArray()) {
            for (JsonNode member : data) {
                results.add(parseMember(member));
            }
        }
        return results;
    }

    @Override
    public EhrClientRecord getClient(Map<String, String> credentials,
                                      String ehrClientId) throws Exception {
        String url = buildUrl(credentials, "/members/" + ehrClientId);

        HttpURLConnection conn = openGet(url, credentials.get("apiToken"));
        int status = conn.getResponseCode();
        if (status != 200) {
            String body = readBody(conn, false);
            throw new Exception("CentralReach member fetch failed HTTP " + status + ": " + body);
        }

        JsonNode root = mapper.readTree(readBody(conn, true));
        return parseMember(root.path("data"));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String buildUrl(Map<String, String> credentials, String path) {
        String subdomain = credentials.getOrDefault("subdomain", "app");
        String base = baseUrlTemplate.replace("{subdomain}", subdomain);
        return base + path;
    }

    private HttpURLConnection openGet(String urlStr, String apiToken) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(10_000);
        conn.setReadTimeout(15_000);
        conn.setRequestProperty("Authorization", "Bearer " + apiToken);
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("Content-Type", "application/json");
        return conn;
    }

    private String readBody(HttpURLConnection conn, boolean success) throws Exception {
        InputStream is = success ? conn.getInputStream() : conn.getErrorStream();
        if (is == null) return "";
        return new String(is.readAllBytes(), StandardCharsets.UTF_8);
    }

    /**
     * Maps a CentralReach member JSON node to a normalised {@link EhrClientRecord}.
     *
     * <p>CentralReach field names (from their v2 API):
     * id, first_name, last_name, preferred_name, date_of_birth, gender,
     * diagnoses (array of { icd_code, description }),
     * insurance_provider, member_id
     */
    private EhrClientRecord parseMember(JsonNode m) {
        List<String> codes = new ArrayList<>();
        List<String> descs = new ArrayList<>();
        JsonNode diags = m.path("diagnoses");
        if (diags.isArray()) {
            for (JsonNode d : diags) {
                codes.add(d.path("icd_code").asText(""));
                descs.add(d.path("description").asText(""));
            }
        }

        return EhrClientRecord.builder()
                .ehrId(m.path("id").asText())
                .ehrType("centralreach")
                .firstName(m.path("first_name").asText())
                .lastName(m.path("last_name").asText())
                .preferredName(textOrNull(m, "preferred_name"))
                .dateOfBirth(textOrNull(m, "date_of_birth"))
                .gender(textOrNull(m, "gender"))
                .diagnosisCodes(codes)
                .diagnosisDescriptions(descs)
                .primaryInsurance(textOrNull(m, "insurance_provider"))
                .memberId(textOrNull(m, "member_id"))
                .syncedAt(Instant.now().toString())
                .build();
    }

    private String textOrNull(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return (v.isMissingNode() || v.isNull() || v.asText().isBlank()) ? null : v.asText();
    }
}
