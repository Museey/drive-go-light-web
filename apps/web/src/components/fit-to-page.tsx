'use client';

import { useEffect } from 'react';

/**
 * แบบฟอร์มเปล่า: ปรับให้พอดีกระดาษ A4 หนึ่งแผ่นอัตโนมัติ (ผู้ใช้กำหนด)
 * 1) ถ้าสูงเกิน 297mm ตัดบรรทัดว่างท้ายตาราง (tr ที่มี td.blank) ออกทีละบรรทัด
 * 2) ถ้ายังเกิน (ฟอร์มไม่มีบรรทัดว่างให้ตัด เช่นใบรับรถ) ย่อขนาดตัวอักษรทีละ 2% จนพอดี (ต่ำสุด 80%)
 * ทำงานทั้งตอนแสดงบนจอและก่อนสั่งพิมพ์ (beforeprint)
 */
export function FitToPage() {
  useEffect(() => {
    const A4 = 297 * 96 / 25.4;   // px ที่ 96dpi
    const fit = () => {
      document.querySelectorAll<HTMLElement>('.paper').forEach((paper) => {
        paper.style.fontSize = '';
        let guard = 200;
        while (paper.scrollHeight > A4 + 2 && guard-- > 0) {
          const blank = [...paper.querySelectorAll('table.doc tbody tr')].reverse().find((tr) => tr.querySelector('td.blank'));
          if (blank && paper.querySelectorAll('table.doc tbody tr').length > 3) { blank.remove(); continue; }
          const cur = parseFloat(getComputedStyle(paper).fontSize);
          const base = parseFloat(paper.dataset.baseFs ?? String(cur));
          if (!paper.dataset.baseFs) paper.dataset.baseFs = String(cur);
          const next = cur * 0.98;
          if (next < base * 0.8) break;
          paper.style.fontSize = `${next}px`;
        }
      });
    };
    fit();
    window.addEventListener('beforeprint', fit);
    window.addEventListener('resize', fit);
    return () => { window.removeEventListener('beforeprint', fit); window.removeEventListener('resize', fit); };
  }, []);
  return null;
}
