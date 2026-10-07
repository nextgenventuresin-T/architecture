import { Link } from 'react-router-dom';
import { Plus, HardHat, PackagePlus, ClipboardCheck, FileBarChart } from 'lucide-react';

const ACTIONS = [
  { label: 'Add project', icon: Plus, to: '/admin/projects' },
  { label: 'Add contractor', icon: HardHat, to: '/admin/contractors' },
  { label: 'Material request', icon: PackagePlus, to: '/admin/materials' },
  { label: 'Review approvals', icon: ClipboardCheck, to: '/admin/approvals' },
  { label: 'View reports', icon: FileBarChart, to: '/admin/reports' },
];

/** A single quiet strip rather than five competing buttons. */
export default function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map(({ label, icon: Icon, to }) => (
        <Link
          key={label}
          to={to}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm text-ink-muted transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </div>
  );
}
