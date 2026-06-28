// Shared list of client "Generate Document" types. Used by the Generate Document
// modal and by the Agency Library's Generation Templates so the two stay in sync.
export interface DocumentType {
  value: string;
  label: string;
  /** Basic default template skeleton — pre-loaded so agencies can customize from a starting point. */
  defaultTemplate: string;
}

export const DOCUMENT_TYPES: DocumentType[] = [
  {
    value: 'behavior_intervention_plan',
    label: 'Behavior Intervention Plan (BIP)',
    defaultTemplate: [
      'BEHAVIOR INTERVENTION PLAN',
      '',
      '1. Target Behavior(s) — operational definition',
      '2. Function of Behavior (from FBA)',
      '3. Antecedent / Prevention Strategies',
      '4. Replacement Behaviors & Teaching Procedures',
      '5. Reinforcement Strategies',
      '6. Reactive / Crisis Procedures',
      '7. Data Collection Method',
      '8. Generalization & Maintenance Plan',
    ].join('\n'),
  },
  {
    value: 'functional_behavior_assessment',
    label: 'Functional Behavior Assessment (FBA)',
    defaultTemplate: [
      'FUNCTIONAL BEHAVIOR ASSESSMENT',
      '',
      '1. Referral & Background',
      '2. Operational Definition of Target Behavior(s)',
      '3. Indirect Assessment (interviews, records)',
      '4. Direct Observation / ABC Data',
      '5. Hypothesized Function',
      '6. Summary Statement',
      '7. Recommendations',
    ].join('\n'),
  },
  {
    value: 'session_note',
    label: 'Session Note',
    defaultTemplate: [
      'SESSION NOTE',
      '',
      'Date of Service / Duration / Service Code:',
      'Setting & Participants:',
      'Programs Run & Trial Data:',
      'Target Behaviors (ABC):',
      'Skill Acquisition Progress:',
      'Caregiver Collaboration:',
      'Plan for Next Session:',
    ].join('\n'),
  },
  {
    value: 'progress_report',
    label: 'Progress Report',
    defaultTemplate: [
      'PROGRESS REPORT',
      '',
      'Reporting Period:',
      'Summary of Progress by Goal:',
      'Behavior Reduction Data:',
      'Skill Acquisition Data:',
      'Barriers & Adjustments:',
      'Recommendations / Continued Medical Necessity:',
    ].join('\n'),
  },
  {
    value: 'treatment_plan',
    label: 'Treatment Plan',
    defaultTemplate: [
      'TREATMENT PLAN',
      '',
      'Diagnosis & Medical Necessity:',
      'Long-Term Goals:',
      'Short-Term Objectives (measurable):',
      'Recommended Service Hours:',
      'Behavior Reduction Targets:',
      'Skill Acquisition Targets:',
      'Caregiver Training Goals:',
      'Discharge Criteria:',
    ].join('\n'),
  },
  {
    value: 'discharge_summary',
    label: 'Discharge Summary',
    defaultTemplate: [
      'DISCHARGE SUMMARY',
      '',
      'Reason for Discharge:',
      'Services Provided & Dates:',
      'Goals Met / Not Met:',
      'Final Behavior & Skill Status:',
      'Recommendations & Referrals:',
      'Caregiver Acknowledgement:',
    ].join('\n'),
  },
  {
    value: 'parent_training_note',
    label: 'Parent Training Note',
    defaultTemplate: [
      'PARENT TRAINING NOTE',
      '',
      'Date / Duration / Participants:',
      'Training Goal Addressed:',
      'Strategies Taught & Modeled:',
      'Caregiver Demonstration / Fidelity:',
      'Home Practice Assigned:',
      'Plan for Next Session:',
    ].join('\n'),
  },
  {
    value: 'supervision_log',
    label: 'Supervision Log',
    defaultTemplate: [
      'SUPERVISION LOG',
      '',
      'Date / Duration / Modality:',
      'Supervisee & Supervisor:',
      'Activities & Competencies Addressed:',
      'Feedback Provided:',
      'Action Items / Follow-Up:',
    ].join('\n'),
  },
];

/** Topical category for each built-in document type (matches the Resources category pills). */
export const DOCUMENT_TYPE_CATEGORY: Record<string, string> = {
  behavior_intervention_plan:     'Clinical',
  functional_behavior_assessment: 'Clinical',
  session_note:                   'Clinical',
  progress_report:                'Reports',
  treatment_plan:                 'Clinical',
  discharge_summary:              'Discharge',
  parent_training_note:           'Parent Training',
  supervision_log:                'Supervision',
};

/** Category for a document type — built-in starters have a defined category; others default to Clinical. */
export function categoryFor(value: string): string {
  return DOCUMENT_TYPE_CATEGORY[value] ?? 'Clinical';
}

export function documentTypeLabel(value: string): string {
  return DOCUMENT_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function defaultTemplateFor(value: string): string {
  return DOCUMENT_TYPES.find((t) => t.value === value)?.defaultTemplate ?? '';
}
