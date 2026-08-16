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
import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.multipdf.Splitter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
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

    /** Source MIME for layout-preserving translation, or null when unsupported (→ text fallback). */
    public static String docMime(String filename) {
        String n = filename == null ? "" : filename.toLowerCase();
        if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (n.endsWith(".pdf"))  return "application/pdf";
        return null;
    }

    /** "intake.pdf" + es → "intake_es.pdf" (matches the translated output format). */
    public static String outFilename(String sourceName, String lang, String mime) {
        String base = sourceName == null ? "document" : sourceName.replaceAll("\\.[^.]+$", "");
        String ext  = (mime != null && mime.contains("pdf")) ? "pdf" : "docx";
        return base + "_" + lang + "." + ext;
    }

    /** Translated document bytes + the output MIME type (same format as the input). */
    public record TranslatedDoc(byte[] bytes, String mimeType) {}

    private static final String PDF_MIME = "application/pdf";
    /** Online translateDocument caps at 20 PDF pages; stay a little under for safety. */
    private static final int MAX_ONLINE_PDF_PAGES = 18;
    /** Guardrail on how large a PDF we'll chunk-translate (bounds API calls / latency). */
    private static final int MAX_TOTAL_PDF_PAGES  = 300;
    /** translateText caps around 30k code points per request; stay under. */
    private static final int MAX_TEXT_CHARS       = 28_000;

    /**
     * Layout-preserving document translation (docx/pdf → same format). A PDF longer
     * than the online API's 20-page limit is split into page-bounded chunks, each
     * translated with layout intact, then merged back into a single branded PDF — so
     * long clinical documents still come back translated and formatted.
     */
    public TranslatedDoc translateDocument(byte[] content, String mimeType, String targetLang) throws Exception {
        if (PDF_MIME.equals(mimeType)) {
            int pages = pdfPageCount(content);
            if (pages > MAX_TOTAL_PDF_PAGES) {
                throw new IllegalArgumentException("This document is " + pages
                        + " pages; translation supports up to " + MAX_TOTAL_PDF_PAGES + " pages.");
            }
            if (pages > MAX_ONLINE_PDF_PAGES) {
                return new TranslatedDoc(translateLargePdf(content, targetLang), PDF_MIME);
            }
        }
        return translateDocumentOnce(content, mimeType, targetLang);
    }

    /** Single online translateDocument call (≤ the API's document limits). */
    private TranslatedDoc translateDocumentOnce(byte[] content, String mimeType, String targetLang) throws Exception {
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

    /** Best-effort PDF page count; -1 (treated as "small") if the PDF can't be parsed. */
    private static int pdfPageCount(byte[] pdf) {
        try (PDDocument doc = PDDocument.load(pdf)) {
            return doc.getNumberOfPages();
        } catch (Exception e) {
            return -1;
        }
    }

    /** Split a long PDF into ≤{@link #MAX_ONLINE_PDF_PAGES}-page parts, translate each, merge. */
    private byte[] translateLargePdf(byte[] pdf, String targetLang) throws Exception {
        List<byte[]> translatedParts = new ArrayList<>();
        try (PDDocument doc = PDDocument.load(pdf)) {
            Splitter splitter = new Splitter();
            splitter.setSplitAtPage(MAX_ONLINE_PDF_PAGES);
            List<PDDocument> parts = splitter.split(doc);
            try {
                for (PDDocument part : parts) {
                    ByteArrayOutputStream partBytes = new ByteArrayOutputStream();
                    part.save(partBytes);
                    translatedParts.add(translateDocumentOnce(partBytes.toByteArray(), PDF_MIME, targetLang).bytes());
                }
            } finally {
                for (PDDocument part : parts) {
                    try { part.close(); } catch (Exception ignore) { /* best effort */ }
                }
            }
        }
        PDFMergerUtility merger = new PDFMergerUtility();
        ByteArrayOutputStream merged = new ByteArrayOutputStream();
        merger.setDestinationStream(merged);
        for (byte[] part : translatedParts) merger.addSource(new ByteArrayInputStream(part));
        merger.mergeDocuments(MemoryUsageSetting.setupMainMemoryOnly());
        return merged.toByteArray();
    }

    /**
     * Plain-text translation — fallback for documents with no original file. Text
     * beyond the per-request limit is translated in boundary-aligned chunks and
     * re-joined, so long documents don't hit "Text is too long".
     */
    public String translateText(String text, String targetLang) throws Exception {
        if (text == null || text.isEmpty()) return text;
        if (text.length() <= MAX_TEXT_CHARS) return translateTextOnce(text, targetLang);
        StringBuilder result = new StringBuilder(text.length());
        int i = 0;
        while (i < text.length()) {
            int end = Math.min(i + MAX_TEXT_CHARS, text.length());
            if (end < text.length()) {
                int nl = text.lastIndexOf('\n', end);   // prefer a line boundary
                if (nl > i) end = nl + 1;
            }
            result.append(translateTextOnce(text.substring(i, end), targetLang));
            i = end;
        }
        return result.toString();
    }

    /** Single online translateText call (≤ the per-request limit). */
    private String translateTextOnce(String text, String targetLang) throws Exception {
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

    // Cached, thread-safe client. Built lazily so app startup never depends on it.
    //
    // We deliberately use the DEFAULT (global) endpoint — translate.googleapis.com —
    // and carry the region in the request parent (projects/{p}/locations/us-central1).
    // The per-region gRPC host ({region}-translate.googleapis.com) does NOT implement
    // TranslateDocument and returns 404/UNIMPLEMENTED for it; the default endpoint
    // serves both translateText and translateDocument for a regional parent
    // (verified against projects/myapaai/locations/us-central1). Only a genuinely
    // "global" parent could use a region-specific endpoint, and we don't need one.
    private TranslationServiceClient client() throws Exception {
        TranslationServiceClient c = client;
        if (c == null) {
            synchronized (this) {
                c = client;
                if (c == null) {
                    c = TranslationServiceClient.create(TranslationServiceSettings.newBuilder().build());
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
