package ai.myaba.service;

import ai.myaba.model.dto.ClientRequest;
import ai.myaba.model.dto.OfficePuzzleImportResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.*;

/**
 * Parses an OfficePuzzle / BehaviorSoft client-roster Excel export and
 * creates a myABA client record for each row.
 *
 * <h3>Supported export formats</h3>
 * <ul>
 *   <li>.xlsx (Excel 2007+)</li>
 *   <li>.xls  (Excel 97-2003)</li>
 *   <li>.csv  (UTF-8 with or without BOM)</li>
 * </ul>
 *
 * <h3>Column detection</h3>
 * Column names are normalized (lower-cased, trimmed) and matched against
 * a table of aliases. This makes the parser resilient to minor export
 * format variations between OfficePuzzle versions.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class OfficePuzzleImportService {

    private final ClientService clientService;

    // ── Column alias table ────────────────────────────────────────────────────

    // Maps a canonical field name → list of header aliases (all lower-case).
    private static final Map<String, List<String>> COLUMN_ALIASES;

    static {
        Map<String, List<String>> m = new LinkedHashMap<>();
        // Combined name (may need to be split)
        m.put("fullName",   List.of("name", "client name", "student name", "patient name",
                                    "client", "student", "full name"));
        // Split name columns
        m.put("firstName",  List.of("first name", "first", "given name", "firstname",
                                    "client first name", "student first name", "f name"));
        m.put("lastName",   List.of("last name", "last", "surname", "family name", "lastname",
                                    "client last name", "student last name", "l name"));
        m.put("dateOfBirth",List.of("date of birth", "dob", "birth date", "birthday",
                                    "birth_date", "date of birth (mm/dd/yyyy)", "dob (mm/dd/yyyy)"));
        m.put("gender",     List.of("gender", "sex", "biological sex"));
        m.put("diagnosis",  List.of("diagnosis", "primary diagnosis", "dx", "diagnosis code",
                                    "icd code", "icd-10", "dx code", "primary dx"));
        m.put("insurance",  List.of("insurance", "insurance provider", "primary insurance",
                                    "payer", "payer name", "insurance name", "insurer",
                                    "insurance company", "funding source"));
        m.put("caseId",     List.of("case id", "case #", "case number", "client id",
                                    "student id", "patient id", "id", "member id",
                                    "record number", "record #", "op id", "officepuzzle id"));
        COLUMN_ALIASES = Collections.unmodifiableMap(m);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Parse the uploaded file and create clients for the calling org.
     *
     * @param orgId       Org that will own the imported clients
     * @param createdByUid UID of the admin who initiated the import
     * @param file        Uploaded file (.xlsx / .xls / .csv)
     */
    public OfficePuzzleImportResult importFile(String orgId, String createdByUid, MultipartFile file)
            throws IOException {

        String filename = Optional.ofNullable(file.getOriginalFilename()).orElse("").toLowerCase();

        List<String[]> rows;
        if (filename.endsWith(".csv")) {
            rows = parseCsv(file.getInputStream());
        } else if (filename.endsWith(".xlsx")) {
            rows = parseExcel(file.getInputStream(), false);
        } else if (filename.endsWith(".xls")) {
            rows = parseExcel(file.getInputStream(), true);
        } else {
            throw new IllegalArgumentException(
                    "Unsupported file type. Please upload a .xlsx, .xls, or .csv file.");
        }

        return processRows(rows, orgId, createdByUid);
    }

    // ── Parsing helpers ───────────────────────────────────────────────────────

    private List<String[]> parseCsv(InputStream is) throws IOException {
        List<String[]> rows = new ArrayList<>();
        // Strip UTF-8 BOM if present
        byte[] bom = is.readNBytes(3);
        if (bom.length == 3 && bom[0] == (byte) 0xEF && bom[1] == (byte) 0xBB && bom[2] == (byte) 0xBF) {
            // BOM consumed — continue
        } else {
            // Not a BOM — prepend bytes back via sequenced stream
            is = new java.io.SequenceInputStream(new java.io.ByteArrayInputStream(bom), is);
        }
        try (java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(is, "UTF-8"))) {
            String line;
            while ((line = reader.readLine()) != null) {
                rows.add(splitCsvLine(line));
            }
        }
        return rows;
    }

    /** Very simple RFC-4180 CSV split — handles quoted fields with embedded commas. */
    private String[] splitCsvLine(String line) {
        List<String> fields = new ArrayList<>();
        StringBuilder sb = new StringBuilder();
        boolean inQuote = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                if (inQuote && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    sb.append('"'); i++; // escaped quote
                } else {
                    inQuote = !inQuote;
                }
            } else if (c == ',' && !inQuote) {
                fields.add(sb.toString().trim());
                sb.setLength(0);
            } else {
                sb.append(c);
            }
        }
        fields.add(sb.toString().trim());
        return fields.toArray(new String[0]);
    }

    private List<String[]> parseExcel(InputStream is, boolean isLegacy) throws IOException {
        List<String[]> rows = new ArrayList<>();
        try (Workbook wb = isLegacy ? new HSSFWorkbook(is) : new XSSFWorkbook(is)) {
            Sheet sheet = wb.getSheetAt(0);
            // Detect usable column count from header row
            Row headerRow = sheet.getRow(sheet.getFirstRowNum());
            int colCount = headerRow == null ? 0 : headerRow.getLastCellNum();

            for (Row row : sheet) {
                if (row == null) continue;
                String[] cells = new String[colCount];
                for (int c = 0; c < colCount; c++) {
                    Cell cell = row.getCell(c, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                    cells[c] = cell == null ? "" : cellToString(cell);
                }
                rows.add(cells);
            }
        }
        return rows;
    }

    private String cellToString(Cell cell) {
        return switch (cell.getCellType()) {
            case STRING  -> cell.getStringCellValue().trim();
            case NUMERIC -> DateUtil.isCellDateFormatted(cell)
                    ? new java.text.SimpleDateFormat("MM/dd/yyyy")
                          .format(cell.getDateCellValue())
                    : formatNumeric(cell.getNumericCellValue());
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> {
                // Evaluate formula result
                try {
                    yield String.valueOf(cell.getNumericCellValue());
                } catch (Exception e) {
                    yield cell.getStringCellValue().trim();
                }
            }
            default -> "";
        };
    }

    private String formatNumeric(double d) {
        // Avoid "2025.0" for whole numbers
        if (d == Math.floor(d) && !Double.isInfinite(d)) {
            return String.valueOf((long) d);
        }
        return String.valueOf(d);
    }

    // ── Row processing ────────────────────────────────────────────────────────

    private OfficePuzzleImportResult processRows(List<String[]> rows, String orgId, String createdByUid) {
        List<String> errors      = new ArrayList<>();
        List<String> importedNames = new ArrayList<>();
        int imported = 0;
        int skipped  = 0;

        if (rows.isEmpty()) {
            return OfficePuzzleImportResult.builder()
                    .imported(0).skipped(0).errorCount(0)
                    .errors(errors).importedNames(importedNames)
                    .message("File was empty.")
                    .build();
        }

        // First row = headers
        String[] headers = rows.get(0);
        Map<String, Integer> colIndex = buildColumnIndex(headers);

        if (!colIndex.containsKey("firstName") && !colIndex.containsKey("fullName")) {
            throw new IllegalArgumentException(
                    "Could not detect a name column. Expected columns like " +
                    "\"First Name\", \"Last Name\", \"Name\", or \"Client Name\".");
        }

        for (int rowNum = 1; rowNum < rows.size(); rowNum++) {
            String[] cells = rows.get(rowNum);
            // Skip completely blank rows
            if (isBlankRow(cells)) { skipped++; continue; }

            try {
                ClientRequest req = buildRequest(cells, colIndex);
                // Bulk import never auto-assigns the importer as treating BCBA —
                // assignments happen afterwards per client (creatorIsAdmin=true).
                String clientId = clientService.createClient(orgId, createdByUid, true, req);
                importedNames.add(req.getFirstName() + " " + req.getLastName());
                imported++;
                log.debug("OfficePuzzle import: created client {} (row {})", clientId, rowNum + 1);
            } catch (Exception e) {
                String msg = "Row " + (rowNum + 1) + ": " + e.getMessage();
                errors.add(msg);
                log.warn("OfficePuzzle import error — {}", msg);
            }
        }

        String summary = imported + " client" + (imported == 1 ? "" : "s") + " imported";
        if (skipped  > 0) summary += ", " + skipped  + " skipped";
        if (!errors.isEmpty()) summary += ", " + errors.size() + " error" + (errors.size() == 1 ? "" : "s");
        summary += ".";

        return OfficePuzzleImportResult.builder()
                .imported(imported)
                .skipped(skipped)
                .errorCount(errors.size())
                .errors(errors)
                .importedNames(importedNames)
                .message(summary)
                .build();
    }

    /**
     * Build a field → column-index map from the header row, using the alias table.
     */
    private Map<String, Integer> buildColumnIndex(String[] headers) {
        Map<String, Integer> index = new HashMap<>();
        for (int c = 0; c < headers.length; c++) {
            String normalized = headers[c].toLowerCase().trim();
            if (normalized.isEmpty()) continue;
            for (Map.Entry<String, List<String>> entry : COLUMN_ALIASES.entrySet()) {
                if (entry.getValue().contains(normalized) && !index.containsKey(entry.getKey())) {
                    index.put(entry.getKey(), c);
                }
            }
        }
        return index;
    }

    private ClientRequest buildRequest(String[] cells, Map<String, Integer> colIndex) {
        ClientRequest req = new ClientRequest();

        // ── Name ──────────────────────────────────────────────────────────────
        if (colIndex.containsKey("firstName")) {
            req.setFirstName(get(cells, colIndex, "firstName"));
            req.setLastName(get(cells, colIndex, "lastName"));
        } else {
            // fullName column — split on first space or "Last, First" format
            String full = get(cells, colIndex, "fullName");
            String[] parts = splitName(full);
            req.setFirstName(parts[0]);
            req.setLastName(parts[1]);
        }

        // Validation
        if (req.getFirstName() == null || req.getFirstName().isBlank())
            throw new IllegalArgumentException("Missing first name");
        if (req.getLastName()  == null || req.getLastName().isBlank())
            throw new IllegalArgumentException("Missing last name");

        // ── Other fields ──────────────────────────────────────────────────────
        req.setDateOfBirth(normalizeDate(get(cells, colIndex, "dateOfBirth")));
        req.setGender(normalizeGender(get(cells, colIndex, "gender")));
        req.setDiagnosis(get(cells, colIndex, "diagnosis"));
        req.setPrimaryInsurance(get(cells, colIndex, "insurance"));

        // EHR case ID — OfficePuzzle's own client ID stored as external reference
        String caseId = get(cells, colIndex, "caseId");
        if (caseId != null && !caseId.isBlank()) {
            req.setEhrProvider("officepuzzle");
            req.setEhrCaseId(caseId);
        }

        return req;
    }

    // ── Field utilities ───────────────────────────────────────────────────────

    private String get(String[] cells, Map<String, Integer> colIndex, String field) {
        Integer idx = colIndex.get(field);
        if (idx == null || idx >= cells.length) return null;
        String val = cells[idx];
        return (val == null || val.isBlank()) ? null : val.trim();
    }

    private boolean isBlankRow(String[] cells) {
        for (String c : cells) {
            if (c != null && !c.isBlank()) return false;
        }
        return true;
    }

    /**
     * Splits a combined name string into [firstName, lastName].
     * Handles:
     *   "John Smith"       → ["John", "Smith"]
     *   "Smith, John"      → ["John", "Smith"]
     *   "Smith, John A."   → ["John A.", "Smith"]
     *   "Smith"            → ["Smith", ""]
     */
    private String[] splitName(String full) {
        if (full == null || full.isBlank()) return new String[]{"", ""};
        full = full.trim();
        if (full.contains(",")) {
            // "Last, First" format
            int comma = full.indexOf(',');
            String last  = full.substring(0, comma).trim();
            String first = full.substring(comma + 1).trim();
            return new String[]{first, last};
        }
        int space = full.lastIndexOf(' ');
        if (space < 0) return new String[]{full, ""};
        return new String[]{full.substring(0, space).trim(), full.substring(space + 1).trim()};
    }

    /**
     * Normalizes date strings to MM/dd/yyyy.
     * Accepts: "01/15/2018", "2018-01-15", "January 15, 2018", numeric Excel serial.
     */
    private String normalizeDate(String raw) {
        if (raw == null || raw.isBlank()) return null;
        // Already MM/dd/yyyy
        if (raw.matches("\\d{1,2}/\\d{1,2}/\\d{4}")) return raw;
        // ISO format yyyy-MM-dd
        if (raw.matches("\\d{4}-\\d{2}-\\d{2}")) {
            String[] p = raw.split("-");
            return p[1] + "/" + p[2] + "/" + p[0];
        }
        // Pass through — backend stores as provided
        return raw;
    }

    private String normalizeGender(String raw) {
        if (raw == null || raw.isBlank()) return null;
        return switch (raw.trim().toLowerCase()) {
            case "m", "male"   -> "Male";
            case "f", "female" -> "Female";
            default            -> raw.trim();
        };
    }
}
