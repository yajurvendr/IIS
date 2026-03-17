import '@/styles/globals.css';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata = {
  title: 'IIS — Inventory Intelligence System',
  description: 'Multi-tenant inventory management for automobile parts retailers',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
