import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import AuthShell from '../../components/layout/AuthShell';
import Button from '../../components/ui/Button';
import useAuth from '../../hooks/useAuth';
import { ROLE_LABELS, resolveHomeRoute } from '../../config/roles';

/**
 * Shown when a signed-in user opens an area their role does not cover.
 * Distinct from the 404 page: the page exists, the permission does not.
 */
export default function UnauthorisedPage() {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <AuthShell
      title="You do not have access to this area"
      description={
        isAuthenticated
          ? `Your account is set up as ${ROLE_LABELS[user.role] || user.role}. Ask your administrator if you need this area opened up.`
          : 'Sign in to see what your account can open.'
      }
      footer={
        isAuthenticated ? (
          <button
            type="button"
            onClick={logout}
            className="rounded font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            Sign out
          </button>
        ) : null
      }
    >
      <div className="flex gap-3.5 rounded-xl border border-line bg-canvas p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <ShieldAlert className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <p className="text-sm leading-relaxed text-ink-muted">
          Permissions follow the role on your account, so this is not something you can change
          yourself.
        </p>
      </div>

      <Link to={isAuthenticated ? resolveHomeRoute(user.role) : '/login'} className="mt-5 block">
        <Button size="lg" fullWidth>
          {isAuthenticated ? 'Go to my workspace' : 'Go to sign in'}
        </Button>
      </Link>
    </AuthShell>
  );
}
