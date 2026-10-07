import { Navigate, Link } from 'react-router-dom';
import AuthShell from '../../components/layout/AuthShell';
import LoginForm from '../../components/auth/LoginForm';
import useAuth from '../../hooks/useAuth';
import { resolveHomeRoute } from '../../config/roles';

export default function LoginPage() {
  const { isAuthenticated, user } = useAuth();

  // Someone already signed in has no reason to see this page.
  if (isAuthenticated) return <Navigate to={resolveHomeRoute(user.role)} replace />;

  return (
    <AuthShell
      title="Welcome to ABCD India"
      description="Sign in to reach your workspace. What you can open depends on the role assigned to your account."
      footer={
        <>
          Need an account?{' '}
          <Link
            to="/forgot-password"
            className="rounded font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            See how to get access
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
