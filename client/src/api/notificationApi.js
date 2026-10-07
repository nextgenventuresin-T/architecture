import axiosClient from './axiosClient';

export const notificationApi = {
  list: async (params = {}) => {
    const { data } = await axiosClient.get('/notifications', { params });
    return data.data;
  },

  unreadCount: async () => {
    const { data } = await axiosClient.get('/notifications/unread-count');
    return data.data.unreadCount;
  },

  markAsRead: async (id) => {
    const { data } = await axiosClient.patch(`/notifications/${id}/read`);
    return data.data.notification;
  },

  markAllAsRead: async () => {
    const { data } = await axiosClient.post('/notifications/mark-all-read');
    return data.data;
  },

  delete: async (id) => {
    const { data } = await axiosClient.delete(`/notifications/${id}`);
    return data.data;
  },

  clearRead: async () => {
    const { data } = await axiosClient.delete('/notifications/clear-read');
    return data.data;
  },

  create: async (payload) => {
    const { data } = await axiosClient.post('/notifications', payload);
    return data.data.notification;
  },
};

export default notificationApi;
