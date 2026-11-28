'use client';

import { useEffect } from 'react';

/**
 * เปิดการเคลื่อนไหวตอนเลื่อนถึง (landing.css: `.lp[data-lp-motion] [data-reveal]` → `.is-in`)
 *
 * ไม่มีสคริปต์ = ไม่มี data-lp-motion = เนื้อหาแสดงครบตามปกติ ไม่มีอะไรถูกซ่อนค้าง
 * (ต้นฉบับของโฉมใหม่ไม่ได้มากับงานที่ส่งต่อ ตัวนี้เขียนตามสัญญาที่ CSS กำหนดไว้)
 */
export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.lp');
    if (!root || !('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = [...root.querySelectorAll<HTMLElement>('[data-reveal]')];
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    /* ของที่อยู่ในจออยู่แล้วตอนเปิดหน้าให้เห็นทันที ไม่กะพริบหาย */
    const vh = window.innerHeight;
    for (const el of els) {
      if (el.getBoundingClientRect().top < vh) el.classList.add('is-in');
      else io.observe(el);
    }
    root.setAttribute('data-lp-motion', '');
    return () => { io.disconnect(); root.removeAttribute('data-lp-motion'); };
  }, []);
  return null;
}
