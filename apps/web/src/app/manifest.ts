import type { MetadataRoute } from 'next';

/**
 * ข้อมูลแอปตอนเพิ่มลงหน้าจอโฮม (ผู้ใช้ส่งโลโก้และเลือกชื่อ 18 ก.ย. 2569)
 *
 * ไอคอนสร้างจาก `brand/logo-source.jpg` ด้วย `tools/make-icons.mjs`
 * แท็บเบราว์เซอร์ใช้ `app/icon.png` · iPhone ใช้ `app/apple-icon.png` (Next ใส่ลิงก์ให้เอง)
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DriveGoLight!',
    short_name: 'DriveGoLight!',
    description: 'ระบบบริหารงานอู่ซ่อมรถ',
    lang: 'th',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    /* สีแถบบนของระบบ (--brand ใน globals.css) */
    theme_color: '#0F5C3E',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
