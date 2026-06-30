/**
 * Centralized brand + status color tokens.
 *
 * Single source of truth for the hex values that are currently hardcoded as
 * inline `style={{}}` literals in ~300 places. New code should import from here
 * (or use the Tailwind `teal`/brand classes); existing inline literals are being
 * migrated to these tokens incrementally.
 */

export const BRAND = {
  /** Primary blue — links, primary actions. */
  blue:      '#1E88FF',
  /** Dark teal — buttons, active states, accents. (Tailwind: teal-700) */
  teal:      '#2a5f6f',
  /** Success green. */
  green:     '#3F9B2F',
  /** Light/accent green. */
  greenSoft: '#7ED957',
  /** Warning / amber accent. */
  amber:     '#F5A623',
  /** Dark navy text. */
  navy:      '#1E3347',
} as const;

/** Background/text pairs for a sensitivity level badge (HIGH/MEDIUM/LOW). */
export const SENSITIVITY_COLORS: Record<string, { bg: string; text: string }> = {
  HIGH:   { bg: '#fee2e2', text: '#991b1b' },
  MEDIUM: { bg: '#fef9c3', text: '#854d0e' },
  LOW:    { bg: '#f0fdf4', text: '#166534' },
};
