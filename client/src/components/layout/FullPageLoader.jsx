import { Loader2 } from 'lucide-react';
import Logo from '../ui/Logo';

export default function FullPageLoader({ label = 'Loading' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas">
      <Logo size={40} />
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {label}
      </p>
    </div>
  );
}
