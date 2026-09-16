'use client';

import { useState } from 'react';
import Link from 'next/link';
import { voidDocAction } from './actions';
import { nextKinds, type SalesKind } from '@/lib/sales-rules';
import { KIND_LABEL } from '@/lib/format';
import { EditGate } from './edit-gate';

/**
 * ปุ่มบนหน้าเอกสาร — ออกใบต่อ แก้ไข และยกเลิก
 * ปุ่มที่ทำอะไรย้อนกลับไม่ได้ต้องยืนยันสองจังหวะและต้องบอกเหตุผล
 *
 * ใบที่ออกใบต่อไปแล้ว ไม่มีปุ่มออกใบต่อซ้ำ (ต้นแบบ — แถบขั้นตอนพาไปใบต่อที่มีอยู่)
 * แก้ไขผ่าน popup "เอกสารได้บันทึกเรียบร้อยแล้ว" · ยกเลิกได้ทุกใบที่ยังไม่ยกเลิก (ต้นแบบ voidDoc)
 */
export function DocActions({
  id, kind, docNo, partyName, canEdit, editReason, hasChild, startVoiding = false,
}: {
  id: string;
  kind: string;
  docNo: string;
  partyName: string;
  canEdit: boolean;
  editReason?: string;
  /** มีใบต่อที่ยังไม่ยกเลิกแล้ว */
  hasChild: boolean;
  /**
   * เปิดแผงยืนยันการยกเลิกไว้เลยตั้งแต่เข้าหน้า
   *
   * ใช้กับปุ่มยกเลิกในแถวของหน้ารายการ ซึ่งพาผู้ใช้มาที่นี่แทนที่จะยกเลิกทันที
   * ได้ความเร็วของการกดครั้งเดียวจากแถว โดยยังต้องกรอกเหตุผลและยืนยันเหมือนเดิม
   */
  startVoiding?: boolean;
}) {
  const [voiding, setVoiding] = useState(startVoiding);
  const [reason, setReason] = useState('');

  const next = hasChild ? [] : nextKinds(kind as SalesKind);

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
            <form autoComplete="off" action={voidDocAction.bind(null, id, reason)}>
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
      <EditGate id={id} kind={kind} docNo={docNo} partyName={partyName}
                editable={canEdit} reason={editReason} onVoid={() => setVoiding(true)} />
      <Link className="btn" href={`/income/${id}/print`}>พิมพ์เอกสาร</Link>
      <button className="btn danger" type="button" onClick={() => setVoiding(true)}>ยกเลิกเอกสาร</button>
    </div>
  );
}
