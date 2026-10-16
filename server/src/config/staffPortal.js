'use strict';

/**
 * Working-day rules for "My Portal" self-service attendance. Change them here.
 *   WORK_START       the expected start of the day (HH:MM, server time)
 *   LATE_AFTER       checking in after this is flagged "late"
 *   HALF_DAY_MINUTES less than this worked (on check-out) counts as a half day
 */
module.exports = Object.freeze({
  WORK_START: '09:30',
  LATE_AFTER: '09:45',
  HALF_DAY_MINUTES: 240,
  LEAVE_TYPES: Object.freeze({
    casual: 'Casual leave',
    sick: 'Sick leave',
    earned: 'Earned / privilege leave',
    unpaid: 'Unpaid leave',
    other: 'Other',
  }),
  // How far back a leave may start (to record a sick day taken earlier).
  MAX_BACKDATED_LEAVE_DAYS: 30,
});
