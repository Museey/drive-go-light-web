'use client';

import { useState } from 'react';
import Link from 'next/link';
import { voidDocAction } from './actions';
import { nextKinds, type SalesKind } from '@/lib/sales-rules';
import { KIND_LABEL } from '@/lib/format';

/**
 * ปุ่มบนหน้าเอกสาร — ออกใบต่อ แก้ไข และยกเลิก
 * ปุ่มที่ทำอะไรย้อนกลับไม่ได้ต้องยืนยันสองจังหวะและต้องบอกเหตุผล
 */
export function DocActions({
  id, kind, canEdit, editReason,
}: {
  id: string;
  kind: string;
  canEdit: boolean;
  editReason?: string;
}) {
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');

  const next = nextKinds(kind as SalesKind);

  if (voiding) {
    return (
      <div className="card" style={{ borderColor: '#EEC4C4' }}>
        <header><h2>ยกเลิกเอกสาร</h2></header>
        <div className="body">
          <p style={{ marginBottom: 12 }}>
            เอกสารจะยังอยู่ในระบบแต่ถูกทำเครื่องหมายว่ายกเลิก และไม่ถูกนับในยอดขายและภาษีอีก
            สต๊อกที่ตัดไปจะถูกคืนกลับให้อัตโนมัติ
          </p>
          <div className="field" style={{ maxWidth: 420, marginBottom: 12 }}>
            <label htmlFor="void-reason">เหตุผลที่ยกเลิก</label>
            <input className="in" id="void-reason" value={reason} autoFocus
                   placeholder="เช่น ออกผิดใบ · ลูกค้ายกเลิกงาน"
                   onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="tag-row">
            <form action={voidDocAction.bind(null, id, reason)}>
              <button className="btn danger" type="submit">ยืนยันยกเลิกเอกสาร</button>
            </form>
            <button className="btn" type="button" onClick={() => setVoiding(false)}>ไม่ยกเลิกแล้ว</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tag-row">
      {next.map((k) => (
        <Link key={k} className="btn primary" href={`/income/new?kind=${k}&from=${id}`}>
          ออก{KIND_LABEL[k]}
        </Link>
      ))}
      {canEdit ? (
        <Link className="btn" href={`/income/${id}/edit`}>แก้ไข</Link>
      ) : (
        <span className="subtle" title={editReason}>แก้ไขไม่ได้</span>
      )}
      <Link className="btn" href={`/income/${id}/print`}>พิมพ์เอกสาร</Link>
      {canEdit ? (
        <button className="btn danger" type="button" onClick={() => setVoiding(true)}>ยกเลิกเอกสาร</button>
      ) : null}
    </div>
  );
}
