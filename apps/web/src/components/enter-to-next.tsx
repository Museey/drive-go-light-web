'use client';

import { useEffect } from 'react';

/**
 * Enter = ไปช่องถัดไป (ทั้งระบบ — ผู้ใช้กำหนด)
 *
 * เหมือนกดแท็บ: กด Enter ในช่องกรอก โฟกัสจะย้ายไปช่องถัดไปที่กรอกได้ (input / select / textarea)
 * ไม่ส่งฟอร์มโดยไม่ตั้งใจ · ไม่ยุ่งกับ textarea (Enter = ขึ้นบรรทัดใหม่)
 * ช่องที่มีกติกา Enter ของตัวเอง (ช่องรหัสในตารางรายการ: Enter = เลือกผลค้นหา/เพิ่มบรรทัด)
 * หยุดการกระจายเหตุการณ์ (stopPropagation) ไว้แล้ว จึงไม่มาถึงตัวนี้
 */
const FOCUSABLE = 'input:not([type=hidden]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])';

export function EnterToNext() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target as HTMLElement | null;
      if (!el || el.tagName !== 'INPUT') return;
      const type = (el as HTMLInputElement).type;
      if (['button', 'submit', 'checkbox', 'radio', 'file'].includes(type)) return;
      if (el.closest('[data-enter="own"]')) return;
      const scope = (el.closest('form') ?? el.closest('.card') ?? document.body) as HTMLElement;
      const list = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === el);
      const i = list.indexOf(el);
      if (i < 0) return;
      const next = list[i + 1];
      e.preventDefault();
      if (next) { next.focus(); if ((next as HTMLInputElement).select && next.tagName === 'INPUT') (next as HTMLInputElement).select(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
