package ai.myaba.controller;

import ai.myaba.model.dto.AppUser;
import ai.myaba.model.dto.OfficePuzzleImportResult;
import ai.myaba.service.OfficePuzzleImportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

/**
 * Handles file-based data imports.
 *
 * <pre>
 *   POST /api/import/officepuzzle   multipart/form-data  file=...
 * </pre>
 *
 * Caller must be an ORG_ADMIN or ORG_SUPER_ADMIN.
 */
@RestController
@RequestMapping("/api/import")
@RequiredArgsConstructor
@Slf4j
public class ImportController {

    private final OfficePuzzleImportService officePuzzleImportService;

    /**
     * Import clients from an OfficePuzzle / BehaviorSoft Excel or CSV export.
     *
     * <p>Accepts {@code .xlsx}, {@code .xls}, and {@code .csv} files.
     * The first row must be a header row; subsequent rows are processed as
     * client records. Rows that are blank are skipped; rows with missing
     * required fields (first name, last name) produce a per-row error but
     * do not abort the entire import.
     */
    @PostMapping("/officepuzzle")
    public ResponseEntity<?> importOfficePuzzle(
            @AuthenticationPrincipal AppUser user,
            @RequestParam("file") MultipartFile file
    ) {
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Not authenticated"));
        }
        if (!user.isAdmin()) {
            return ResponseEntity.status(403).body(Map.of("error", "Admin access required"));
        }
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No file provided"));
        }

        String filename = file.getOriginalFilename();
        log.info("OfficePuzzle import: org={} file={} size={}",
                user.getOrgId(), filename, file.getSize());

        try {
            OfficePuzzleImportResult result =
                    officePuzzleImportService.importFile(user.getOrgId(), user.getUid(), file);
            return ResponseEntity.ok(result);

        } catch (IllegalArgumentException e) {
            log.warn("OfficePuzzle import validation error: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));

        } catch (IOException e) {
            log.error("OfficePuzzle import IO error for org {}: {}", user.getOrgId(), e.getMessage(), e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to read the uploaded file: " + e.getMessage()));
        }
    }

}
