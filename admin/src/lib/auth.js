import Cookies from 'js-cookie';
import api from './api';

export async function login(email, password) {
  const { data } = await api.post('/auth/login', { email, password });
  if (data.role !== 'super_admin') throw new Error('Not a super admin account');
  Cookies.set('admin_access_token', data.access_token, { expires: 1 });
  Cookies.set('admin_refresh_token', data.refresh_token, { expires: 7 });
  Cookies.set('admin_user', JSON.stringify(data.user), { expires: 1 });
  return data;
}

export async function logout() {
  try { await api.post('/auth/logout', { refresh_token: Cookies.get('admin_refresh_token') }); } catch {}
  Cookies.remove('admin_access_token');
  Cookies.remove('admin_refresh_token');
  Cookies.remove('admin_user');
  window.location.href = '/login';
}

export function getUser() {
  try { return JSON.parse(Cookies.get('admin_user') || 'null'); } catch { return null; }
}

export function isAuthenticated() {
  return !!Cookies.get('admin_access_token');
}
