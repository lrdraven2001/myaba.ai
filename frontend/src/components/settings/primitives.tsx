import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { ReactNode } from 'react';

/**
 * Shared presentational primitives for the redesigned Settings page.
 * All are controlled/stateless — they take values + handlers and bind to real
 * state in the individual tab components. Styling matches the Settings mockups:
 * white rounded cards, brand-teal accents (#2a5f6f), green toggles.
 */

// ── Card ────────────────────────────────────────────────────────────────────
export function SettingsCard({
  icon, iconColor = '#2a5f6f', title, subtitle, action, children, className = '',
}: {
  icon?: IconDefinition;
  iconColor?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white border border-gray-200 rounded-2xl ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${iconColor}1A` }}
              >
                <FontAwesomeIcon icon={icon} style={{ color: iconColor, fontSize: 16 }} />
              </span>
            )}
            <div className="min-w-0">
              {title && <h3 className="text-[15px] font-semibold text-gray-900 truncate">{title}</h3>}
              {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

// ── Badge / status pill ───────────────────────────────────────────────────────
type BadgeTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'purple';
const BADGE_TONES: Record<BadgeTone, { bg: string; text: string }> = {
  neutral: { bg: '#f3f4f6', text: '#4b5563' },
  green:   { bg: '#dcfce7', text: '#166534' },
  amber:   { bg: '#fef3c7', text: '#92400e' },
  red:     { bg: '#fee2e2', text: '#991b1b' },
  blue:    { bg: '#dbeafe', text: '#1e40af' },
  purple:  { bg: '#ede9fe', text: '#6d28d9' },
};
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  const c = BADGE_TONES[tone];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: c.bg, color: c.text }}
    >
      {children}
    </span>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
export function Toggle({
  checked, onChange, disabled = false, label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className="relative inline-flex items-center rounded-full transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ width: 44, height: 24, background: checked ? '#16a34a' : '#cbd5e1' }}
    >
      <span
        className="inline-block bg-white rounded-full shadow-sm transition-transform"
        style={{ width: 18, height: 18, transform: `translateX(${checked ? 23 : 3}px)` }}
      />
    </button>
  );
}

// ── Select "pill" (e.g. All Access ▾, Always on ▾) ────────────────────────────
export function SelectPill({
  value, options, onChange, disabled = false, tone = 'green', ariaLabel,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  tone?: 'green' | 'blue' | 'neutral';
  ariaLabel?: string;
}) {
  const tones = {
    green:   { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
    blue:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
    neutral: { bg: '#f9fafb', border: '#e5e7eb', text: '#374151' },
  }[tone];
  return (
    <div className="relative inline-flex">
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none text-[13px] font-medium rounded-lg pl-3 pr-8 py-1.5 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: tones.bg, border: `1px solid ${tones.border}`, color: tones.text }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <FontAwesomeIcon
        icon={faChevronDown}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
        style={{ color: tones.text, fontSize: 11 }}
      />
    </div>
  );
}

// ── Setting row (icon · title · description · right control) ───────────────────
export function SettingRow({
  icon, iconColor = '#2a5f6f', title, description, control, onClick, className = '',
}: {
  icon?: IconDefinition;
  iconColor?: string;
  title: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { onClick, type: 'button' as const } : {})}
      className={`w-full flex items-center gap-3.5 px-5 sm:px-6 py-3.5 text-left ${onClick ? 'hover:bg-gray-50 transition-colors' : ''} ${className}`}
    >
      {icon && (
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${iconColor}1A` }}
        >
          <FontAwesomeIcon icon={icon} style={{ color: iconColor, fontSize: 15 }} />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900">{title}</div>
        {description && <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</div>}
      </div>
      {control && <div className="shrink-0">{control}</div>}
    </Tag>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────────────
export function PrimaryButton({
  children, onClick, disabled, type = 'button', icon, className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  icon?: IconDefinition;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50 ${className}`}
      style={{ background: '#2a5f6f' }}
    >
      {icon && <FontAwesomeIcon icon={icon} className="text-xs" />}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children, onClick, disabled, icon, className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: IconDefinition;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50 ${className}`}
    >
      {icon && <FontAwesomeIcon icon={icon} className="text-xs" />}
      {children}
    </button>
  );
}

// ── Section heading (above a group of cards) ──────────────────────────────────
export function SectionHeading({ title, description, action }: {
  title: ReactNode; description?: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
