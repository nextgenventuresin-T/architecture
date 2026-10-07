import { Navigate, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import FullPageLoader from '../components/layout/FullPageLoader';

/**
 * Gates a route behind authentication and, optionally, a set of roles.
 * Usage once dashboards exist:
 *   <ProtectedRoute allowedRoles={[ROLES.ADMIN]}><AdminDashboard /></ProtectedRoute>
 */
export default function ProtectedRoute({ children, allowedRoles, requiredPermission }) {
  const { isAuthenticated, isBootstrapping, user } = useAuth();
  const location = useLocation();

  // Wait for the silent refresh so a reload does not bounce the user out.
  if (isBootstrapping) return <FullPageLoader label="Restoring your session" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (allowedRoles?.length && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorised" replace />;
  }

  if (requiredPermission && user.role !== 'admin' && !user.permissions?.includes(requiredPermission)) {
    return <Navigate to="/unauthorised" replace />;
  }

  return children;
}
