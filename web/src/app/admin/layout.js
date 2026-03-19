'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getRole } from '@/lib/auth';
import AdminSidebar from '@/components/admin/Sidebar';

export default function AdminLayout({ children }) {
  const router = useRouter();
  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    if (getRole() !== 'super_admin') { router.replace('/dashboard'); }
  }, []);
  return (
    <div className="app-layout">
      <AdminSidebar />
      <main className="main-content">
        <div className="page-body">{children}</div>
      </main>
    </div>
  );
}
