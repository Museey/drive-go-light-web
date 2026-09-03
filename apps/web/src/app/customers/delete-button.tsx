'use client';

import { useState } from 'react';
import { deleteContactAction } from './actions';

/** ลบต้องยืนยันสองจังหวะ — กดพลาดแล้วข้อมูลหายทันทีไม่ได้ */
export function DeleteContactButton({
  id, name, kind,
}: {
  id: string;
  name: string;
  /** ทะเบียนลูกค้ากับผู้ขายเป็นคนละแท็บ สิทธิ์แก้ไขจึงแยกกัน */
  kind: 'customer' | 'vendor';
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button className="btn danger" type="button" onClick={() => setConfirming(true)}>
        ลบผู้ติดต่อรายนี้
      </button>
    );
  }

  return (
    <div className="tag-row">
      <span style={{ fontSize: 13.5 }}>ยืนยันลบ <b>{name}</b>? การลบนี้ย้อนกลับไม่ได้</span>
      <form action={deleteContactAction.bind(null, id, kind)}>
        <button className="btn danger" type="submit">ลบเลย</button>
      </form>
      <button className="btn" type="button" onClick={() => setConfirming(false)}>ยกเลิก</button>
    </div>
  );
}
