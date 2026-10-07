/** Shared option lists and labels for the Users & Access screens. */

export const USER_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export const USER_STATUS_LABELS = Object.fromEntries(
  USER_STATUS_OPTIONS.map((s) => [s.value, s.label])
);

export const USER_STATUS_TONE = { active: 'positive', inactive: 'neutral' };

/** Matches the five actions seeded into `permissions`. */
export const PERMISSION_ACTIONS = [
  { value: 'view', label: 'View' },
  { value: 'create', label: 'Create' },
  { value: 'edit', label: 'Edit' },
  { value: 'delete', label: 'Delete' },
  { value: 'approve', label: 'Approve' },
];

/** Readable names for the module slugs stored in `permissions.module`. */
export const MODULE_LABELS = {
  dashboard: 'Dashboard',
  projects: 'Projects / Sites',
  contractors: 'Contractors',
  employees: 'Employees',
  materials: 'Materials',
  procurement: 'Procurement',
  warehouse: 'Warehouse',
  finance: 'Finance',
  hr: 'HR',
  approvals: 'Approvals',
  reports: 'Reports',
  notifications: 'Notifications',
  documents: 'Documents',
  settings: 'Settings',
  users: 'Users & Access',
};

export const moduleLabel = (slug) =>
  MODULE_LABELS[slug] ?? (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : '—');

export const ROLE_TONE = {
  admin: 'brand',
  finance: 'positive',
  hr: 'warning',
  procurement: 'brand',
  warehouse: 'brand',
  contractor: 'neutral',
  employee: 'neutral',
};

/** Mirrors userAccessService.assertPassword so the UI warns before the API does. */
export const MIN_PASSWORD_LENGTH = 12;

export function passwordProblem(password) {
  if (!password) return 'Enter a password.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/].filter((re) => re.test(password)).length;
  if (classes < 2) return 'Mix upper case, lower case and numbers.';
  return null;
}
