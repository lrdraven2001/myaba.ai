package ai.myaba.model.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * Result returned by POST /api/import/officepuzzle.
 *
 * <ul>
 *   <li>{@code imported}     – rows that were successfully created as new clients</li>
 *   <li>{@code skipped}      – rows ignored because they were blank or duplicates</li>
 *   <li>{@code errorCount}   – rows that failed (see {@code errors} for details)</li>
 *   <li>{@code errors}       – human-readable error per failed row</li>
 *   <li>{@code importedNames}– display names of every successfully created client</li>
 * </ul>
 */
@Data
@Builder
public class OfficePuzzleImportResult {

    private int imported;
    private int skipped;
    private int errorCount;
    private List<String> errors;
    private List<String> importedNames;
    private String message;
}
