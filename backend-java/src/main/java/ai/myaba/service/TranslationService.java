package ai.myaba.service;

import com.google.cloud.translate.v3.DocumentInputConfig;
import com.google.cloud.translate.v3.DocumentTranslation;
import com.google.cloud.translate.v3.LocationName;
import com.google.cloud.translate.v3.TranslateDocumentRequest;
import com.google.cloud.translate.v3.TranslateDocumentResponse;
import com.google.cloud.translate.v3.TranslateTextRequest;
import com.google.cloud.translate.v3.TranslateTextResponse;
import com.google.cloud.translate.v3.TranslationServiceClient;
import com.google.cloud.translate.v3.TranslationServiceSettings;
import com.google.protobuf.ByteString;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Document translation via Google Cloud Translation Advanced (v3). The
 * {@code translateDocument} call preserves the original layout — a translated
 * .docx stays a .docx, a .pdf stays a .pdf. A plain-text path is provided as a
 * fallback for legacy documents that have no original file stored.
 *
 * <p>Setup (see deploy notes): the Cloud Translation API must be enabled on the
 * project and the runtime service account needs {@code roles/cloudtranslate.user}.
 * Disabled (returns {@link #isEnabled()} == false) until {@code vertex.project-id}
 * is set.
 */
@Service
@Slf4j
public class TranslationService {

    /** Supported targets: request code → display label. Chinese resolves to Simplified. */
    public static final Map<String, String> LANGUAGES;
    static {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("es",    "Spanish");
        m.put("ar",    "Arabic");
        m.put("fr",    "French");
        m.put("zh-CN", "Chinese (Simplified)");
        m.put("de",    "German");
        LANGUAGES = Map.copyOf(m);
    }

    @Value("${vertex.project-id:}")
    private String projectId;
    @Value("${translate.location:us-central1}")
    private String location;
    @Value("${dev.auth-enabled:false}")
    private boolean devMode;

    private volatile TranslationServiceClient client;

    public boolean isEnabled() {
        return !devMode && projectId != null && !projectId.isBlank();
    }

    /** Normalize a requested code to a supported target ("zh" → "zh-CN"); null if unsupported. */
    public String resolveLanguage(String code) {
        if (code == null) return null;
        String c = code.trim();
        if ("zh".equalsIgnoreCase(c)) c = "zh-CN";
        return LANGUAGES.containsKey(c) ? c : null;
    }

    public String label(String code) {
        return LANGUAGES.getOrDefault(code, code);
    }

    /** Translated document bytes + the output MIME type (same format as the input). */
    public record TranslatedDoc(byte[] bytes, String mimeType) {}

    /** Layout-preserving document translation (docx/pdf → same format). */
    public TranslatedDoc translateDocument(byte[] content, String mimeType, String targetLang) throws Exception {
        TranslateDocumentRequest req = TranslateDocumentRequest.newBuilder()
                .setParent(parent())
                .setTargetLanguageCode(targetLang)
                .setDocumentInputConfig(DocumentInputConfig.newBuilder()
                        .setContent(ByteString.copyFrom(content))
                        .setMimeType(mimeType)
                        .build())
                .build();
        TranslateDocumentResponse resp = client().translateDocument(req);
        DocumentTranslation dt = resp.getDocumentTranslation();
        String outMime = (dt.getMimeType() == null || dt.getMimeType().isBlank()) ? mimeType : dt.getMimeType();
        return new TranslatedDoc(dt.getByteStreamOutputs(0).toByteArray(), outMime);
    }

    /** Plain-text translation — fallback for documents with no original file. */
    public String translateText(String text, String targetLang) throws Exception {
        TranslateTextRequest req = TranslateTextRequest.newBuilder()
                .setParent(parent())
                .setMimeType("text/plain")
                .setTargetLanguageCode(targetLang)
                .addContents(text)
                .build();
        TranslateTextResponse resp = client().translateText(req);
        return resp.getTranslationsCount() > 0 ? resp.getTranslations(0).getTranslatedText() : text;
    }

    private String parent() {
        return LocationName.of(projectId, location).toString();
    }

    // Cached, thread-safe client. Regional locations need a regional endpoint;
    // "global" uses the default. Built lazily so app startup never depends on it.
    private TranslationServiceClient client() throws Exception {
        TranslationServiceClient c = client;
        if (c == null) {
            synchronized (this) {
                c = client;
                if (c == null) {
                    TranslationServiceSettings.Builder b = TranslationServiceSettings.newBuilder();
                    if (!"global".equalsIgnoreCase(location)) {
                        b.setEndpoint(location + "-translate.googleapis.com:443");
                    }
                    c = TranslationServiceClient.create(b.build());
                    client = c;
                }
            }
        }
        return c;
    }

    @PreDestroy
    void close() {
        if (client != null) {
            try { client.close(); } catch (Exception ignored) { /* shutdown */ }
        }
    }
}
