/** Status/priority vocabulary for HR & Labour Management, mirrored from
 * server/src/services/labourRequestService.js and leaveService.js so labels
 * and allowed transitions never drift from what the API will actually accept. */

export const LABOUR_REQUEST_STATUS_LABELS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  PARTIALLY_ASSIGNED: 'Partially assigned',
  FULLY_ASSIGNED: 'Fully assigned',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

export const LABOUR_REQUEST_STATUS_TONE = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  UNDER_REVIEW: 'warning',
  APPROVED: 'brand',
  PARTIALLY_ASSIGNED: 'brand',
  FULLY_ASSIGNED: 'positive',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  COMPLETED: 'positive',
};

export const REQUEST_TRANSITIONS = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['PARTIALLY_ASSIGNED', 'FULLY_ASSIGNED', 'CANCELLED'],
  PARTIALLY_ASSIGNED: ['FULLY_ASSIGNED', 'CANCELLED'],
  FULLY_ASSIGNED: ['COMPLETED'],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
};

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export const PRIORITY_TONE = {
  low: 'neutral',
  medium: 'brand',
  high: 'warning',
  urgent: 'danger',
};

export const ASSIGNMENT_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const ASSIGNMENT_STATUS_TONE = {
  active: 'positive',
  completed: 'brand',
  cancelled: 'neutral',
};

export const WORKER_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export const ATTENDANCE_STATUS_OPTIONS = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'HALF_DAY', label: 'Half day' },
  { value: 'LEAVE', label: 'Leave' },
];

export const ATTENDANCE_STATUS_TONE = {
  PRESENT: 'positive',
  ABSENT: 'danger',
  HALF_DAY: 'warning',
  LEAVE: 'neutral',
};

export const LEAVE_TYPE_OPTIONS = [
  { value: 'casual', label: 'Casual' },
  { value: 'sick', label: 'Sick' },
  { value: 'earned', label: 'Earned' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'other', label: 'Other' },
];

export const LEAVE_STATUS_TONE = {
  PENDING: 'warning',
  APPROVED: 'positive',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

export const LEAVE_TRANSITIONS = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
};

export const LABOUR_TYPE_OPTIONS = [
  { value: 'company', label: 'Company employee' },
  { value: 'contractor', label: 'Contractor worker' },
];
