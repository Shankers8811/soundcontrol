import { useEffect, useRef, type ReactNode } from 'react';
import type { ConnectionPhase } from '../state/derive';
import { IconAlert, IconCheck, IconClose } from './Icons';

/**
 * Shared desktop-UI primitives. Presentation only — every component here is
 * driven by real store state passed in by the pages; none of them invent
 * device data.
 */

/* ------------------------------------------------------------------ Card */

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-edge bg-panel shadow-[0_1px_2px_rgb(0_0_0/0.35)] ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-edge-soft px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-wide text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-mute">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------ PageHeader */

export function PageHeader({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        {sub && <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-mute">{sub}</div>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </header>
  );
}

/* ----------------------------------------------------------- StatusBadge */

const PHASE_STYLE: Record<ConnectionPhase, { dot: string; text: string; label: string; blink?: boolean }> = {
  connected: { dot: 'bg-accent shadow-[0_0_8px_rgb(61_123_255/0.8)]', text: 'text-accent-soft', label: 'Connected' },
  connecting: { dot: 'bg-warn', text: 'text-warn', label: 'Connecting…', blink: true },
  error: { dot: 'bg-danger', text: 'text-danger', label: 'Error' },
  disconnected: { dot: 'bg-faint', text: 'text-mute', label: 'Disconnected' },
};

export function StatusBadge({ phase, label }: { phase: ConnectionPhase; label?: string }) {
  const s = PHASE_STYLE[phase];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-edge bg-sunken px-3 py-1 text-xs font-semibold ${s.text}`}
      role="status"
    >
      <span className={`h-2 w-2 rounded-full ${s.dot} ${s.blink ? 'blink' : ''}`} aria-hidden />
      {label ?? s.label}
    </span>
  );
}

/* ---------------------------------------------------------------- Button */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BUTTON_STYLE: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-deep text-white hover:bg-accent border border-transparent shadow-[0_2px_10px_rgb(47_107_255/0.35)]',
  secondary: 'bg-raised text-ink border border-edge hover:border-accent/50 hover:text-accent-soft',
  danger: 'bg-transparent text-danger border border-danger/40 hover:bg-danger/10',
  ghost: 'bg-transparent text-mute border border-transparent hover:text-ink hover:bg-raised',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}: {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${pad} ${BUTTON_STYLE[variant]} ${className}`}
      {...rest}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

/* --------------------------------------------------------------- Spinner */

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="spin" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------------------------------------------------------- Toggle */

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`toggle ${checked ? 'on' : ''}`}
    />
  );
}

/* ------------------------------------------------------- Capability gates */

/**
 * Honest unsupported state (PART C): explains *why* a feature is not
 * available instead of rendering a control that does nothing.
 */
export function UnavailableNote({
  title = 'Not supported on this device',
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-edge bg-sunken/60 px-4 py-3.5 text-xs leading-relaxed text-mute ${className}`}
      role="note"
    >
      <p className="flex items-center gap-2 font-semibold text-ink/80">
        <IconAlert size={14} />
        {title}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/**
 * Renders `children` only when the connected model genuinely supports the
 * feature; otherwise renders the explanatory note. The single place where
 * capability gating happens, so no page can accidentally ship a fake control.
 */
export function CapabilityGate({
  supported,
  note,
  noteTitle,
  children,
}: {
  supported: boolean;
  note: ReactNode;
  noteTitle?: string;
  children: ReactNode;
}) {
  if (!supported) return <UnavailableNote title={noteTitle}>{note}</UnavailableNote>;
  return <>{children}</>;
}

/* ----------------------------------------------------------------- Modal */

/**
 * Accessible modal dialog (Esc / backdrop / close button). Used for the
 * factory-reset confirmation and the model-profile picker — replaces the old
 * window.confirm/alert so nothing blocks the Electron renderer thread.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  width = 'max-w-lg',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`page-enter w-full ${width} rounded-2xl border border-edge bg-panel shadow-[0_20px_60px_rgb(0_0_0/0.6)] outline-none`}
      >
        <header className="flex items-center justify-between border-b border-edge-soft px-5 py-3.5">
          <h2 className="text-sm font-bold text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1.5 text-mute transition-colors hover:bg-raised hover:text-ink"
          >
            <IconClose size={16} />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Info rows */

export function InfoRow({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-edge-soft py-2 last:border-0">
      <span className="shrink-0 text-xs text-mute">{label}</span>
      <span className={`min-w-0 truncate text-right text-xs font-medium text-ink ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}

export function SettingsRow({
  title,
  sub,
  control,
  disabled = false,
  disabledNote,
}: {
  title: string;
  sub?: ReactNode;
  control: ReactNode;
  disabled?: boolean;
  disabledNote?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 border-b border-edge-soft px-5 py-3.5 last:border-0 ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        {sub && <p className="mt-0.5 text-xs leading-relaxed text-mute">{sub}</p>}
        {disabled && disabledNote && <p className="mt-1 text-[11px] font-medium text-warn/80">{disabledNote}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/* ------------------------------------------------------------ Feedback */

export function InlineError({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-xl border border-danger/35 bg-danger/10 px-4 py-3 text-xs leading-relaxed text-danger"
    >
      <span className="flex items-start gap-2">
        <IconAlert size={15} className="mt-0.5 shrink-0" />
        <span className="font-medium">{message}</span>
      </span>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss error" className="shrink-0 p-0.5 hover:opacity-75">
          <IconClose size={13} />
        </button>
      )}
    </div>
  );
}

export function InlineSuccess({ message }: { message: string }) {
  return (
    <p className="flex items-center gap-2 text-xs font-medium text-accent-soft" role="status">
      <IconCheck size={14} />
      {message}
    </p>
  );
}
