import { Check, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import "./webSettings.css";

export function SettingsDetailShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="vs-root vs-detail">
      <header className="vs-detail__header">
        <h1 className="vs-detail__title">{title}</h1>
        {subtitle ? <p className="vs-detail__subtitle">{subtitle}</p> : null}
      </header>
      <div className="vs-detail__body">
        <div className="vs-detail__inner">{children}</div>
      </div>
    </div>
  );
}

export function SettingsSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="vs-section">
      {label ? <div className="vs-section__label">{label}</div> : null}
      <div className="vs-card">{children}</div>
    </div>
  );
}

export function SettingsRow({
  label,
  hint,
  value,
  onClick,
  danger,
  right,
}: {
  label: string;
  hint?: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
  right?: ReactNode;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`vs-row${danger ? " vs-row--danger" : ""}`}
      onClick={onClick}
    >
      <div className="vs-row__main">
        <div className="vs-row__label">{label}</div>
        {hint ? <div className="vs-row__hint">{hint}</div> : null}
        {value ? <div className="vs-row__value">{value}</div> : null}
      </div>
      {right ?? (onClick ? <ChevronRight className="vs-row__chevron" size={18} strokeWidth={2} /> : null)}
    </Tag>
  );
}

export function SettingsSwitch({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`vs-switch-row${disabled ? " vs-switch-row--disabled" : ""}`}>
      <div className="vs-row__main">
        <div className="vs-row__label">{label}</div>
        {hint ? <div className="vs-row__hint">{hint}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`vs-switch${checked ? " vs-switch--on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="vs-switch__thumb" />
      </button>
    </div>
  );
}

export function SettingsInfoBox({ children }: { children: ReactNode }) {
  return <div className="vs-info">{children}</div>;
}

export function SettingsSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="vs-select-row">
      <div className="vs-row__main">
        <div className="vs-row__label">{label}</div>
      </div>
      <select
        className="vs-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SettingsOptionRow({
  label,
  sub,
  selected,
  onClick,
}: {
  label: string;
  sub?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`vs-option-row${selected ? " vs-option-row--selected" : ""}`} onClick={onClick}>
      <span className="vs-check">{selected ? <Check size={13} strokeWidth={3} /> : null}</span>
      <div className="vs-row__main">
        <div className="vs-row__label">{label}</div>
        {sub ? <div className="vs-row__value">{sub}</div> : null}
      </div>
    </button>
  );
}

export function SettingsThemeGrid({
  themes,
  selectedId,
  onSelect,
}: {
  themes: Array<{ id: string; name: string; kind: string; colors: [string, string] }>;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="vs-theme-grid">
      {themes.map((t) => {
        const selected = t.id === selectedId;
        const bg =
          t.kind === "gradient"
            ? `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]})`
            : t.colors[0];
        return (
          <button
            key={t.id}
            type="button"
            className={`vs-theme-card${selected ? " vs-theme-card--selected" : ""}`}
            onClick={() => onSelect(t.id)}
          >
            <div className="vs-theme-swatch" style={{ background: bg }}>
              {selected ? <span className="vs-theme-swatch__check">✓</span> : null}
            </div>
            <div className="vs-theme-name">{t.name}</div>
          </button>
        );
      })}
    </div>
  );
}

export function SettingsModal({
  title,
  hint,
  open,
  onClose,
  children,
  footerLabel = "Close",
}: {
  title: string;
  hint?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footerLabel?: string;
}) {
  if (!open) return null;
  return (
    <div className="vs-root vs-modal-overlay" onClick={onClose}>
      <div className="vs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vs-modal__head">{title}</div>
        {hint ? <div className="vs-modal__hint">{hint}</div> : null}
        <div className="vs-modal__body">{children}</div>
        <button type="button" className="vs-modal__foot" onClick={onClose}>
          {footerLabel}
        </button>
      </div>
    </div>
  );
}

export function SettingsBadge({ children, variant = "green" }: { children: ReactNode; variant?: "green" | "red" }) {
  return <span className={`vs-badge vs-badge--${variant}`}>{children}</span>;
}
