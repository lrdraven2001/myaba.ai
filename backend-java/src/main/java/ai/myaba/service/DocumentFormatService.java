package ai.myaba.service;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.ParagraphAlignment;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Converts generated document text to/from Office formats using Apache POI.
 * Used for Word (.docx) export of generated documents and for reading Word
 * templates uploaded into the Agency Library.
 */
@Service
public class DocumentFormatService {

    /**
     * Render a plain-text document into a .docx. Heuristics:
     *   - A blank line starts a new paragraph.
     *   - An ALL-CAPS line (or one ending with ':') is treated as a heading (bold).
     *   - The title is added as a centered, larger heading at the top.
     */
    public byte[] toDocx(String title, String content) throws Exception {
        try (XWPFDocument doc = new XWPFDocument();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {

            if (title != null && !title.isBlank()) {
                XWPFParagraph h = doc.createParagraph();
                h.setAlignment(ParagraphAlignment.CENTER);
                XWPFRun r = h.createRun();
                r.setBold(true);
                r.setFontSize(16);
                r.setText(title.trim());
                h.createRun().addBreak();
            }

            String[] lines = (content == null ? "" : content).split("\r?\n", -1);
            for (String line : lines) {
                XWPFParagraph p = doc.createParagraph();
                XWPFRun run = p.createRun();
                String trimmed = line.trim();
                boolean heading = !trimmed.isEmpty()
                        && (trimmed.equals(trimmed.toUpperCase()) && trimmed.matches(".*[A-Z].*")
                            || trimmed.endsWith(":"));
                run.setBold(heading);
                run.setText(line);
            }

            doc.write(out);
            return out.toByteArray();
        }
    }

    /**
     * Render text into an .xlsx. If the content contains a Markdown table (pipe-delimited
     * rows), it becomes a real grid with a bold header row; otherwise each non-empty line
     * goes into a single column. Auto-sizes columns.
     */
    public byte[] toXlsx(String title, String content) throws Exception {
        try (Workbook wb = new XSSFWorkbook();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {

            String sheetName = (title == null || title.isBlank()) ? "Sheet1" : title.trim();
            sheetName = sheetName.replaceAll("[\\\\/?*\\[\\]:]", " ");
            if (sheetName.length() > 31) sheetName = sheetName.substring(0, 31);
            Sheet sheet = wb.createSheet(sheetName);

            CellStyle headerStyle = wb.createCellStyle();
            Font bold = wb.createFont();
            bold.setBold(true);
            headerStyle.setFont(bold);

            List<String[]> table = parseMarkdownTable(content == null ? "" : content);
            int maxCols = 1;
            if (!table.isEmpty()) {
                for (int r = 0; r < table.size(); r++) {
                    String[] cells = table.get(r);
                    maxCols = Math.max(maxCols, cells.length);
                    Row row = sheet.createRow(r);
                    for (int c = 0; c < cells.length; c++) {
                        Cell cell = row.createCell(c);
                        cell.setCellValue(cells[c]);
                        if (r == 0) cell.setCellStyle(headerStyle);
                    }
                }
            } else {
                int r = 0;
                for (String line : (content == null ? "" : content).split("\r?\n")) {
                    if (line.isBlank()) continue;
                    sheet.createRow(r++).createCell(0).setCellValue(line.trim());
                }
            }
            for (int c = 0; c < maxCols; c++) sheet.autoSizeColumn(c);

            wb.write(out);
            return out.toByteArray();
        }
    }

    /** Parse Markdown pipe tables into rows of cells (skips the |---|---| separator line). */
    private List<String[]> parseMarkdownTable(String content) {
        List<String[]> rows = new ArrayList<>();
        for (String raw : content.split("\r?\n")) {
            String line = raw.trim();
            if (!line.contains("|")) continue;
            // Separator row, e.g. | --- | :---: | — skip it.
            if (line.replaceAll("[\\s|:\\-]", "").isEmpty()) continue;
            // Strip optional leading/trailing pipes, then split.
            String inner = line.replaceAll("^\\|", "").replaceAll("\\|$", "");
            String[] cells = inner.split("\\|", -1);
            for (int i = 0; i < cells.length; i++) cells[i] = cells[i].trim();
            rows.add(cells);
        }
        return rows;
    }

    /** Extract the plain text from an uploaded .docx so it can be stored as a template body. */
    public String extractDocxText(InputStream in) throws Exception {
        try (XWPFDocument doc = new XWPFDocument(in);
             XWPFWordExtractor ex = new XWPFWordExtractor(doc)) {
            return ex.getText();
        }
    }

    /** Convenience for byte[] input. */
    public String extractDocxText(byte[] bytes) throws Exception {
        try (ByteArrayInputStream in = new ByteArrayInputStream(bytes)) {
            return extractDocxText(in);
        }
    }

    /**
     * Extract plain text from an uploaded document (chat attachments, knowledge
     * docs, templates, client uploads). Supports .docx (POI), .pdf (PDFBox),
     * .xlsx/.xls (POI), and plain text (.txt/.md/.csv).
     *
     * <p>No DLP de-identification is applied — clinical staff need the actual client
     * data they upload to operate on it. PHI governance happens at output time via
     * ACLX, scoped to the authenticated user's role/purpose.
     */
    public String extractText(String filename, byte[] bytes) throws Exception {
        String lower = filename == null ? "" : filename.toLowerCase();
        if (lower.endsWith(".docx")) {
            return extractDocxText(bytes);
        }
        if (lower.endsWith(".pdf")) {
            try (org.apache.pdfbox.pdmodel.PDDocument doc =
                         org.apache.pdfbox.pdmodel.PDDocument.load(bytes)) {
                if (doc.isEncrypted()) {
                    throw new IllegalArgumentException(
                            "This PDF is password-protected — remove the password and re-upload.");
                }
                return new org.apache.pdfbox.text.PDFTextStripper().getText(doc);
            }
        }
        if (lower.endsWith(".xlsx")) {
            try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
                return extractSheetText(wb);
            }
        }
        if (lower.endsWith(".xls")) {
            try (Workbook wb = new org.apache.poi.hssf.usermodel.HSSFWorkbook(new ByteArrayInputStream(bytes))) {
                return extractSheetText(wb);
            }
        }
        // .txt, .md, .csv, .text, or unknown — read as UTF-8 text.
        return new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
    }

    /** Sheets become "── SheetName ──" sections with tab-separated rows. */
    private String extractSheetText(Workbook wb) {
        org.apache.poi.ss.usermodel.DataFormatter fmt = new org.apache.poi.ss.usermodel.DataFormatter();
        StringBuilder out = new StringBuilder();
        for (int s = 0; s < wb.getNumberOfSheets(); s++) {
            Sheet sheet = wb.getSheetAt(s);
            if (wb.getNumberOfSheets() > 1) {
                out.append("── ").append(sheet.getSheetName()).append(" ──\n");
            }
            for (Row row : sheet) {
                StringBuilder line = new StringBuilder();
                for (Cell cell : row) {
                    if (line.length() > 0) line.append('\t');
                    line.append(fmt.formatCellValue(cell));
                }
                if (!line.toString().trim().isEmpty()) out.append(line).append('\n');
            }
            out.append('\n');
        }
        return out.toString().trim();
    }
}
