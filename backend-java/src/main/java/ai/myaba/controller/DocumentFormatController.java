package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.service.DocumentFormatService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
            log.error("extractTemplate failed: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", "Could not read the Word document: " + e.getMessage()));
        }
    }
}
