import axios from 'axios';
import { getAccessToken, setAccessToken, clearAccessToken } from '../utils/storage';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const axiosClient = axios.create({
  baseURL,
  withCredentials: true, // sends the httpOnly refresh cookie
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

axiosClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Silently renews an expired access token once, then replays the request.
let refreshPromise = null;

axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const isAuthRoute = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');

    if (status === 401 && original && !original._retried && !isAuthRoute) {
      original._retried = true;
      try {
        refreshPromise = refreshPromise || axiosClient.post('/auth/refresh');
        const { data } = await refreshPromise;
        refreshPromise = null;
        setAccessToken(data.data.accessToken);
        return axiosClient(original);
      } catch (refreshError) {
        refreshPromise = null;
        clearAccessToken();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

/** Normalises any failure into `{ code, message, details }` for the UI. */
export function toApiError(error) {
  const payload = error?.response?.data?.error;
  if (payload) return payload;
  if (error?.code === 'ECONNABORTED') {
    return { code: 'TIMEOUT', message: 'The server took too long to respond. Try again.' };
  }
  if (!error?.response) {
    return { code: 'NETWORK', message: 'Cannot reach the server. Check your connection.' };
  }
  return { code: 'UNKNOWN', message: 'Something went wrong. Try again.' };
}

export default axiosClient;
