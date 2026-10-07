import {
  Truck,
  LayoutDashboard,
  Building2,
  HardHat,
  Users,
  Briefcase,
  Package,
  ShoppingCart,
  Warehouse,
  Wallet,
  UserCog,
  ClipboardCheck,
  FileBarChart,
  Bell,
  Settings,
  ShieldCheck,
  Store,
} from 'lucide-react';

/**
 * Single source of truth for the admin sidebar. Routes, labels, icons and
 * breadcrumbs all read from this list, so adding a module means adding one
 * entry here rather than editing several files.
 */
export const ADMIN_NAV = [
  { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, end: true },
  { label: 'Projects / Sites', path: '/admin/projects', icon: Building2 },
  { label: 'Clients', path: '/admin/clients', icon: Briefcase },
  { label: 'Contractors', path: '/admin/contractors', icon: HardHat },
  { label: 'Employees', path: '/admin/employees', icon: Users },
  { label: 'Labour Directory', path: '/admin/labour', icon: Users },
  { label: 'Vendors', path: '/admin/vendors', icon: Store },
  { label: 'Materials & Tools', path: '/admin/materials', icon: Package },
  { label: 'Procurement', path: '/admin/procurement', icon: ShoppingCart },
  { label: 'Warehouse', path: '/admin/warehouse', icon: Warehouse },
  { label: 'Material Movements', path: '/admin/material-movements', icon: Truck },
  { label: 'Finance', path: '/admin/finance', icon: Wallet },
  { label: 'HR', path: '/admin/hr', icon: UserCog },
  { label: 'Approvals', path: '/admin/approvals', icon: ClipboardCheck, badgeKey: 'pendingApprovals' },
  { label: 'Reports', path: '/admin/reports', icon: FileBarChart },
  { label: 'Notifications', path: '/admin/notifications', icon: Bell, badgeKey: 'unreadNotifications' },
  { label: 'Settings', path: '/admin/settings', icon: Settings },
  { label: 'Users & Access', path: '/admin/users', icon: ShieldCheck },
];

/** Modules other than the dashboard itself, used to register placeholder routes. */
export const ADMIN_MODULES = ADMIN_NAV.filter((item) => !item.end);

export const findNavItem = (pathname) =>
  ADMIN_NAV.find((item) => (item.end ? item.path === pathname : pathname.startsWith(item.path)));
