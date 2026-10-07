/** Shared option lists and label maps for the Employee Management screens. */

export const EMPLOYEE_TYPES = [
  { value: 'full-time', label: 'Full time' },
  { value: 'part-time', label: 'Part time' },
  { value: 'contract', label: 'Contract' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'intern', label: 'Intern' },
  { value: 'daily-wage', label: 'Daily wage' },
];

export const EMPLOYEE_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'on-leave', label: 'On leave' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'resigned', label: 'Resigned' },
];

export const EMPLOYEE_STATUS_TONE = {
  active: 'positive',
  'on-leave': 'warning',
  inactive: 'neutral',
  resigned: 'danger',
};

export const EMPLOYEE_TYPE_LABELS = Object.fromEntries(EMPLOYEE_TYPES.map((t) => [t.value, t.label]));

export const EMPLOYEE_STATUS_LABELS = Object.fromEntries(EMPLOYEE_STATUSES.map((s) => [s.value, s.label]));

/**
 * Statuses that keep someone selectable in Interface 3's project team pickers.
 * Mirrors ACTIVE_STATUSES in server/src/services/employeeService.js.
 */
export const ROSTERED_STATUSES = ['active', 'on-leave'];
