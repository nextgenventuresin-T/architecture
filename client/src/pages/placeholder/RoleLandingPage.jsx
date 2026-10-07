import { Link } from 'react-router-dom';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import useAuth from '../../hooks/useAuth';
import { ROLE_LABELS } from '../../config/roles';
import { modulesForRole } from '../../components/layout/RoleWorkspaceLayout';

export default function RoleLandingPage() {
  const { user } = useAuth();
  const modules = modulesForRole(user);

  return (
    <>
      <div className="mb-8">
        <p className="text-sm font-medium text-brand-700">{ROLE_LABELS[user?.role] || user?.role} workspace</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Welcome, {user?.fullName}</h1>
        <p className="mt-2 max-w-2xl text-ink-muted">Your access is limited to the modules granted to your account.</p>
      </div>

      {modules.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {modules.map((module) => (
            <Link key={module.path} to={module.path}>
              <Card className="h-full transition-shadow hover:shadow-card">
                <CardBody className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-ink">{module.label}</h2>
                    <p className="mt-1 text-sm text-ink-muted">Open the authorized {module.label.toLowerCase()} area.</p>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardBody className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
            <div>
              <h2 className="font-medium text-ink">No modules are currently assigned</h2>
              <p className="mt-1 text-sm text-ink-muted">Ask an administrator to review your User & Access permissions.</p>
            </div>
          </CardBody>
        </Card>
      )}
    </>
  );
}
