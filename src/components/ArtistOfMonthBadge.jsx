import React from 'react';
import { Crown, Sparkles } from 'lucide-react';

export default function ArtistOfMonthBadge({
  size = 'sm',
  monthLabel = '',
  approvedCount = null,
  className = '',
}) {
  if (size === 'lg') {
    return (
      <div
        className={`inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full aotm-gold-shimmer text-slate-950 font-extrabold text-xs sm:text-sm tracking-wide shadow-lg shadow-amber-500/30 border border-amber-200/70 ${className}`}
      >
        <Crown className="w-4 h-4 fill-slate-950 stroke-[2.2]" />
        <span>ARTIST OF THE MONTH</span>
        {monthLabel && <span className="opacity-80 font-bold">• {monthLabel}</span>}
        {approvedCount !== null && (
          <span className="px-2 py-0.5 rounded-full bg-slate-950/90 text-amber-300 text-[11px] font-bold">
            {approvedCount} Approved
          </span>
        )}
      </div>
    );
  }

  if (size === 'md') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full aotm-gold-shimmer text-slate-950 font-extrabold text-xs tracking-wide shadow-md shadow-amber-500/25 border border-amber-200/60 ${className}`}
        title={`Crowned Artist of the Month${monthLabel ? ` (${monthLabel})` : ''}`}
      >
        <Crown className="w-3.5 h-3.5 fill-slate-950" />
        <span>Artist of the Month</span>
        {approvedCount !== null && (
          <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-slate-950/85 text-amber-300 text-[10px]">
            {approvedCount}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full aotm-gold-shimmer text-slate-950 font-extrabold text-[10px] uppercase tracking-wider shadow-sm shadow-amber-500/20 border border-amber-200/50 ${className}`}
      title="Artist of the Month — Highest number of approved songs this month"
    >
      <Crown className="w-3 h-3 fill-slate-950 shrink-0" />
      <span>Artist of the Month</span>
      <Sparkles className="w-2.5 h-2.5 shrink-0" />
    </span>
  );
}
