package ai.myaba.service;

import ai.myaba.model.dto.AclxRequest;
import ai.myaba.model.dto.AclxResponse;
import ai.myaba.model.dto.AppUser;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@Slf4j
public class AclxService {

    private final ObjectMapper mapper;
    private final String gatewayUrl;
    private final boolean enabled;

    public AclxService(
            ObjectMapper mapper,
            @Value("${aclx.gateway-url:http://localhost:8081}") String gatewayUrl,
            @Value("${aclx.enabled:true}") boolean enabled) {
        this.mapper = mapper;
        this.gatewayUrl = gatewayUrl;
        this.enabled = enabled;
    }

    public AclxResponse evaluate(String aiResponse, AppUser user, String clientId) {
        if (!enabled) {
            log.debug("ACLX disabled — pass-through ALLOW");
            return buildPassThrough(aiResponse);
        }

        AclxRequest request = AclxRequest.builder()
                .domain("hipaa")
                .identity(AclxRequest.Identity.builder()
                        .subject(user.getUid())
                        .actorType("human")
                        .role(user.getRole())
                        .purpose(user.getPurpose())
                        .organization(user.getOrgId())
                        .scopes(List.of())
                        .allowedDistributions(List.of())
                        .build())
                .aiResponse(AclxRequest.AiResponse.builder()
                        .text(aiResponse)
                        .sources(List.of())
                        .build())
                .requestContext(AclxRequest.RequestContext.builder()
                        .timestamp(Instant.now().toString())
                        .clientId(clientId)
                        .build())
                .build();

        try {
            byte[] payload = mapper.writeValueAsBytes(request);

            HttpURLConnection conn = (HttpURLConnection) new URL(gatewayUrl + "/evaluate").openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(5_000);
            conn.setReadTimeout(5_000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");

            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload);
            }

            int status = conn.getResponseCode();
            if (status != 200) {
                log.error("ACLX Gateway error {}", status);
                return buildBlocked("ACLX Gateway returned " + status);
            }

            String body = new String(conn.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            return mapper.readValue(body, AclxResponse.class);

        } catch (Exception e) {
            log.error("ACLX Gateway unreachable: {}", e.getMessage());
            return buildBlocked("ACLX Gateway unavailable — response blocked for safety");
        }
    }

    private AclxResponse buildPassThrough(String text) {
        AclxResponse r = new AclxResponse();
        r.setContentId("dev-" + UUID.randomUUID());
        AclxResponse.Decision d = new AclxResponse.Decision();
        d.setDecision("ALLOW");
        d.setFinalText(text);
        r.setDecision(d);
        AclxResponse.AclxLabel label = new AclxResponse.AclxLabel();
        label.setDomain("HIPAA");
        label.setCategory("PHI");
        label.setSubcategory("NONE");
        label.setSensitivity("LOW");
        r.setAclx(label);
        return r;
    }

    private AclxResponse buildBlocked(String reason) {
        AclxResponse r = new AclxResponse();
        r.setContentId("blocked-" + UUID.randomUUID());
        AclxResponse.Decision d = new AclxResponse.Decision();
        d.setDecision("BLOCK");
        d.setFinalText(null);
        d.setReason(reason);
        r.setDecision(d);
        return r;
    }
}
