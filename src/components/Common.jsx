import React, { useEffect } from 'react';
import {
  CheckCircle2,
  Clock3,
  XCircle,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Inbox,
} from 'lucide-react';

export function formatDate(input, withTime = false) {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);
  const opts = { year: 'numeric', month: 'short', day: 'numeric' };
  if (withTime) {
    opts.hour = '2-digit';
    opts.minute = '2-digit';
  }
  return d.toLocaleDateString('en-US', opts);
}

export function formatNumber(n) {
  const num = Number(n || 0);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

export function formatBytes(bytes) {
  const b = Number(bytes || 0);
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const m = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return `${m}:${sec}`;
}

export const STATUS_META = {
  approved: {
    label: 'Approved',
    Icon: CheckCircle2,
    className:
      'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  pending: {
    label: 'Pending Review',
    Icon: Clock3,
    className: 'bg-amber-500/12 text-amber-600 dark:text-amber-300 border-amber-500/35',
    dot: 'bg-amber-500',
  },
  rejected: {
    label: 'Rejected',
    Icon: XCircle,
    className: 'bg-rose-500/12 text-rose-600 dark:text-rose-300 border-rose-500/35',
    dot: 'bg-rose-500',
  },
};

export function StatusBadge({ status = 'pending', size = 'sm' }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  const { Icon } = meta;
  const pad = size === 'xs' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold ${pad} ${meta.className}`}
    >
      <Icon className={size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {meta.label}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'violet',
  loading = false,
  onClick,
}) {
  const tones = {
    violet: 'from-amber-300/25 to-amber-300/0 text-amber-300 border-amber-300/30',
    amber: 'from-amber-300/25 to-amber-300/0 text-amber-300 border-amber-300/30',
    cyan: 'from-white/15 to-white/0 text-neutral-200 border-white/20',
    emerald: 'from-white/15 to-white/0 text-neutral-200 border-white/20',
    slate: 'from-white/10 to-white/0 text-neutral-400 border-white/15',
    rose: 'from-rose-500/20 to-rose-500/0 text-rose-400 border-rose-500/25',
  };
  const toneCls = tones[tone] || tones.violet;
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      onClick={onClick}
      className={`group card-3d card-3d-hover relative overflow-hidden w-full text-left rounded-2xl p-4 sm:p-5 ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div
        className={`pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br ${toneCls} blur-2xl opacity-40`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-400 dark:text-neutral-400">
            {label}
          </p>
          {loading ? (
            <div className="mt-2 h-8 w-16 rounded-lg bg-white/10 dark:bg-white/10 animate-pulse" />
          ) : (
            <p className="mt-1.5 text-2xl sm:text-3xl font-black tracking-tight text-white dark:text-white">
              {value}
            </p>
          )}
          {hint && <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-400">{hint}</p>}
        </div>
        {Icon && (
          <div
            className={`shrink-0 w-10 h-10 rounded-xl grid place-items-center border bg-gradient-to-br ${toneCls}`}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </Tag>
  );
}

export function EmptyState({ title, description, icon: Icon = Inbox, action = null }) {
  return (
    <div className="text-center py-14 px-6">
      <div className="w-14 h-14 rounded-2xl mx-auto grid place-items-center bg-white/[0.04] dark:bg-white/[0.05] border border-white/10 dark:border-white/10">
        <Icon className="w-6 h-6 text-neutral-400" />
      </div>
      <h3 className="mt-4 font-extrabold text-white dark:text-white">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-neutral-400 dark:text-neutral-400 max-w-sm mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Spinner({ className = 'w-4 h-4', label = null }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Loader2 className={`${className} animate-spin`} />
      {label && <span className="text-sm font-semibold">{label}</span>}
    </span>
  );
}

export function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.total_pages <= 1) return null;
  const { page, total_pages, total, limit } = pagination;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const pages = [];
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  let end = Math.min(total_pages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  for (let i = start; i <= end; i += 1) pages.push(i);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3.5 border-t border-white/10 dark:border-white/10">
      <p className="text-xs font-semibold text-neutral-400 dark:text-neutral-400">
        Showing <span className="text-white dark:text-white">{from}</span>–
        <span className="text-white dark:text-white">{to}</span> of{' '}
        <span className="text-white dark:text-white">{total}</span> results
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-2 rounded-lg border border-white/10 text-neutral-400 disabled:opacity-30 hover:border-amber-300/40 hover:text-amber-200 transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {start > 1 && <span className="text-xs text-neutral-400 px-1">…</span>}
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`min-w-[34px] h-8 rounded-lg text-xs font-extrabold transition-all ${
              p === page
                ? 'bg-amber-500 text-white'
                : 'border border-white/10 dark:border-white/10 hover:bg-white/[0.06] dark:hover:bg-white/10'
            }`}
          >
            {p}
          </button>
        ))}
        {end < total_pages && <span className="text-xs text-neutral-400 px-1">…</span>}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= total_pages}
          className="p-2 rounded-lg border border-white/10 text-neutral-400 disabled:opacity-30 hover:border-amber-300/40 hover:text-amber-200 transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div
        className="fixed inset-0 bg-[#070708]/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        role="presentation"
      />
      <div
        className={`relative w-full ${sizes[size] || sizes.md} my-auto rounded-2xl bg-[#101013] border border-white/10 dark:border-white/10 shadow-2xl animate-scale-in`}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-white/10 dark:border-white/10">
          <div>
            <h3 className="font-extrabold text-base text-white dark:text-white">{title}</h3>
            {subtitle && (
              <p className="text-xs text-neutral-400 dark:text-neutral-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:bg-white/[0.06] dark:hover:bg-white/10 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-white/10 dark:border-white/10 flex flex-wrap justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading = false,
}) {
  const danger = tone === 'danger';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-white/10 dark:border-white/10 text-sm font-bold hover:bg-white/[0.06] dark:hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2.5 rounded-xl text-white text-sm font-extrabold disabled:opacity-50 transition-colors ${
              danger
                ? 'bg-rose-600 hover:bg-rose-500'
                : 'bg-amber-500 hover:bg-amber-400'
            }`}
          >
            {loading ? <Spinner label="Working…" /> : confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={`shrink-0 w-10 h-10 rounded-xl grid place-items-center ${
            danger
              ? 'bg-rose-500/12 text-rose-500 border border-rose-500/30'
              : 'bg-amber-400/12 text-amber-400 border border-amber-400/30'
          }`}
        >
          <AlertTriangle className="w-5 h-5" />
        </div>
        <p className="text-sm text-neutral-300 dark:text-neutral-300 leading-relaxed">{message}</p>
      </div>
    </Modal>
  );
}

export function SectionCard({ title, subtitle, action, children, className = '', bodyClassName = '' }) {
  return (
    <section
      className={`rounded-2xl bg-[#101013]/70 border border-white/10 dark:border-white/10 shadow-sm overflow-hidden ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-white/10 dark:border-white/10">
          <div>
            {title && (
              <h3 className="font-extrabold text-sm text-white dark:text-white">{title}</h3>
            )}
            {subtitle && (
              <p className="text-[11px] text-neutral-400 dark:text-neutral-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl bg-[#0a0a0b] dark:bg-[#070708] border border-white/10 dark:border-white/10 text-sm text-white dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-all';

export const labelClass =
  'block text-[11px] font-extrabold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 mb-1.5';

export const primaryBtn =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl btn-gold text-sm font-extrabold disabled:opacity-50 disabled:cursor-not-allowed transition-all';

export const ghostBtn =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-white/10 dark:border-white/10 bg-white/[0.05] text-sm font-bold text-neutral-200 dark:text-neutral-200 hover:bg-white/[0.06] dark:hover:bg-white/10 transition-colors';
