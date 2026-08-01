package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.service.DocumentFormatService;
import ai.myaba.service.ExtractionJobService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

/**
 * Office-format helpers for document generation:
 *   - POST /api/documents/export/docx     — render generated text as a Word (.docx) download
 *   - POST /api/documents/template/extract — read an uploaded Word template into plain text
 */
@RestController
@RequestMapping("/api/documents")
@RequiredArgsConstructor
@Slf4j
public class DocumentFormatController {

    private final DocumentFormatService documentFormatService;
    private final ExtractionJobService extractionJobService;

    /** Render { title, content } to a downloadable .docx. */
    @PostMapping("/export/docx")
    public ResponseEntity<?> exportDocx(
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AppUser user) {
        String title   = body.getOrDefault("title", "Document");
        String content = body.getOrDefault("content", "");
        try {
            byte[] docx = documentFormatService.toDocx(title, content);
            String safe = title.replaceAll("[^a-zA-Z0-9-_ ]", "").trim();
            if (safe.isEmpty()) safe = "document";
            return ResponseEntity.ok()
                    .header("Content-Disposition", "attachment; filename=\"" + safe + ".docx\"")
                    .header("Content-Type",
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                    .body(docx);
        } catch (Exception e) {
            log.error("exportDocx failed: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to generate Word document"));
        }
    }

    /** Render { title, content } to a downloadable .xlsx (Markdown tables become a grid). */
    @PostMapping("/export/xlsx")
    public ResponseEntity<?> exportXlsx(
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal AppUser user) {
        String title   = body.getOrDefault("title", "Spreadsheet");
        String content = body.getOrDefault("content", "");
        try {
            byte[] xlsx = documentFormatService.toXlsx(title, content);
            String safe = title.replaceAll("[^a-zA-Z0-9-_ ]", "").trim();
            if (safe.isEmpty()) safe = "spreadsheet";
            return ResponseEntity.ok()
                    .header("Content-Disposition", "attachment; filename=\"" + safe + ".xlsx\"")
                    .header("Content-Type",
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                    .body(xlsx);
        } catch (Exception e) {
            log.error("exportXlsx failed: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to generate Excel document"));
        }
    }

    /** Extract plain text from an uploaded Word (.docx) template. */
    @PostMapping("/template/extract")
    public ResponseEntity<?> extractTemplate(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal AppUser user) {
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        if (!name.endsWith(".docx")) {
            return ResponseEntity.badRequest().body(Map.of("error", "Please upload a .docx Word document."));
        }
        try {
            String text = documentFormatService.extractDocxText(file.getBytes());
            return ResponseEntity.ok(Map.of("text", text));
        } catch (Exception e) {
            log.error("extractTemplate failed: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of("error", "Could not read the Word document. Please ensure it is a valid, uncorrupted .docx file."));
        }
    }

    /**
     * Extract plain text from an uploaded chat attachment (.docx, .pdf, .txt/.md/.csv)
     * so it can be added to chat context. No DLP de-identification — clinical staff
     * need the actual data they upload; PHI is governed at output time by ACLX.
     * Max 20 MB.
     */
    @PostMapping("/attachment/extract")
    public ResponseEntity<?> extractAttachment(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal AppUser user) {
        String name = file.getOriginalFilename() == null ? "file" : file.getOriginalFilename();
        String lower = name.toLowerCase();
        if (!(lower.endsWith(".docx") || lower.endsWith(".pdf") || lower.endsWith(".txt")
                || lower.endsWith(".md") || lower.endsWith(".csv") || lower.endsWith(".text")
                || lower.endsWith(".xlsx") || lower.endsWith(".xls")
                || lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")
                || lower.endsWith(".webp") || lower.endsWith(".gif") || lower.endsWith(".bmp"))) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Unsupported file type. Upload a Word (.docx), PDF, Excel (.xlsx/.xls), "
                            + "image (PNG/JPG/screenshot), or text file."));
        }
        if (file.getSize() > 20L * 1024 * 1024) {
            return ResponseEntity.badRequest().body(Map.of("error", "File exceeds the 20 MB limit."));
        }
        try {
            String text = documentFormatService.extractText(name, file.getBytes());
            if (text == null) text = "";
            return ResponseEntity.ok(Map.of("name", name, "text", text, "chars", text.length()));
        } catch (Exception e) {
            log.error("extractAttachment failed for {}: {}", name, e.getMessage(), e);
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Could not read the file. Please ensure it is a valid, uncorrupted file of a supported type."));
        }
    }

    /**
     * Asynchronous variant of {@link #extractAttachment}: create a PROCESSING job,
     * kick off extraction in the background, and return the {@code jobId} immediately.
     * Heavy documents (scanned OCR, many figures, large files) no longer time the
     * upload out at the gateway. Poll {@link #extractionStatus} until READY/FAILED.
     */
    @PostMapping("/attachment/extract-async")
    public ResponseEntity<?> extractAttachmentAsync(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal AppUser user) {
        String name = file.getOriginalFilename() == null ? "file" : file.getOriginalFilename();
        if (!isSupportedAttachment(name.toLowerCase())) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Unsupported file type. Upload a Word (.docx), PDF, Excel (.xlsx/.xls), "
                            + "image (PNG/JPG/screenshot), or text file."));
        }
        if (file.getSize() > 20L * 1024 * 1024) {
            return ResponseEntity.badRequest().body(Map.of("error", "File exceeds the 20 MB limit."));
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Could not read the uploaded file."));
        }
        String jobId = extractionJobService.createJob(user.getOrgId(), name);
        // Cross-bean call → the @Async proxy applies; returns immediately.
        extractionJobService.runExtraction(user.getOrgId(), jobId, name, bytes);
        return ResponseEntity.accepted()
                .body(Map.of("jobId", jobId, "status", "PROCESSING", "name", name));
    }

    /** Poll an extraction job: { status: PROCESSING|READY|FAILED, name, text?, chars?, error? }. */
    @GetMapping("/extraction/{jobId}")
    public ResponseEntity<?> extractionStatus(
            @PathVariable String jobId,
            @AuthenticationPrincipal AppUser user) {
        Map<String, Object> job = extractionJobService.get(user.getOrgId(), jobId);
        if (job == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Extraction job not found"));
        }
        return ResponseEntity.ok(job);
    }

    private boolean isSupportedAttachment(String lower) {
        return lower.endsWith(".docx") || lower.endsWith(".pdf") || lower.endsWith(".txt")
                || lower.endsWith(".md") || lower.endsWith(".csv") || lower.endsWith(".text")
                || lower.endsWith(".xlsx") || lower.endsWith(".xls")
                || lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")
                || lower.endsWith(".webp") || lower.endsWith(".gif") || lower.endsWith(".bmp");
    }
}
