'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import Sidebar from '@/components/layout/Sidebar';

export default function PortalLayout({ children }) {
  const router = useRouter();
  useEffect(() => { if (!isAuthenticated()) router.replace('/login'); }, []);
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-body">{children}</div>
      </main>
    </div>
  );
}
