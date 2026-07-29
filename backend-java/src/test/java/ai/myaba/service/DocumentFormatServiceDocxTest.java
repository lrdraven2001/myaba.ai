package ai.myaba.service;

import org.apache.poi.xwpf.usermodel.UnderlinePatterns;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;

import static org.junit.jupiter.api.Assertions.*;

/** Verifies toDocx renders Markdown as real Word formatting (bold/underline/table). */
class DocumentFormatServiceDocxTest {

    private final DocumentFormatService svc = new DocumentFormatService(null);

    @Test
    void rendersMarkdownFormattingIntoWord() throws Exception {
        String md = String.join("\n",
                "# Treatment Plan",
                "This has **bold** and *italic* and <u>underline</u> text.",
                "- First bullet",
                "- Second bullet",
                "",
                "| Goal | Status |",
                "| --- | --- |",
                "| Reduce aggression | On track |");

        byte[] docx = svc.toDocx("BIP for Alex", md);
        assertNotNull(docx);
        assertTrue(docx.length > 0);

        try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(docx))) {
            String text = new org.apache.poi.xwpf.extractor.XWPFWordExtractor(doc).getText();
            // Content survived
            assertTrue(text.contains("Treatment Plan"), "heading text present");
            assertTrue(text.contains("bold"),        "inline text present");
            assertTrue(text.contains("underline"),   "underline text present");
            assertTrue(text.contains("First bullet"),"bullet text present");
            assertTrue(text.contains("Reduce aggression"), "table cell text present");
            // Markup characters must NOT leak into the document
            assertFalse(text.contains("**"), "no literal ** markup");
            assertFalse(text.contains("<u>"), "no literal <u> markup");

            // A real table exists
            assertFalse(doc.getTables().isEmpty(), "a Word table was created");
            assertEquals("Goal", doc.getTables().get(0).getRow(0).getCell(0).getText().trim());

            // Some run is bold, and some run is underlined
            boolean anyBold = false, anyUnderline = false;
            for (XWPFParagraph p : doc.getParagraphs()) {
                for (XWPFRun r : p.getRuns()) {
                    if (r.isBold()) anyBold = true;
                    if (r.getUnderline() == UnderlinePatterns.SINGLE) anyUnderline = true;
                }
            }
            assertTrue(anyBold, "at least one bold run");
            assertTrue(anyUnderline, "at least one underlined run");
        }
    }
}
