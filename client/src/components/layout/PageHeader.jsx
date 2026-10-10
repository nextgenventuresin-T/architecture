import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, ArrowLeft } from 'lucide-react';

/**
 * Breadcrumb, description, back control and primary action. Every module screen
 * uses this so the navigation experience stays identical across the ERP.
 */
/**
 * Admin screens are reused inside other workspaces (/finance, /procurement, /warehouse,
 * /pm, /contractor ...) with breadcrumbs written for /admin. Outside the Admin workspace,
 * "Dashboard" (/admin) goes to the user's own workspace home and any other /admin link is
 * shown as plain text, so a breadcrumb never sends someone to the Unauthorised page.
 */
function workspaceLink(to, pathname) {
  if (!to || !to.startsWith('/admin')) return to;
  const workspace = `/${pathname.split('/')[1] || ''}`;
  if (workspace === '/admin') return to;
  return to === '/admin' ? workspace : null;
}

export default function PageHeader({ title, description, breadcrumbs = [], actions, showBack = false }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="mb-6">
      {breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              const to = workspaceLink(crumb.to, pathname);
              return (
                <li key={crumb.label} className="flex items-center gap-1">
                  {index > 0 && (
                    <ChevronRight className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />
                  )}
                  {to && !isLast ? (
                    <Link to={to} className="rounded hover:text-brand-700 hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current={isLast ? 'page' : undefined} className={isLast ? 'text-ink' : ''}>
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            {showBack && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label="Go back"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink-muted transition-colors hover:bg-brand-50 hover:text-brand-700"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <h2 className="font-display text-2xl font-semibold leading-tight text-ink">{title}</h2>
          </div>
          {description && <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">{description}</p>}
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
