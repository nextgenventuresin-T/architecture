import { useId } from 'react';
import { Check } from 'lucide-react';

export default function Checkbox({ label, checked = false, onChange, ...props }) {
  const id = useId();

  return (
    <div className="flex items-center gap-2.5">
      <span className="relative inline-flex h-[18px] w-[18px] shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[6px] border border-line bg-white transition-colors checked:border-brand-600 checked:bg-brand-600 hover:border-brand-300"
          {...props}
        />
        <Check
          className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-white opacity-0 peer-checked:opacity-100"
          strokeWidth={3}
          aria-hidden="true"
        />
      </span>
      <label htmlFor={id} className="cursor-pointer select-none text-sm text-ink-muted">
        {label}
      </label>
    </div>
  );
}
