import Cookies from 'js-cookie';
import api from './api';

export async function login(email, password) {
  const { data } = await api.post('/auth/login', { email, password });
  Cookies.set('access_token', data.access_token, { expires: 1 });
  Cookies.set('refresh_token', data.refresh_token, { expires: 7 });
  Cookies.set('user', JSON.stringify(data.user), { expires: 1 });
  Cookies.set('role', data.role, { expires: 1 });
  if (data.tenant) Cookies.set('tenant', JSON.stringify(data.tenant), { expires: 1 });
  return data;
}

export async function logout() {
  try {
    const refreshToken = Cookies.get('refresh_token');
    if (refreshToken) await api.post('/auth/logout', { refresh_token: refreshToken });
  } catch {}
  Cookies.remove('access_token');
  Cookies.remove('refresh_token');
  Cookies.remove('user');
  Cookies.remove('role');
  Cookies.remove('tenant');
  window.location.href = '/login';
}

export function getUser() {
  try { return JSON.parse(Cookies.get('user') || 'null'); } catch { return null; }
}

export function getTenant() {
  try { return JSON.parse(Cookies.get('tenant') || 'null'); } catch { return null; }
}

export function getRole() {
  return Cookies.get('role') || null;
}

export function isAuthenticated() {
  return !!Cookies.get('access_token');
}
