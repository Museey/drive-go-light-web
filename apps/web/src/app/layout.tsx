import type { Metadata } from 'next';
import { IBM_Plex_Sans_Thai, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

/**
 * ฟอนต์ของทั้งระบบ (24 พ.ย. 2569 — ผู้ใช้เลือกให้เหมือน drivegox.com)
 *
 *   Plus Jakarta Sans    ตัวอักษรละตินและตัวเลข
 *   IBM Plex Sans Thai   ตัวอักษรไทย
 *
 * โหลดผ่าน next/font ซึ่ง**ดาวน์โหลดไฟล์ฟอนต์มาตอน build แล้วเสิร์ฟจากโดเมนของเราเอง**
 * เบราว์เซอร์ของผู้ใช้จึงไม่ต้องติดต่อ Google เลย — ตรงกับที่นโยบายข้อมูลส่วนบุคคลบอกไว้ว่า
 * ไม่ส่งข้อมูลไปให้บริการภายนอก และใช้งานได้แม้เครือข่ายของอู่บล็อกโดเมนภายนอก
 * ทั้งสองตัวเป็นฟอนต์เปิด (SIL Open Font License) ใช้เชิงพาณิชย์ได้
 *
 * ผูกเป็นตัวแปร CSS แล้วให้ globals.css เป็นคนเรียงลำดับ — โหลดไม่ได้ก็ตกไปใช้ฟอนต์ของเครื่อง
 */
const latin = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-latin',
  display: 'swap',
});

const thai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-thai',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DriveGoLight! — ระบบบริหารงานอู่ซ่อมรถยนต์',
  description: 'ระบบบริหารงานอู่ซ่อมรถยนต์',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${latin.variable} ${thai.variable}`}>
      <body>{children}</body>
    </html>
  );
}
