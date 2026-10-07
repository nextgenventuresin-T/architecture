import { useLocation, Link } from 'react-router-dom';
import { Hammer } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { findNavItem } from '../../config/navigation';

/**
 * Every sidebar entry resolves to a real screen so navigation is never a dead
 * end. Each module replaces this with its own page in a later interface.
 */
export default function ModulePlaceholderPage() {
  const { pathname } = useLocation();
  const item = findNavItem(pathname);
  const label = item?.label ?? 'Module';

  return (
    <>
      <PageHeader
        title={label}
        description={`The ${label.toLowerCase()} module has not been built yet.`}
        breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label }]}
        showBack
      />

      <Card>
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Hammer className="h-5 w-5" aria-hidden="true" />
          </span>
          <h3 className="mt-4 font-display text-lg font-semibold text-ink">
            {label} is coming in a later interface
          </h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
            The navigation, layout and permissions for this area are already in place. The list,
            detail and edit screens get built when this module's turn comes.
          </p>
          <Link to="/admin" className="mt-6">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        </div>
      </Card>
    </>
  );
}
