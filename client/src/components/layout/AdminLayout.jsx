import { useMemo, useState, createContext, useContext } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { findNavItem } from '../../config/navigation';
import useDashboardData from '../../hooks/useDashboardData';

/**
 * Shell for every admin screen. Loads the dashboard payload once here so the
 * sidebar badges, the notification dot and the page itself read from the same
 * source instead of fetching separately.
 */
const AdminDataContext = createContext(null);

export const useAdminData = () => {
  const context = useContext(AdminDataContext);
  if (!context) throw new Error('useAdminData must be used inside <AdminLayout>.');
  return context;
};

export default function AdminLayout() {
  const location = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [search, setSearch] = useState('');

  const dashboard = useDashboardData();
  const summary = dashboard.data?.summary;

  const title = findNavItem(location.pathname)?.label ?? 'Dashboard';

  const value = useMemo(
    () => ({ ...dashboard, search, setSearch }),
    [dashboard, search]
  );

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((collapsed) => !collapsed)}
        counts={{
          pendingApprovals: summary?.pendingApprovals ?? 0,
          unreadNotifications: summary?.unreadNotifications ?? 0,
        }}
      />

      <div className={`transition-[padding] duration-200 ${isCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[264px]'}`}>
        <Topbar
          title={title}
          onOpenSidebar={() => setIsDrawerOpen(true)}
          searchValue={search}
          onSearchChange={(event) => setSearch(event.target.value)}
          notificationCount={summary?.unreadNotifications ?? 0}
        />

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-[1400px]">
            <AdminDataContext.Provider value={value}>
              <Outlet />
            </AdminDataContext.Provider>
          </div>
        </main>
      </div>
    </div>
  );
}
