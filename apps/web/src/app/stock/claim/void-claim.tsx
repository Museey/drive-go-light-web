'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { voidClaimAction } from './actions';

/**
 * ยกเลิกใบเคลม — ไม่ลบทิ้ง เอกสารยังอยู่ให้ตรวจย้อนหลังได้
 * ตรงกับวิธีของเอกสารหมวด 03 และ 04 และของรุ่น 6.4 เอง
 * สต๊อกที่ตัดไปแล้วถูกคืนกลับเข้าล็อตด้วยต้นทุนเดิมโดยอัตโนมัติ
 */
export function VoidClaim({ id, no }: { id: string; no: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, start] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <div style={{ marginTop: 18 }}>
        <button className="btn danger" type="button" onClick={() => setOpen(true)}>
          ยกเลิกใบเคลม
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="body">
        {err ? <div className="err">{err}</div> : null}
        <div className="err">
          ยกเลิกใบเคลม <b>{no}</b> — เอกสารจะยังอยู่ในระบบและเปิดดูย้อนหลังได้
          แต่จะถูกทำเครื่องหมายว่ายกเลิก และ<b>สต๊อกที่ตัดไปแล้วจะถูกคืนกลับให้อัตโนมัติ</b>
          ด้วยต้นทุนเดิมของแต่ละล็อต
        </div>
        <div className="field">
          <label htmlFor="reason">เหตุผล</label>
          <input className="in" id="reason" value={reason}
                 onChange={(e) => setReason(e.target.value)}
                 placeholder="เช่น เปิดใบผิดคน" />
        </div>
        <div className="tag-row">
          <button className="btn danger" type="button" disabled={busy}
                  onClick={() => start(async () => {
                    const r = await voidClaimAction(id, reason);
                    if (r.error) setErr(r.error); else router.refresh();
                  })}>
            {busy ? 'กำลังยกเลิกและคืนสต๊อก…' : 'ยืนยันยกเลิก'}
          </button>
          <button className="btn" type="button" onClick={() => setOpen(false)}>ไม่ยกเลิกแล้ว</button>
        </div>
      </div>
    </div>
  );
}
