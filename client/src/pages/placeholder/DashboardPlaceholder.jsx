import { LogOut } from 'lucide-react';
import Logo from '../../components/ui/Logo';
import Button from '../../components/ui/Button';
import useAuth from '../../hooks/useAuth';
import { ROLE_LABELS } from '../../config/roles';

/**
 * Temporary landing screen proving that role-based redirection works.
 * Each role's real dashboard replaces this in its own interface task.
 */
export default function DashboardPlaceholder() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <Logo size={34} withWordmark />
          <Button variant="secondary" onClick={logout}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="rounded-2xl border border-line bg-white p-8 shadow-card">
          <h1 className="font-display text-2xl font-semibold text-ink">
            Signed in as {user?.fullName}
          </h1>
          <p className="mt-2 text-ink-muted">
            Role: {ROLE_LABELS[user?.role] || user?.role}. The workspace for this role has not been
            built yet.
          </p>
        </div>
      </main>
    </div>
  );
}
