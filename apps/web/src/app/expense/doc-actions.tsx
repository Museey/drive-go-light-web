'use client';

import { useState } from 'react';
import Link from 'next/link';
import { voidBuyDocAction } from './actions';

export function BuyDocActions({ id }: { id: string }) {
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');

  if (voiding) {
    return (
      <div className="card" style={{ borderColor: '#EEC4C4' }}>
        <header><h2>ยกเลิกเอกสาร</h2></header>
        <div className="body">
          <p style={{ marginBottom: 12 }}>
            เอกสารจะยังอยู่ในระบบแต่ถูกทำเครื่องหมายว่ายกเลิก ไม่ถูกนับในต้นทุนและภาษีซื้ออีก
            อะไหล่ที่รับเข้าสต๊อกจากใบนี้จะถูกหักออกให้อัตโนมัติ
          </p>
          <div className="field" style={{ maxWidth: 420, marginBottom: 12 }}>
            <label htmlFor="void-reason">เหตุผลที่ยกเลิก</label>
            <input className="in" id="void-reason" value={reason} autoFocus
                   placeholder="เช่น บันทึกผิดใบ · ส่งของคืนผู้ขาย"
                   onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="tag-row">
            <form action={voidBuyDocAction.bind(null, id, reason)}>
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
      <Link className="btn" href={`/expense/${id}/edit`}>แก้ไข</Link>
      <button className="btn danger" type="button" onClick={() => setVoiding(true)}>ยกเลิกเอกสาร</button>
    </div>
  );
}
