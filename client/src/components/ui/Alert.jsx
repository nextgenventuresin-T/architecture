import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

const TONES = {
  error: { icon: AlertCircle, box: 'border-danger/25 bg-danger-soft text-danger' },
  info: { icon: Info, box: 'border-brand-200 bg-brand-50 text-brand-800' },
  success: { icon: CheckCircle2, box: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
};

/** Inline message block. `role="alert"` announces errors to screen readers. */
export default function Alert({ tone = 'info', title, children, className = '' }) {
  const { icon: Icon, box } = TONES[tone] ?? TONES.info;

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex gap-3 rounded-xl border px-3.5 py-3 text-sm ${box} ${className}`}
    >
      <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <div className="space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <p className="opacity-90">{children}</p>}
      </div>
    </div>
  );
}
