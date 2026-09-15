'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deactivateKitAction } from './actions';

/**
 * ปิดใช้งานชุด — ไม่ลบแถวจริง เอกสารเก่าที่ขายชุดนี้ไปแล้วอ้าง kit_id อยู่
 * ยืนยันด้วย confirm() ของเบราว์เซอร์พอ เพราะเปิดกลับได้จากฐานข้อมูล ไม่ใช่การลบถาวร
 */
export function DeactivateKit({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <>
      <button className="btn sm act-del" type="button" disabled={pending}
              onClick={() => {
                if (!window.confirm(`ปิดใช้งานชุด ${code}? ชุดจะไม่ขึ้นในผลค้นหาของเอกสารอีก (เอกสารเดิมไม่เปลี่ยน)`)) return;
                start(async () => {
                  setError('');
                  const r = await deactivateKitAction(id);
                  if (r.error) { setError(r.error); return; }
                  router.refresh();
                });
              }}>
        ปิดใช้งาน
      </button>
      {error ? <div className="err" role="alert" style={{ marginTop: 4 }}>{error}</div> : null}
    </>
  );
}
