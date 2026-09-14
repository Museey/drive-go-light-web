'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * แท็บเล็ต/เดสก์ท็อป: ย้ายแถบเมนูย่อยขึ้นไปอยู่ "แถวหัวหน้า" ต่อจากชื่อหน้า (ผู้ใช้ยืนยัน)
 * มือถือ: อยู่ที่เดิมใต้หัวหน้า
 *
 * Shell วางช่องว่าง #topbar-subnav ไว้ในแถวหัวหน้า ตัวนี้ portal เมนูย่อยเข้าไปเมื่อจอ ≥768
 * ตอน render บนเซิร์ฟเวอร์ยังอยู่ที่เดิม (hydrate ตรงกัน) แล้วค่อยย้ายเมื่อรู้ขนาดจอ
 */
export function SubnavPortal({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const pick = () => setSlot(mq.matches ? document.getElementById('topbar-subnav') : null);
    pick();
    mq.addEventListener('change', pick);
    return () => mq.removeEventListener('change', pick);
  }, []);
  return slot ? createPortal(children, slot) : <>{children}</>;
}
