import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Check, ChevronRight, X } from 'lucide-react';
export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: string }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
export function IconButton({
  label,
  children,
  onClick,
  disabled = false,
  active = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      className={`icon-button ${active ? 'active' : ''}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Notice({ children, tone = 'warning' }: { children: ReactNode; tone?: string }) {
  return (
    <div className={`notice ${tone}`}>
      <AlertTriangle size={16} />
      <div>{children}</div>
    </div>
  );
}
export function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="check-row">
      <span className={ok ? 'check-icon good' : 'check-icon pending'}>
        {ok ? <Check size={14} /> : <span />}
      </span>
      <div>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </div>
      <Pill tone={ok ? 'green' : 'muted'}>{ok ? 'Ready' : 'Required'}</Pill>
    </div>
  );
}
export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}
export function NumberField({
  value,
  onCommit,
  label,
  min = -1e6,
  max = 1e6,
  step = 'any',
  disabled = false,
}: {
  value: number;
  onCommit: (n: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number | 'any';
  disabled?: boolean;
}) {
  const display = (n: number) => Number(n.toPrecision(7)).toString();
  const [draft, setDraft] = useState(display(value));
  const [error, setError] = useState('');
  useEffect(() => setDraft(display(value)), [value]);
  function commit() {
    if (draft === display(value)) {
      setError('');
      return;
    }
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(n) || n < min || n > max) {
      setError(`Enter a value from ${min} to ${max}`);
      return;
    }
    setError('');
    if (n !== value) onCommit(n);
  }
  return (
    <div className="number-field">
      <input
        aria-label={label}
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(String(value));
            setError('');
          }
        }}
        aria-invalid={!!error}
      />
      {error && <small className="input-error">{error}</small>}
    </div>
  );
}
export function Toast({ message, tone, onClose }: { message: string; tone: string; onClose: () => void }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`toast ${tone}`}>
      <span>{tone === 'error' ? <AlertTriangle size={19} /> : <Check size={19} />}</span>
      <p>{message}</p>
      <button onClick={onClose} aria-label="Dismiss message">
        <X size={17} />
      </button>
    </div>
  );
}
export function Breadcrumb({ section, title }: { section: string; title: string }) {
  return (
    <div className="breadcrumb">
      <span>{section}</span>
      <ChevronRight size={12} />
      <span>{title}</span>
    </div>
  );
}
