import '@/styles/globals.css';
import { ToastProvider } from '@/components/ui/Toast';
export const metadata = { title: 'IIS Super Admin' };
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
