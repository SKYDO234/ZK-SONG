import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function ToastContainer() {
  const { toasts, dismissToast } = useApp();

  if (!toasts.length) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((t) => {
        const isError = t.type === 'error';
        const isWarn = t.type === 'warning';
        const isInfo = t.type === 'info';

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl shadow-2xl border backdrop-blur-xl transition-all duration-300 ${
              isError
                ? 'bg-rose-950/90 border-rose-500/50 text-rose-100'
                : isWarn
                  ? 'bg-amber-950/90 border-amber-500/50 text-amber-100'
                  : isInfo
                    ? 'bg-[#0d0d0f]/95 border-amber-400/40 text-neutral-200'
                    : 'bg-[#0d0d0f]/95 border-emerald-500/50 text-emerald-100'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {isError ? (
                <XCircle className="w-5 h-5 text-rose-400" />
              ) : isWarn ? (
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              ) : isInfo ? (
                <Info className="w-5 h-5 text-amber-300" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              )}
            </div>
            <div className="flex-1 text-sm font-medium leading-relaxed">{t.message}</div>
            <button
              onClick={() => dismissToast(t.id)}
              className="text-neutral-400 hover:text-white transition-colors"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
