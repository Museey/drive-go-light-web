'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

/** ข้อมูลของการ์ดบันทึกแล้ว — เซิร์ฟเวอร์อ่านจากฐานด้วย id ที่ส่งมา (lib/saved.ts) ไม่เชื่อค่าจาก URL */
export interface SavedSummary {
  /** "บันทึกเอกสารเรียบร้อย" · "บันทึกข้อมูลแล้ว" */
  title: string;
  /** ชนิด เช่น "ใบเสร็จรับเงิน" · "ลูกค้า" */
  label: string;
  /** เลขที่ / รหัส */
  no: string;
  /** ชื่อลูกค้า ผู้ขาย สินค้า หรือชุด */
  name: string;
  /** ยอดรวมที่จัดรูปแล้ว — ไม่มียอดให้ null */
  amount: string | null;
  printHref: string | null;
  printLabel: string;
  editHref: string | null;
  editLabel: string;
}

/** ข้อความ "บันทึกเรียบร้อย" แสดงเดี่ยว ๆ ก่อน 2 วินาที แล้วการ์ดเดิมแสดงรายละเอียดกับปุ่ม (ผู้ใช้กำหนด) */
export const SAVED_HOLD_MS = 2000;

/**
 * การ์ดบันทึกแล้ว — ขนาดนามบัตรกลางจอ (ผู้ใช้เลือก 16 ก.ย. 2569) ใช้ทุกเอกสารและข้อมูลหลัก
 *
 * ปิด (ปุ่ม · Esc · กดฉากหลัง) แล้วลบ saved / savedId ออกจาก URL — กดรีเฟรชไม่เด้งซ้ำ
 * ใช้ router.replace ไม่ใช่ history ของเบราว์เซอร์ตรง ๆ ให้หน้าเซิร์ฟเวอร์รู้ว่าไม่ต้องแสดงการ์ดแล้ว
 */
export function SavedCard({ s }: { s: SavedSummary }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const firstBtn = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('saved');
    url.searchParams.delete('savedId');
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [router]);

  useEffect(() => {
    /* โฟกัสที่การ์ด ไม่ใช่ช่องกรอกด้านหลัง — Enter ที่ค้างจากการกดบันทึกจะไม่ไปโดนฟอร์มใบใหม่ */
    cardRef.current?.focus({ preventScroll: true });
    const t = window.setTimeout(() => setReady(true), SAVED_HOLD_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (ready) firstBtn.current?.focus({ preventScroll: true });
  }, [ready]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  if (!open) return null;

  return (
    <>
      <button className="saved-scrim" type="button" aria-label="ปิดการ์ดบันทึกแล้ว" onClick={close} />
      <div ref={cardRef} className={`saved-card${ready ? ' ready' : ''}`} role="dialog" aria-modal="true"
           aria-labelledby="saved-title" tabIndex={-1}>
        <div className="tick" aria-hidden="true">✓</div>
        <h2 id="saved-title">{s.title}</h2>
        {ready ? (
          <>
            <dl className="who">
              <div><dt>{s.label}</dt><dd className="mono">{s.no}</dd></div>
              {s.name ? <div><dt>ชื่อ</dt><dd>{s.name}</dd></div> : null}
              {s.amount ? <div><dt>ยอดรวม</dt><dd className="mono">{s.amount} บาท</dd></div> : null}
            </dl>
            <div className="acts">
              {s.printHref ? (
                <Link ref={(el) => { firstBtn.current = el; }} className="btn ok" href={s.printHref}
                      target="_blank" rel="noreferrer">🖨 {s.printLabel}</Link>
              ) : null}
              {s.editHref ? (
                <Link ref={(el) => { if (!s.printHref) firstBtn.current = el; }} className="btn amber" href={s.editHref}>
                  {s.editLabel}
                </Link>
              ) : null}
              <button ref={(el) => { if (!s.printHref && !s.editHref) firstBtn.current = el; }}
                      className="btn" type="button" onClick={close}>ปิด</button>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
