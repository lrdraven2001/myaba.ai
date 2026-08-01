package ai.myaba.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.openxml4j.util.ZipSecureFile;
import org.apache.poi.util.IOUtils;
import org.springframework.context.annotation.Configuration;

/**
 * Global Apache POI limits applied at startup to bound memory when parsing
 * UNTRUSTED uploaded spreadsheets (.xlsx / .xls). Guards against decompression
 * ("zip bomb") attacks — a small OOXML/zip file that inflates to gigabytes in
 * memory during parsing.
 *
 * <p>Uploads are already capped (25 MB, application.yml), but the compressed
 * size says nothing about the decompressed size without per-entry limits. A
 * legitimate 25 MB spreadsheet decompresses to well under these caps; a bomb
 * does not. These are absolute defense-in-depth on top of the inflate-ratio
 * check (POI rejects entries expanding more than 100:1).
 */
@Configuration
@Slf4j
public class PoiSecurityConfig {

    /** Max decompressed size of a single zip entry. */
    private static final long MAX_ENTRY_BYTES = 250L * 1024 * 1024;
    /** Cap on the largest single byte[] POI will allocate while parsing. */
    private static final int  MAX_BYTE_ARRAY  = 250 * 1024 * 1024;

    @PostConstruct
    void hardenPoi() {
        ZipSecureFile.setMinInflateRatio(0.01d);       // reject >100:1 inflation (POI default, explicit)
        ZipSecureFile.setMaxEntrySize(MAX_ENTRY_BYTES); // absolute per-entry decompressed cap
        IOUtils.setByteArrayMaxOverride(MAX_BYTE_ARRAY);// cap single allocations during parse
        log.info("POI hardening applied: minInflateRatio=0.01, maxEntrySize={}B, byteArrayMax={}B",
                MAX_ENTRY_BYTES, MAX_BYTE_ARRAY);
    }
}
