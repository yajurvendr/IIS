'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      if (data.role === 'super_admin') {
        window.location.href = process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:3001';
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      toast(err.response?.data?.detail || err.response?.data?.error || 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 60%, #312E81 100%)',
    }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#6366F1', letterSpacing: '-1px' }}>IIS</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>Inventory Intelligence System</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email" className="form-input" placeholder="you@company.com"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password" className="form-input" placeholder="••••••••"
              value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
          </div>
          <button
            type="submit" className="btn btn-primary" disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '12px 16px', fontSize: 15 }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--color-text-muted)' }}>
          Contact your administrator for access.
        </p>
      </div>
    </div>
  );
}
