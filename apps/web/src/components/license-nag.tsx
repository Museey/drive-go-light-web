'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * ลิขสิทธิ์หมดอายุ → popup "กรุณาชำระเงินเพื่อต่ออายุการใช้งาน" (ผู้ใช้กำหนด)
 * ขึ้นครั้งแรกของแต่ละ session แล้วปิดได้ (แถบเมนูยังกะพริบแดงเตือนต่อ) — ไม่ล็อกการใช้งานที่นี่
 * เพราะกติกาการล็อกอยู่ที่ getLicenseStatus/ผังสิทธิ์อยู่แล้ว
 */
export function LicenseNag({ expiredDays }: { expiredDays: number }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { if (!sessionStorage.getItem('lic-nag')) setOpen(true); } catch { setOpen(true); }
  }, []);
  if (!open) return null;
  const close = () => { try { sessionStorage.setItem('lic-nag', '1'); } catch { /* ignore */ } setOpen(false); };
  return (
    <>
      <button className="scrim" type="button" aria-label="ปิด" onClick={close} />
      <div className="confirm licnag" role="alertdialog" aria-modal="true" aria-label="ลิขสิทธิ์หมดอายุ">
        <header><b className="due-text">ลิขสิทธิ์การใช้งานหมดอายุแล้ว {expiredDays} วัน</b></header>
        <p className="fs-15">กรุณาชำระเงินเพื่อต่ออายุการใช้งาน — ข้อมูลทั้งหมดยังอยู่ครบ ต่ออายุแล้วใช้งานต่อได้ทันที</p>
        <div className="acts">
          <Link className="btn ok" href="/license" onClick={close}>ไปหน้าต่ออายุ (08)</Link>
          <button className="btn amber" type="button" onClick={close}>ปิดไว้ก่อน</button>
        </div>
      </div>
    </>
  );
}
