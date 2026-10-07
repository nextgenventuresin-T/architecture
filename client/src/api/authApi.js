import axiosClient from './axiosClient';

/** All authentication calls live here — components never call axios directly. */
export const authApi = {
  login: ({ identifier, password, remember }) =>
    axiosClient.post('/auth/login', { identifier, password, remember }).then((r) => r.data.data),

  refresh: () => axiosClient.post('/auth/refresh').then((r) => r.data.data),

  logout: () => axiosClient.post('/auth/logout').then((r) => r.data.data),

  me: () => axiosClient.get('/auth/me').then((r) => r.data.data.user),
};

export default authApi;
