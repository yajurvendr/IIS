import axios from 'axios';
import Cookies from 'js-cookie';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  timeout: 30000,
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = Cookies.get('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 — try token refresh, else redirect to login
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = Cookies.get('refresh_token');
        if (!refreshToken) throw new Error('no refresh token');
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/auth/refresh`,
          { refresh_token: refreshToken }
        );
        Cookies.set('access_token', data.access_token, { expires: 1 });
        Cookies.set('refresh_token', data.refresh_token, { expires: 7 });
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch {
        Cookies.remove('access_token');
        Cookies.remove('refresh_token');
        Cookies.remove('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
