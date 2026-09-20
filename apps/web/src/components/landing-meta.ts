import type { Metadata } from 'next';

/**
 * แท็กสำหรับเครื่องมือค้นหาและตอนแปะลิงก์ลงแชต — ใช้ร่วมกันระหว่าง `/` และ `/welcome`
 *
 * แยกจากคอมโพเนนต์เพราะ Next อ่าน metadata คนละรอบกับตอนเรนเดอร์หน้า
 * และสองเส้นทางนี้ต้องได้ข้อความชุดเดียวกัน ไม่งั้นแชร์คนละลิงก์แล้วขึ้นคนละเรื่อง
 *
 * `metadataBase` อ่านจาก APP_URL ตัวเดียวกับที่คอนโซลใช้ประกอบลิงก์ตั้งรหัสผ่าน (render.yaml)
 * ถ้าไม่ได้ตั้ง ใช้โดเมนจริงเป็นค่าตั้งต้น — รูปใน Open Graph ต้องเป็น URL เต็มเสมอ
 */
const BASE = process.env.APP_URL ?? 'https://app.drivegolight.com';

const TITLE = 'DriveGoLight! — ระบบบริหารงานอู่ซ่อมรถยนต์';

const DESC =
  'จัดการงานอู่ซ่อมรถทั้งอู่ในที่เดียว ใบเสนอราคา ใบส่งมอบงาน ใบกำกับภาษี ใบเสร็จ ใบวางบิล ' +
  'สต๊อกอะไหล่ ลูกหนี้ เจ้าหนี้ และกำไรขาดทุน รองรับภาษีมูลค่าเพิ่มและภาษีหัก ณ ที่จ่าย ' +
  'ใช้ได้ทั้งมือถือ แท็บเล็ต และคอมพิวเตอร์ ไม่ต้องติดตั้งโปรแกรม';

export const landingMetadata: Metadata = {
  metadataBase: new URL(BASE),
  title: TITLE,
  description: DESC,
  keywords: [
    'โปรแกรมอู่ซ่อมรถ', 'ระบบจัดการอู่', 'โปรแกรมบริหารอู่ซ่อมรถยนต์',
    'ออกใบกำกับภาษี', 'ใบเสนอราคา', 'สต๊อกอะไหล่',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'th_TH',
    siteName: 'DriveGoLight!',
    url: '/',
    title: TITLE,
    description: DESC,
    /* ยังเป็นไอคอนแอปสี่เหลี่ยมจัตุรัส ไม่ใช่ภาพหน้าปกขนาด 1200×630 — เปลี่ยนได้เมื่อมีภาพจริง */
    images: [{ url: '/icon-512.png', width: 512, height: 512, alt: 'DriveGoLight!' }],
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESC,
    images: ['/icon-512.png'],
  },
};
