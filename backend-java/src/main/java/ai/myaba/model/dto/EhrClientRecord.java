package ai.myaba.model.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * Normalised client record pulled from an external EHR.
 * Field names are EHR-agnostic; each connector maps its own field names here.
 */
@Data
@Builder
public class EhrClientRecord {

    /** The client's ID inside the source EHR system. */
    private String ehrId;

    /** Which EHR this came from: "centralreach" | "rethink". */
    private String ehrType;

    private String firstName;
    private String lastName;

    /** Preferred / goes-by name, if the EHR exposes it. */
    private String preferredName;

    /** ISO-8601 date: YYYY-MM-DD */
    private String dateOfBirth;

    private String gender;

    /** ICD-10 codes, e.g. ["F84.0", "F41.1"] */
    private List<String> diagnosisCodes;

    /** Human-readable diagnosis labels corresponding to diagnosisCodes. */
    private List<String> diagnosisDescriptions;

    private String primaryInsurance;

    /** Insurance member / subscriber ID. */
    private String memberId;

    /** ISO-8601 timestamp of when this record was last fetched. */
    private String syncedAt;
}
