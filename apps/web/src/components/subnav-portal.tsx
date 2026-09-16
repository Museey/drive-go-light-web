'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * เดสก์ท็อป: ย้ายแถบเมนูย่อยขึ้นไปอยู่ "แถวหัวหน้า" ต่อจากชื่อหน้า (ผู้ใช้ยืนยัน)
 * มือถือ/แท็บเล็ต: อยู่ที่เดิมใต้หัวหน้า
 *
 * Shell วางช่องว่าง #topbar-subnav ไว้ในแถวหัวหน้า ตัวนี้ portal เมนูย่อยเข้าไปเมื่อจอ ≥1280
 * ตอน render บนเซิร์ฟเวอร์ยังอยู่ที่เดิม (hydrate ตรงกัน) แล้วค่อยย้ายเมื่อรู้ขนาดจอ
 *
 * **ตัวเลขนี้ต้องเท่ากับจุดตัดใน globals.css เสมอ** — ตอนย้ายจุดตัดเป็น 1280 (16 ก.ย. 2569)
 * ลืมแก้ตรงนี้ แท็บเล็ตจึงมีเมนูย่อยลอยไปอยู่ในหัวหน้าโดยไม่มีกฎ CSS รองรับ
 * หัวหน้าสูง 246px ที่ /income/walkin (e2e responsive.spec จับได้)
 */
export function SubnavPortal({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const pick = () => setSlot(mq.matches ? document.getElementById('topbar-subnav') : null);
    pick();
    mq.addEventListener('change', pick);
    return () => mq.removeEventListener('change', pick);
  }, []);
  return slot ? createPortal(children, slot) : <>{children}</>;
}
