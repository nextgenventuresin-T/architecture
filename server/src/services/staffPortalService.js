'use strict';

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const notificationModel = require('../models/notificationModel');
const { ROLES } = require('../config/roles');
const RULES = require('../config/staffPortal');

/**
 * "My Portal" - self-service daily attendance (check-in / check-out with the time
 * captured by the SERVER clock) and leave applications, for every login. Admin and
 * HR see everyone's attendance, decide leave and can correct a day's times.
 *
 * Dates and "late" are judged in the company's time zone (APP_TZ, default India),
 * whatever time zone the server itself runs in.
 */
const TZ = process.env.APP_TZ || 'Asia/Kolkata';
const MANAGER_ROLES = [ROLES.ADMIN, ROLES.HR];

/** YYYY-MM-DD and HH:MM of a moment, in the company time zone. */
function localParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}` };
}
const today = () => localParts().date;
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(v));
const dayCount = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
const toDateStr = (v) => (v instanceof Date
  ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  : String(v).slice(0, 10));

function toAttendance(row) {
  if (!row) return null;
  const minutes = row.work_minutes != null
    ? Number(row.work_minutes)
    : (row.check_in_at && !row.check_out_at ? Math.max(0, Math.round((Date.now() - new Date(row.check_in_at)) / 60000)) : null);
  return {
    id: row.id,
    userId: row.user_id,
    date: toDateStr(row.attendance_date),
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    workMinutes: minutes,
    isOpen: Boolean(row.check_in_at && !row.check_out_at),
    status: row.status,
    isLate: Boolean(row.is_late),
    checkInNote: row.check_in_note,
    checkOutNote: row.check_out_note,
    corrected: Boolean(row.corrected_by),
    correctionNote: row.correction_note,
  };
}

function toLeave(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name || null,
    userRole: row.role_slug || null,
    leaveType: row.leave_type,
    leaveTypeLabel: RULES.LEAVE_TYPES[row.leave_type] || row.leave_type,
    startDate: toDateStr(row.start_date),
    endDate: toDateStr(row.end_date),
    halfDay: Boolean(row.half_day),
    days: Number(row.days),
    reason: row.reason,
    status: row.status,
    decidedBy: row.decided_by ? { id: row.decided_by, name: row.decided_by_name || null } : null,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
  };
}

async function approvedLeaveOn(userId, date) {
  const [[row]] = await pool.query(
    "SELECT * FROM staff_leaves WHERE user_id = ? AND status = 'approved' AND ? BETWEEN start_date AND end_date LIMIT 1",
    [userId, date]
  );
  return row || null;
}

// ------------------------------------------------------------------ my portal

async function getToday(userId) {
  const date = today();
  const [[row]] = await pool.query('SELECT * FROM staff_attendance WHERE user_id = ? AND attendance_date = ?', [userId, date]);
  const leave = await approvedLeaveOn(userId, date);
  const [upcoming] = await pool.query(
    `SELECT * FROM staff_leaves WHERE user_id = ? AND status IN ('pending', 'approved') AND end_date >= ?
     ORDER BY start_date LIMIT 5`,
    [userId, date]
  );
  return {
    date,
    serverTime: new Date().toISOString(),
    timeZone: TZ,
    rules: { workStart: RULES.WORK_START, lateAfter: RULES.LATE_AFTER, halfDayMinutes: RULES.HALF_DAY_MINUTES },
    leaveTypes: RULES.LEAVE_TYPES,
    attendance: toAttendance(row),
    onLeave: leave ? toLeave(leave) : null,
    upcomingLeaves: upcoming.map(toLeave),
  };
}

async function checkIn(userId, note) {
  const now = new Date();
  const { date, time } = localParts(now);
  const leave = await approvedLeaveOn(userId, date);
  if (leave && !leave.half_day) {
    throw ApiError.badRequest('You are on approved leave today. Withdraw the leave first if you are working.');
  }
  const [[existing]] = await pool.query('SELECT * FROM staff_attendance WHERE user_id = ? AND attendance_date = ?', [userId, date]);
  if (existing?.check_in_at) throw ApiError.badRequest('You have already checked in today.');
  const late = time > RULES.LATE_AFTER ? 1 : 0;
  try {
    await pool.query(
      `INSERT INTO staff_attendance (user_id, attendance_date, check_in_at, status, is_late, check_in_note)
       VALUES (?, ?, ?, 'present', ?, ?)`,
      [userId, date, now, late, note ? String(note).slice(0, 255) : null]
    );
  } catch (e) {
    // Two taps at once: the unique (user, day) key lets only one through.
    if (e.code === 'ER_DUP_ENTRY') throw ApiError.badRequest('You have already checked in today.');
    throw e;
  }
  return getToday(userId);
}

async function checkOut(userId, note) {
  const now = new Date();
  const { date } = localParts(now);
  const [[row]] = await pool.query('SELECT * FROM staff_attendance WHERE user_id = ? AND attendance_date = ?', [userId, date]);
  if (!row?.check_in_at) throw ApiError.badRequest('Check in first - you have not checked in today.');
  if (row.check_out_at) throw ApiError.badRequest('You have already checked out today.');
  const minutes = Math.max(0, Math.round((now - new Date(row.check_in_at)) / 60000));
  const status = minutes < RULES.HALF_DAY_MINUTES ? 'half_day' : 'present';
  const [res] = await pool.query(
    `UPDATE staff_attendance SET check_out_at = ?, work_minutes = ?, status = ?, check_out_note = ?
     WHERE id = ? AND check_out_at IS NULL`,
    [now, minutes, status, note ? String(note).slice(0, 255) : null, row.id]
  );
  if (!res.affectedRows) throw ApiError.badRequest('You have already checked out today.');
  return getToday(userId);
}

/** One month of a user's attendance and leave, with totals. */
async function monthFor(userId, month) {
  const m = /^\d{4}-\d{2}$/.test(String(month || '')) ? month : today().slice(0, 7);
  const from = `${m}-01`;
  const last = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
  const to = `${m}-${String(last).padStart(2, '0')}`;
  const [rows] = await pool.query(
    'SELECT * FROM staff_attendance WHERE user_id = ? AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date',
    [userId, from, to]
  );
  const [leaves] = await pool.query(
    `SELECT * FROM staff_leaves WHERE user_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?`,
    [userId, to, from]
  );
  const records = rows.map(toAttendance);
  const leaveDays = leaves.reduce((sum, l) => {
    const s = toDateStr(l.start_date) < from ? from : toDateStr(l.start_date);
    const e = toDateStr(l.end_date) > to ? to : toDateStr(l.end_date);
    return sum + (l.half_day ? 0.5 : dayCount(s, e));
  }, 0);
  return {
    month: m,
    records,
    leaves: leaves.map(toLeave),
    summary: {
      present: records.filter((r) => r.status === 'present').length,
      halfDays: records.filter((r) => r.status === 'half_day').length,
      late: records.filter((r) => r.isLate).length,
      leaveDays,
      workMinutes: records.reduce((s, r) => s + (r.checkOutAt ? Number(r.workMinutes || 0) : 0), 0),
    },
  };
}

async function myLeaves(userId) {
  const [rows] = await pool.query(
    `SELECT l.*, d.full_name AS decided_by_name FROM staff_leaves l LEFT JOIN users d ON d.id = l.decided_by
     WHERE l.user_id = ? ORDER BY l.start_date DESC, l.id DESC LIMIT 100`,
    [userId]
  );
  const year = today().slice(0, 4);
  const [taken] = await pool.query(
    `SELECT leave_type, SUM(days) AS days FROM staff_leaves
     WHERE user_id = ? AND status = 'approved' AND YEAR(start_date) = ? GROUP BY leave_type`,
    [userId, year]
  );
  return {
    leaves: rows.map(toLeave),
    takenThisYear: Object.fromEntries(taken.map((t) => [t.leave_type, Number(t.days)])),
    leaveTypes: RULES.LEAVE_TYPES,
  };
}

async function applyLeave(userId, payload) {
  const type = String(payload.leave_type || '');
  if (!RULES.LEAVE_TYPES[type]) throw ApiError.badRequest('Check the highlighted fields.', { leave_type: 'Choose a leave type.' });
  const start = payload.start_date;
  const halfDay = Boolean(payload.half_day);
  const end = halfDay ? start : payload.end_date;
  if (!isDate(start)) throw ApiError.badRequest('Check the highlighted fields.', { start_date: 'Enter the first day of leave.' });
  if (!isDate(end)) throw ApiError.badRequest('Check the highlighted fields.', { end_date: 'Enter the last day of leave.' });
  if (end < start) throw ApiError.badRequest('Check the highlighted fields.', { end_date: 'The last day cannot be before the first day.' });
  const earliest = new Date(Date.parse(today()) - RULES.MAX_BACKDATED_LEAVE_DAYS * 86400000).toISOString().slice(0, 10);
  if (start < earliest) {
    throw ApiError.badRequest('Check the highlighted fields.', { start_date: `Leave can be recorded at most ${RULES.MAX_BACKDATED_LEAVE_DAYS} days back.` });
  }
  if (dayCount(start, end) > 90) throw ApiError.badRequest('Check the highlighted fields.', { end_date: 'A single application can cover at most 90 days.' });
  const reason = String(payload.reason || '').trim();
  if (!reason) throw ApiError.badRequest('Check the highlighted fields.', { reason: 'Give a reason for the leave.' });

  const [overlap] = await pool.query(
    `SELECT id, start_date, end_date FROM staff_leaves
     WHERE user_id = ? AND status IN ('pending', 'approved') AND start_date <= ? AND end_date >= ? LIMIT 1`,
    [userId, end, start]
  );
  if (overlap.length) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      start_date: `You already have leave from ${toDateStr(overlap[0].start_date)} to ${toDateStr(overlap[0].end_date)} on these dates.`,
    });
  }
  const days = halfDay ? 0.5 : dayCount(start, end);
  const [res] = await pool.query(
    `INSERT INTO staff_leaves (user_id, leave_type, start_date, end_date, half_day, days, reason, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [userId, type, start, end, halfDay ? 1 : 0, days, reason.slice(0, 2000)]
  );

  const [[u]] = await pool.query('SELECT full_name FROM users WHERE id = ?', [userId]);
  const message = `${u?.full_name || 'A user'} applied for ${RULES.LEAVE_TYPES[type].toLowerCase()}: `
    + `${start}${end !== start ? ` to ${end}` : ''} (${days} day${days === 1 ? '' : 's'}). Reason: ${reason.slice(0, 200)}`;
  for (const role of MANAGER_ROLES) {
    await notificationModel.create({
      role, title: 'Leave request', message, type: 'approval', category: 'approval',
      actionUrl: role === ROLES.ADMIN ? '/admin/staff-attendance?tab=leaves' : '/hr/staff-attendance?tab=leaves',
      metadata: { module: 'staff_leave', leaveId: res.insertId, userId },
    }).catch((e) => console.error('Failed to notify leave request:', e.message));
  }
  return myLeaves(userId);
}

async function cancelLeave(userId, leaveId) {
  const [[row]] = await pool.query('SELECT * FROM staff_leaves WHERE id = ? AND user_id = ?', [leaveId, userId]);
  if (!row) throw ApiError.notFound('That leave application does not exist.');
  const startsLater = toDateStr(row.start_date) > today();
  if (!(row.status === 'pending' || (row.status === 'approved' && startsLater))) {
    throw ApiError.badRequest('Only a pending leave, or an approved one that has not started yet, can be withdrawn.');
  }
  await pool.query("UPDATE staff_leaves SET status = 'cancelled' WHERE id = ?", [leaveId]);
  return myLeaves(userId);
}

// ------------------------------------------------------------- admin / HR side

/** Everyone who can sign in, with their attendance / leave on one day. */
async function board(date) {
  const day = isDate(date) ? date : today();
  const [users] = await pool.query(
    `SELECT u.id, u.full_name, u.email, r.slug AS role_slug
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.is_active = 1 ORDER BY u.full_name`
  );
  const [rows] = await pool.query('SELECT * FROM staff_attendance WHERE attendance_date = ?', [day]);
  const [leaves] = await pool.query(
    "SELECT * FROM staff_leaves WHERE status = 'approved' AND ? BETWEEN start_date AND end_date",
    [day]
  );
  const byUser = new Map(rows.map((r) => [Number(r.user_id), r]));
  const leaveByUser = new Map(leaves.map((l) => [Number(l.user_id), l]));
  const people = users.map((u) => {
    const att = toAttendance(byUser.get(Number(u.id)));
    const leave = leaveByUser.get(Number(u.id));
    const state = att?.checkInAt
      ? (att.isOpen ? 'working' : (att.status === 'half_day' ? 'half_day' : 'present'))
      : (leave ? 'on_leave' : 'absent');
    return {
      userId: u.id, name: u.full_name, email: u.email, role: u.role_slug,
      state, attendance: att, leave: leave ? toLeave(leave) : null,
    };
  });
  const count = (s) => people.filter((p) => p.state === s).length;
  return {
    date: day,
    isToday: day === today(),
    people,
    summary: {
      total: people.length,
      working: count('working'),
      present: count('present'),
      halfDay: count('half_day'),
      onLeave: count('on_leave'),
      absent: count('absent'),
      late: people.filter((p) => p.attendance?.isLate).length,
    },
  };
}

async function allLeaves(status) {
  const where = status && status !== 'all' ? 'WHERE l.status = ?' : '';
  const [rows] = await pool.query(
    `SELECT l.*, u.full_name AS user_name, r.slug AS role_slug, d.full_name AS decided_by_name
     FROM staff_leaves l
     JOIN users u ON u.id = l.user_id
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN users d ON d.id = l.decided_by
     ${where}
     ORDER BY (l.status = 'pending') DESC, l.start_date DESC, l.id DESC LIMIT 300`,
    status && status !== 'all' ? [status] : []
  );
  return { leaves: rows.map(toLeave), leaveTypes: RULES.LEAVE_TYPES };
}

async function decideLeave(leaveId, decision, note, actor) {
  if (!['approved', 'rejected'].includes(decision)) throw ApiError.badRequest('Unknown decision.');
  const [[row]] = await pool.query('SELECT * FROM staff_leaves WHERE id = ?', [leaveId]);
  if (!row) throw ApiError.notFound('That leave application does not exist.');
  if (row.status !== 'pending') throw ApiError.badRequest(`This leave is already ${row.status}.`);
  if (Number(row.user_id) === Number(actor.id) && actor.role !== ROLES.ADMIN) {
    throw ApiError.forbidden('Your own leave is decided by Admin or another HR member.');
  }
  if (decision === 'rejected' && !String(note || '').trim()) {
    throw ApiError.badRequest('Check the highlighted fields.', { note: 'Give a reason for rejecting.' });
  }
  const [res] = await pool.query(
    `UPDATE staff_leaves SET status = ?, decided_by = ?, decided_at = NOW(), decision_note = ?
     WHERE id = ? AND status = 'pending'`,
    [decision, actor.id, note ? String(note).slice(0, 255) : null, leaveId]
  );
  if (!res.affectedRows) throw ApiError.badRequest('This leave was already decided.');
  const s = toDateStr(row.start_date);
  const e = toDateStr(row.end_date);
  await notificationModel.create({
    userId: row.user_id,
    title: decision === 'approved' ? 'Leave approved' : 'Leave rejected',
    message: `Your ${(RULES.LEAVE_TYPES[row.leave_type] || 'leave').toLowerCase()} for ${s}${e !== s ? ` to ${e}` : ''} was ${decision}.`
      + (note ? ` Note: ${String(note).slice(0, 200)}` : ''),
    type: decision === 'approved' ? 'success' : 'warning',
    category: 'approval',
    actionUrl: null,
    metadata: { module: 'staff_leave', leaveId: row.id, status: decision },
  }).catch((err) => console.error('Failed to notify leave decision:', err.message));
  return allLeaves('all');
}

/** Admin / HR correct a person's times for a day (forgot to check out, wrong tap...). */
async function correctAttendance(userId, date, payload, actor) {
  if (!isDate(date)) throw ApiError.badRequest('Enter a valid date.');
  const note = String(payload.note || '').trim();
  if (!note) throw ApiError.badRequest('Check the highlighted fields.', { note: 'Say why the times are being corrected.' });
  const [[user]] = await pool.query('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) throw ApiError.notFound('That user does not exist.');
  const at = (hhmm) => (hhmm ? new Date(`${date}T${hhmm}:00${tzOffset(date)}`) : null);
  const inAt = at(payload.check_in);
  const outAt = at(payload.check_out);
  if (payload.check_in && Number.isNaN(inAt?.getTime())) throw ApiError.badRequest('Check the highlighted fields.', { check_in: 'Enter a valid time.' });
  if (payload.check_out && Number.isNaN(outAt?.getTime())) throw ApiError.badRequest('Check the highlighted fields.', { check_out: 'Enter a valid time.' });
  if (outAt && !inAt) throw ApiError.badRequest('Check the highlighted fields.', { check_in: 'Enter the check-in time too.' });
  if (inAt && outAt && outAt <= inAt) throw ApiError.badRequest('Check the highlighted fields.', { check_out: 'Check-out must be after check-in.' });

  const minutes = inAt && outAt ? Math.round((outAt - inAt) / 60000) : null;
  const status = payload.status === 'absent' ? 'absent'
    : (minutes != null && minutes < RULES.HALF_DAY_MINUTES ? 'half_day' : 'present');
  const late = inAt && payload.check_in > RULES.LATE_AFTER ? 1 : 0;
  await pool.query(
    `INSERT INTO staff_attendance (user_id, attendance_date, check_in_at, check_out_at, work_minutes, status, is_late, corrected_by, correction_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE check_in_at = VALUES(check_in_at), check_out_at = VALUES(check_out_at),
       work_minutes = VALUES(work_minutes), status = VALUES(status), is_late = VALUES(is_late),
       corrected_by = VALUES(corrected_by), correction_note = VALUES(correction_note)`,
    [userId, date, payload.status === 'absent' ? null : inAt, payload.status === 'absent' ? null : outAt,
      payload.status === 'absent' ? null : minutes, status, payload.status === 'absent' ? 0 : late, actor.id, note.slice(0, 255)]
  );
  return board(date);
}

/** "+05:30" style offset of the company time zone on a date (handles DST zones too). */
function tzOffset(date) {
  const probe = new Date(`${date}T12:00:00Z`);
  const local = new Date(probe.toLocaleString('en-US', { timeZone: TZ }));
  const utc = new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' }));
  const mins = Math.round((local - utc) / 60000);
  const sign = mins >= 0 ? '+' : '-';
  const abs = Math.abs(mins);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Month totals for everyone (or one user) - the HR / Admin report. */
async function monthReport(month) {
  const m = /^\d{4}-\d{2}$/.test(String(month || '')) ? month : today().slice(0, 7);
  const [users] = await pool.query(
    `SELECT u.id, u.full_name, r.slug AS role_slug FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.is_active = 1 ORDER BY u.full_name`
  );
  const people = [];
  for (const u of users) {
    const data = await monthFor(u.id, m);
    people.push({ userId: u.id, name: u.full_name, role: u.role_slug, ...data.summary });
  }
  return { month: m, people };
}

module.exports = {
  getToday, checkIn, checkOut, monthFor, myLeaves, applyLeave, cancelLeave,
  board, allLeaves, decideLeave, correctAttendance, monthReport, MANAGER_ROLES,
};
