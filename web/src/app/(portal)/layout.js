'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getRole } from '@/lib/auth';
import Sidebar from '@/components/layout/Sidebar';
import AnnouncementBanner from '@/components/ui/AnnouncementBanner';

export default function PortalLayout({ children }) {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    if (getRole() === 'super_admin') {
      window.location.href = process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:3001';
    }
  }, []);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-body">
          <AnnouncementBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
