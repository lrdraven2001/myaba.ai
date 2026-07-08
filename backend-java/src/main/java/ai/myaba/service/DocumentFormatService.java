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
import lombok.extern.slf4j.Slf4j;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Converts generated document text to/from Office formats using Apache POI.
 * Used for Word (.docx) export of generated documents and for reading Word
 * templates uploaded into the Agency Library.
 *
 * <p>Scanned PDFs (no extractable text layer) fall back to OCR: pages are
 * rendered to images and transcribed by Gemini vision (Vertex, inside the BAA).
 */
@Service
@Slf4j
public class DocumentFormatService {

    /** Scanned-PDF OCR: page render resolution and caps. */
    private static final int OCR_DPI            = 150;
    private static final int OCR_MAX_PAGES      = 30;
    private static final int OCR_PAGES_PER_CALL = 8;
    /** Below this many non-whitespace chars per page, treat the PDF as scanned. */
    private static final int MIN_TEXT_CHARS_PER_PAGE = 20;

    private final GeminiService geminiService;

    public DocumentFormatService(GeminiService geminiService) {
        this.geminiService = geminiService;
    }

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
        // Image uploads (screenshots, graph/chart images) → vision transcribe+describe.
        String imgMime = imageMimeType(lower);
        if (imgMime != null) {
            return describeImageFile(filename, bytes, imgMime);
        }
        if (lower.endsWith(".pdf")) {
            try (org.apache.pdfbox.pdmodel.PDDocument doc =
                         org.apache.pdfbox.pdmodel.PDDocument.load(bytes)) {
                if (doc.isEncrypted()) {
                    throw new IllegalArgumentException(
                            "This PDF is password-protected — remove the password and re-upload.");
                }
                String text  = new org.apache.pdfbox.text.PDFTextStripper().getText(doc);
                int    pages = doc.getNumberOfPages();
                int    dense = text == null ? 0 : text.replaceAll("\\s", "").length();
                // Scanned PDF (no meaningful text layer) → render pages and OCR them.
                if (pages > 0 && dense / pages < MIN_TEXT_CHARS_PER_PAGE) {
                    String ocr = ocrPdf(doc, filename);
                    if (ocr != null && !ocr.isBlank()) return ocr;
                }
                // Text PDF: the text layer misses embedded charts/graphs (they are
                // images). Render pages that contain figures and describe them, so a
                // clinical data graph isn't silently dropped from the context.
                String figures = describePdfFigures(doc, filename);
                return figures.isBlank() ? text : text + "\n\n" + figures;
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

    // ── Image / figure vision support ────────────────────────────────────────

    /** Gemini-supported image mime for a filename, or null if not an image. */
    private String imageMimeType(String lowerName) {
        if (lowerName.endsWith(".png"))                                  return "image/png";
        if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg"))   return "image/jpeg";
        if (lowerName.endsWith(".webp"))                                 return "image/webp";
        if (lowerName.endsWith(".gif"))                                  return "image/gif";
        if (lowerName.endsWith(".bmp"))                                  return "image/bmp";
        return null;
    }

    /**
     * Describe an uploaded image (screenshot, graph, chart, or photo of a document)
     * via Gemini vision — transcribes text and describes any figures/graphs so the
     * content becomes usable text context.
     */
    private String describeImageFile(String filename, byte[] bytes, String mimeType) {
        String instruction = ("This is an uploaded image named \"%s\" (e.g. a screenshot, "
                + "chart/graph, or photo of a document). Transcribe its text and describe any "
                + "figures or graphs as instructed.").formatted(filename);
        String out = geminiService.describeImages(instruction, List.of(bytes), mimeType);
        return out == null ? "" : out.trim();
    }

    /** Minimum pixel dimensions for an embedded image to count as a candidate figure. */
    private static final int FIGURE_MIN_W = 350;
    private static final int FIGURE_MIN_H = 250;
    /** Cap on figure pages described per document. Generous because extraction is async. */
    private static final int FIGURE_MAX_PAGES = 24;

    /**
     * Describe charts/graphs/figures embedded in an otherwise text-based PDF. Text
     * extraction (PDFTextStripper) cannot see images, so a clinical data graph would
     * be lost.
     *
     * <p>A page is a figure page when it carries a LARGE image (a plausible chart,
     * not a small logo) that is NOT a recurring template element. A letterhead or
     * form banner is the SAME image repeated across pages, so it's identified and
     * ignored; distinct per-page images (graphs) are described. Runs in the async
     * extraction worker, so many figure pages are fine (batched, capped at
     * {@link #FIGURE_MAX_PAGES}). Returns "" when no figures are found.
     */
    private String describePdfFigures(org.apache.pdfbox.pdmodel.PDDocument doc, String filename) {
        try {
            int total = doc.getNumberOfPages();

            // First pass: map each large image's identity → the pages it appears on,
            // so we can recognize recurring template images (letterhead/banner).
            Map<Integer, java.util.Set<Integer>> imageToPages = new HashMap<>();
            List<java.util.Set<Integer>> pageImageIds = new ArrayList<>();
            for (int p = 0; p < total; p++) {
                java.util.Set<Integer> ids = largeImageIds(doc.getPage(p));
                pageImageIds.add(ids);
                for (Integer id : ids) imageToPages.computeIfAbsent(id, k -> new java.util.HashSet<>()).add(p);
            }
            // An image on more than half the pages is a template element, not a figure.
            int templateThreshold = Math.max(3, total / 2);
            java.util.Set<Integer> templateIds = new java.util.HashSet<>();
            imageToPages.forEach((id, pages) -> { if (pages.size() >= templateThreshold) templateIds.add(id); });

            // Figure pages: those with at least one large image that is NOT a template.
            List<Integer> figurePages = new ArrayList<>();
            for (int p = 0; p < total && figurePages.size() < FIGURE_MAX_PAGES; p++) {
                for (Integer id : pageImageIds.get(p)) {
                    if (!templateIds.contains(id)) { figurePages.add(p); break; }
                }
            }
            if (figurePages.isEmpty()) return ""; // common case — no expensive calls

            org.apache.pdfbox.rendering.PDFRenderer renderer =
                    new org.apache.pdfbox.rendering.PDFRenderer(doc);
            StringBuilder out = new StringBuilder();
            for (int i = 0; i < figurePages.size(); i += OCR_PAGES_PER_CALL) {
                List<Integer> batch = figurePages.subList(i, Math.min(i + OCR_PAGES_PER_CALL, figurePages.size()));
                List<byte[]> pngs = new ArrayList<>();
                for (int p : batch) {
                    java.awt.image.BufferedImage img = renderer.renderImageWithDPI(p, OCR_DPI);
                    ByteArrayOutputStream png = new ByteArrayOutputStream();
                    javax.imageio.ImageIO.write(img, "png", png);
                    pngs.add(png.toByteArray());
                }
                String pageList = batch.stream().map(p -> String.valueOf(p + 1))
                        .collect(java.util.stream.Collectors.joining(", "));
                String instruction = ("These are pages %s of \"%s\" that contain figures. For EACH "
                        + "page, describe ONLY its charts, graphs, or figures (ignore body text, which "
                        + "is captured elsewhere). Prefix each page's description with its page number, "
                        + "e.g. \"[Page 3]\".").formatted(pageList, filename);
                String desc = geminiService.describeImages(instruction, pngs, "image/png");
                if (desc != null && !desc.isBlank()) {
                    if (out.length() == 0) out.append("FIGURES:\n");
                    out.append(desc.trim()).append("\n\n");
                }
            }
            return out.toString().trim();
        } catch (Exception e) {
            log.warn("PDF figure description failed for {}: {}", filename, e.getMessage());
            return "";
        }
    }

    /**
     * Identities of the LARGE embedded images on a page (small logos/icons are
     * filtered out by size). Identity is the shared image stream's object identity,
     * so the SAME image reused across pages (letterhead/banner) maps to one id —
     * which lets {@link #describePdfFigures} recognize and ignore template elements.
     */
    private java.util.Set<Integer> largeImageIds(org.apache.pdfbox.pdmodel.PDPage page) {
        java.util.Set<Integer> ids = new java.util.HashSet<>();
        try {
            var res = page.getResources();
            if (res == null) return ids;
            for (var name : res.getXObjectNames()) {
                if (!res.isImageXObject(name)) continue;
                var xobj = res.getXObject(name);
                if (xobj instanceof org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject img
                        && img.getWidth() >= FIGURE_MIN_W && img.getHeight() >= FIGURE_MIN_H) {
                    // COSStream identity: shared (indirect) image streams are cached by
                    // PDFBox, so a reused banner yields the same identity across pages.
                    ids.add(System.identityHashCode(img.getCOSObject()));
                }
            }
        } catch (Exception e) {
            log.debug("largeImageIds failed on a page of a PDF: {}", e.getMessage());
        }
        return ids;
    }

    /**
     * OCR a scanned PDF: render each page to PNG at {@link #OCR_DPI} and transcribe
     * batches of pages with Gemini vision. Capped at {@link #OCR_MAX_PAGES} pages —
     * a truncation note is appended when a longer document is cut off.
     */
    private String ocrPdf(org.apache.pdfbox.pdmodel.PDDocument doc, String filename) throws Exception {
        int totalPages = doc.getNumberOfPages();
        int pages = Math.min(totalPages, OCR_MAX_PAGES);
        org.apache.pdfbox.rendering.PDFRenderer renderer =
                new org.apache.pdfbox.rendering.PDFRenderer(doc);

        StringBuilder out = new StringBuilder();
        for (int start = 0; start < pages; start += OCR_PAGES_PER_CALL) {
            int end = Math.min(start + OCR_PAGES_PER_CALL, pages);
            List<byte[]> pngs = new ArrayList<>();
            for (int p = start; p < end; p++) {
                java.awt.image.BufferedImage img = renderer.renderImageWithDPI(p, OCR_DPI);
                ByteArrayOutputStream png = new ByteArrayOutputStream();
                javax.imageio.ImageIO.write(img, "png", png);
                pngs.add(png.toByteArray());
            }
            String instruction = ("These are scanned pages %d-%d of the document \"%s\". "
                    + "Transcribe ALL text on these pages verbatim, in reading order, as plain text. "
                    + "Preserve headings, labels, list structure, and table rows (use one line per row "
                    + "with cells separated by \" | \"). For handwriting, transcribe your best reading. "
                    + "Mark anything illegible as [illegible]. Do not summarize, interpret, or omit anything.")
                    .formatted(start + 1, end, filename);
            String batch = geminiService.transcribeImages(instruction, pngs);
            if (out.length() > 0) out.append("\n\n");
            out.append(batch.trim());
        }
        if (totalPages > pages) {
            out.append("\n\n[Document truncated: only the first ").append(pages)
               .append(" of ").append(totalPages).append(" scanned pages were transcribed.]");
        }
        return out.toString();
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
