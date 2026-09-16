'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { KIND_LABEL } from '@/lib/format';

/**
 * ปุ่ม "แก้ไข" ของใบที่บันทึกแล้ว — ถามก่อนทุกครั้ง (ผู้ใช้กำหนด 17 ก.ย. 2569)
 *
 *   เอกสารได้บันทึกเรียบร้อยแล้ว — ต้องการแก้ไขใช่หรือไม่
 *   [แก้ไขเอกสาร] → ฟอร์มแก้ใบเดิม เลขที่เดิม · [ยกเลิกเอกสาร] → แผงกรอกเหตุผล · [ปิด]
 *
 * ใบที่แก้ไม่ได้ (ใบเสร็จ · ใบที่รับเงินแล้ว — กติกาตามต้นแบบ) ยังเปิด popup ได้
 * แต่ปุ่มแก้ไขจางพร้อมเหตุผล ผู้ใช้เห็นว่าทำไมและเหลือทางออกคือยกเลิกแล้วออกใหม่
 */
export function EditGate({
  id, kind, docNo, partyName, editable, reason, onVoid, buttonClass = 'btn', label = 'แก้ไข',
}: {
  id: string;
  kind: string;
  docNo: string;
  partyName: string;
  editable: boolean;
  reason?: string;
  /** หน้าเอกสาร: เปิดแผงยกเลิกในหน้าเดียวกัน · ไม่ส่ง = ไปหน้าเอกสารพร้อมแผงยกเลิก (แถวประวัติ) */
  onVoid?: () => void;
  buttonClass?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  return (
    <>
      <button className={buttonClass} type="button" onClick={() => setOpen(true)}>{label}</button>
      {open ? (
        /* อยู่ในแถวตารางที่กดได้ทั้งแถว — กันคลิกใน popup ไหลขึ้นไปพาเปิดหน้าเอกสาร */
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <button className="scrim on" type="button" aria-label="ปิด" onClick={() => setOpen(false)} />
          <div className="confirm open edit-gate" role="dialog" aria-modal="true" aria-label="เอกสารได้บันทึกเรียบร้อยแล้ว">
            <header>
              <b>เอกสารได้บันทึกเรียบร้อยแล้ว</b>
              <span className="subtle">{KIND_LABEL[kind] ?? kind} <span className="mono">{docNo}</span>{partyName ? ` · ${partyName}` : ''}</span>
            </header>
            {editable ? (
              <p className="gate-q">ต้องการแก้ไขใช่หรือไม่</p>
            ) : (
              <div className="note gate-reason">{reason || 'เอกสารนี้แก้ไม่ได้ — ให้ยกเลิกใบนี้แล้วออกใบใหม่'}</div>
            )}
            <div className="acts gate-acts">
              {editable ? (
                <Link className="btn ok" href={`/income/${id}/edit`}>แก้ไขเอกสาร</Link>
              ) : (
                <span className="btn ok off" aria-disabled="true" title={reason}>แก้ไขเอกสาร</span>
              )}
              {onVoid ? (
                <button className="btn danger" type="button" onClick={() => { setOpen(false); onVoid(); }}>ยกเลิกเอกสาร</button>
              ) : (
                <Link className="btn danger" href={`/income/${id}?void=1`}>ยกเลิกเอกสาร</Link>
              )}
              <button className="btn amber" type="button" onClick={() => setOpen(false)}>ปิด</button>
            </div>
          </div>
        </span>
      ) : null}
    </>
  );
}
