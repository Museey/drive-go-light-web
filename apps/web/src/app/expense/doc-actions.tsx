'use client';

import { useState } from 'react';
import Link from 'next/link';
import { unvoidBuyDocAction, voidBuyDocAction } from './actions';

export function BuyDocActions({ id, startVoiding }: {
  id: string;
  /** กดปุ่มยกเลิกมาจากหน้ารายการ — เปิดแผงให้เลย ไม่ต้องกดซ้ำอีกที */
  startVoiding?: boolean;
}) {
  const [voiding, setVoiding] = useState(Boolean(startVoiding));
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
      <Link className="btn" href={`/expense/${id}/print`}>พิมพ์เอกสาร</Link>
      <button className="btn danger" type="button" onClick={() => setVoiding(true)}>ยกเลิกเอกสาร</button>
    </div>
  );
}

/**
 * นำใบที่ยกเลิกกลับมาใช้ — มีเฉพาะฝั่งรายจ่าย ตามกติกาของรุ่น 6.4
 *
 * เอกสารรายรับที่ยกเลิกแล้วกู้คืนไม่ได้ เพราะยอดขาย ภาษีขาย และใบกำกับภาษี
 * ที่ส่งออกไปแล้วพัวพันอยู่ — ใบพวกนั้นใช้ "คัดลอกใบใหม่" แทน
 *
 * ถามยืนยันก่อนเสมอ และบอกให้ครบว่าอะไรจะกลับมาบ้าง เพราะการกดผิด
 * ทำให้ของงอกกลับเข้าคลังและหนี้กลับมาโดยที่ตัวเลขไม่มีอะไรบอกว่าเพิ่งเปลี่ยน
 */
export function UnvoidBuyDoc({ id, docNo, hasStock }: {
  id: string;
  docNo: string;
  /** ใบนี้เคยรับของเข้าคลัง — ข้อความยืนยันจะได้ตรงกับสิ่งที่จะเกิดขึ้นจริง */
  hasStock: boolean;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <div className="tag-row" style={{ marginTop: 12 }}>
        <button className="btn" type="button" onClick={() => setAsking(true)}>
          กู้คืนเอกสาร
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <header><h2>กู้คืนเอกสาร</h2></header>
      <div className="body">
        <p style={{ marginTop: 0, marginBottom: 12 }}>
          นำเอกสาร <b>{docNo}</b> กลับมาใช้ — ยอดของใบนี้จะกลับไปนับในเจ้าหนี้
          ภาษีซื้อ และงบกำไรขาดทุนตามเดิม
          {hasStock ? (
            <>
              {' '}และ<b>ของที่รับเข้าจากใบนี้จะกลับเข้าคลัง</b>ด้วยต้นทุนก้อนเดิม
              ที่ถูกตัดออกไปตอนยกเลิก
            </>
          ) : null}
        </p>
        <div className="tag-row">
          <form action={unvoidBuyDocAction.bind(null, id)}>
            <button className="btn primary" type="submit">ยืนยันกู้คืน</button>
          </form>
          <button className="btn" type="button" onClick={() => setAsking(false)}>ไม่กู้คืนแล้ว</button>
        </div>
      </div>
    </div>
  );
}
