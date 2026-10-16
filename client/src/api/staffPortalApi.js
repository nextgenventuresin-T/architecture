import axiosClient from './axiosClient';

const data = (r) => r.data.data;

/** "My Portal": the signed-in user's own attendance and leave. */
export const myPortalApi = {
  today: () => axiosClient.get('/my-portal/today').then(data),
  checkIn: (note) => axiosClient.post('/my-portal/check-in', { note: note || null }).then(data),
  checkOut: (note) => axiosClient.post('/my-portal/check-out', { note: note || null }).then(data),
  month: (month) => axiosClient.get('/my-portal/attendance', { params: { month } }).then(data),
  leaves: () => axiosClient.get('/my-portal/leaves').then(data),
  applyLeave: (payload) => axiosClient.post('/my-portal/leaves', payload).then(data),
  cancelLeave: (id) => axiosClient.post(`/my-portal/leaves/${id}/cancel`).then(data),
};

/** Admin / HR: everyone's attendance and leave. */
export const staffAttendanceApi = {
  board: (date) => axiosClient.get('/staff-attendance/board', { params: { date } }).then(data),
  report: (month) => axiosClient.get('/staff-attendance/report', { params: { month } }).then(data),
  userMonth: (userId, month) => axiosClient.get(`/staff-attendance/users/${userId}/month`, { params: { month } }).then(data),
  correct: (userId, date, payload) => axiosClient.put(`/staff-attendance/users/${userId}/days/${date}`, payload).then(data),
  leaves: (status) => axiosClient.get('/staff-attendance/leaves', { params: { status } }).then(data),
  decide: (id, decision, note) => axiosClient.post(`/staff-attendance/leaves/${id}/${decision}`, { note: note || null }).then(data),
};
