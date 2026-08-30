import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DriveGoLight! — ระบบบริหารงานอู่ซ่อมรถยนต์',
  description: 'ระบบบริหารงานอู่ซ่อมรถยนต์',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
