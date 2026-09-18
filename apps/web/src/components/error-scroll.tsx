'use client';

import { useEffect } from 'react';

/**
 * บันทึกไม่ผ่านแล้วพาไปหาข้อความผิดพลาด (ผู้ใช้แจ้ง 19 ก.ย. 2569)
 *
 * ฟอร์มยาว ๆ วางกล่องข้อความไว้บนสุด คนกดบันทึกจากล่างสุดจึงไม่เห็นว่าทำไมไม่ผ่าน
 * นึกว่าปุ่มเสีย — ตัวนี้เฝ้าดูว่ามีกล่อง `.err` โผล่ใหม่เมื่อไร แล้วเลื่อนเข้าจอพร้อมโฟกัสให้
 *
 * **ทำที่เดียวทั้งระบบ** แทนที่จะไล่แก้ทีละฟอร์ม (57 กล่องใน 39 ไฟล์) —
 * ฟอร์มที่เพิ่มวันหน้าได้พฤติกรรมนี้เองโดยไม่ต้องจำ
 *
 * กล่องที่มีอยู่แล้วตั้งแต่เปิดหน้าไม่นับ (เช่นหน้าที่บอกผลค้างไว้) จะได้ไม่กระตุกตอนโหลด
 */
export function ErrorScroll() {
  useEffect(() => {
    const seen = new WeakSet<Element>();
    for (const el of document.querySelectorAll('.err')) seen.add(el);

    const reveal = (el: HTMLElement) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (!el.isConnected || !el.textContent?.trim()) return;

      const r = el.getBoundingClientRect();
      const hidden = r.top < 0 || r.bottom > window.innerHeight;
      if (hidden) {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
      }
      /* โฟกัสให้ด้วย — โปรแกรมอ่านหน้าจอจะอ่านข้อความทันที และกด Tab ต่อจะอยู่ใกล้ช่องที่ผิด */
      el.setAttribute('tabindex', '-1');
      if (!el.getAttribute('role')) el.setAttribute('role', 'alert');
      el.focus({ preventScroll: true });
    };

    const scan = (node: Node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.classList.contains('err')) reveal(node);
      for (const el of node.querySelectorAll('.err')) reveal(el as HTMLElement);
    };

    const obs = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach(scan);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  return null;
}
