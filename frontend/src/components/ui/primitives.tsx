import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ChevronRight, Search, X } from 'lucide-react';
import { buttonClass, inputClass, type Variant } from './styles';

/* ---------- Buttons ---------- */

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }
> = ({ variant = 'secondary', size = 'md', className = '', type = 'button', ...rest }) => (
  <button type={type} className={`${buttonClass(variant, size)} ${className}`} {...rest} />
);

/* ---------- Layout ---------- */

export interface Crumb {
  label: string;
  to?: string;
}

export const Breadcrumbs: React.FC<{ items: Crumb[] }> = ({ items }) => (
  <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
    <ol className="flex flex-wrap items-center gap-1">
      {items.map((c, i) => (
        <li key={`${c.label}-${i}`} className="flex items-center gap-1">
          {i > 0 && <ChevronRight aria-hidden className="h-3 w-3 text-slate-400" />}
          {c.to ? (
            <Link to={c.to} className="hover:text-blue-700 hover:underline">
              {c.label}
            </Link>
          ) : (
            <span aria-current="page" className="font-medium text-slate-700">
              {c.label}
            </span>
          )}
        </li>
      ))}
    </ol>
  </nav>
);

export const PageHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}> = ({ title, subtitle, breadcrumbs, actions, meta }) => (
  <header className="space-y-2">
    {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
    <div className="flex flex-col gap-4 border-b border-slate-200 pb-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {meta && <div className="mb-1 flex flex-wrap items-center gap-2">{meta}</div>}
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  </header>
);

export const Card: React.FC<{
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  padded?: boolean;
  className?: string;
  id?: string;
}> = ({ title, subtitle, actions, children, padded = true, className = '', id }) => (
  <section id={id} className={`rounded-md border border-slate-200 bg-white shadow-2xs ${className}`}>
    {(title || actions) && (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="min-w-0">
          {title && <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">{title}</h2>}
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    )}
    <div className={padded ? 'p-5' : ''}>{children}</div>
  </section>
);

export const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode }> = ({ label, value, hint }) => (
  <div className="min-w-0 rounded border border-slate-200 bg-slate-50 p-2.5">
    <dt className="text-[11px] font-semibold uppercase text-slate-500">{label}</dt>
    <dd className="mt-0.5 text-base font-bold text-slate-900">{value}</dd>
    {hint && <dd className="text-xs text-slate-500">{hint}</dd>}
  </div>
);

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center px-4 py-10 text-center">
    {icon && <div className="mb-2 text-slate-400">{icon}</div>}
    <p className="text-sm font-semibold text-slate-800">{title}</p>
    {description && <p className="mt-1 max-w-md text-xs text-slate-500">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/* ---------- Tabs ---------- */

export interface TabDef<T extends string> {
  id: T;
  label: string;
  badge?: React.ReactNode;
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  };
  return (
    <div role="tablist" aria-label={label} className="relative flex overflow-x-auto border-b border-slate-200">
      {tabs.map((t, i) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-colors ${
              selected ? 'border-blue-600 bg-blue-50/40 text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
            {t.badge}
          </button>
        );
      })}
    </div>
  );
}

export const CountPill: React.FC<{ n: number; tone?: 'neutral' | 'warning' | 'danger' }> = ({ n, tone = 'neutral' }) => (
  <span
    className={`rounded px-1.5 text-[11px] font-semibold ${
      tone === 'danger' ? 'bg-rose-100 text-rose-800' : tone === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
    }`}
  >
    {n}
  </span>
);

/* ---------- Inputs ---------- */

export const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}> = ({ value, onChange, placeholder, label, className = '' }) => (
  <div className={`relative ${className}`}>
    <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    <input
      type="search"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${inputClass} pl-9`}
    />
  </div>
);

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  counts,
  label,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  counts?: Partial<Record<T, number>>;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.id)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {o.label}
            {counts?.[o.id] !== undefined && <span className={`ml-1 ${selected ? 'text-blue-100' : 'text-slate-400'}`}>{counts[o.id]}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Modal ---------- */

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg';
}> = ({ open, onClose, title, description, children, footer, size = 'md' }) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])');
    (focusable ?? panel)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panel) {
        const items = Array.from(
          panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'),
        );
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-xs sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-lg border border-slate-300 bg-white shadow-2xl sm:rounded-lg ${size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl'}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-bold uppercase tracking-wider text-slate-900">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          <button type="button" data-close onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};

/** Label/value rows for dense detail panels. */
export const DetailList: React.FC<{ rows: { label: string; value: React.ReactNode }[] }> = ({ rows }) => (
  <dl className="divide-y divide-slate-100 text-xs">
    {rows.map((r) => (
      <div key={r.label} className="grid grid-cols-5 gap-3 py-2">
        <dt className="col-span-2 font-medium text-slate-400">{r.label}</dt>
        <dd className="col-span-3 break-words font-semibold text-slate-800">{r.value}</dd>
      </div>
    ))}
  </dl>
);
