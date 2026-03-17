import axios from 'axios';
import Cookies from 'js-cookie';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = Cookies.get('admin_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const rt = Cookies.get('admin_refresh_token');
        if (!rt) throw new Error('no rt');
        const { data } = await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/auth/refresh`, { refresh_token: rt });
        Cookies.set('admin_access_token', data.access_token, { expires: 1 });
        Cookies.set('admin_refresh_token', data.refresh_token, { expires: 7 });
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch {
        Cookies.remove('admin_access_token');
        Cookies.remove('admin_refresh_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
