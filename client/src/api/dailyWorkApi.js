import axiosClient from './axiosClient';

export const dailyWorkApi = {
  list: (params) => axiosClient.get('/daily-work', { params }).then((r) => r.data.data),
  detail: (id) => axiosClient.get(`/daily-work/${id}`).then((r) => r.data.data.update),
  create: (formData) =>
    axiosClient
      .post('/daily-work', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data.update),
  photoUrl: (id) => `/api/daily-work/photos/${id}`,
};

export default dailyWorkApi;
