'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FormResult } from '@/lib/mutate';
import { deleteRunAction, setEmployeeActiveAction } from './actions';

/** ปุ่มที่ยิง action แล้วรีเฟรชหน้า — ข้อผิดพลาดขึ้นใต้ปุ่ม ไม่หายเงียบ */
function ActButton({ label, busy, className, confirm, run }: {
  label: string; busy: string; className: string; confirm?: string; run: () => Promise<FormResult>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <>
      <button className={className} type="button" disabled={pending}
              onClick={() => {
                if (confirm && !window.confirm(confirm)) return;
                start(async () => {
                  setError('');
                  const r = await run();
                  if (r.error) { setError(r.error); return; }
                  router.refresh();
                });
              }}>
        {pending ? busy : label}
      </button>
      {error ? <div className="err" role="alert" style={{ marginTop: 4 }}>{error}</div> : null}
    </>
  );
}

/** ลบงวดทั้งงวด — สลิปและยอดใน ภ.ง.ด.1 / สปส.1-10 ของเดือนนั้นหายตาม จึงถามยืนยันให้ชัด */
export function DeleteRun({ id, label }: { id: string; label: string }) {
  return (
    <ActButton label="ลบ" busy="กำลังลบ…" className="btn sm act-del"
               confirm={`ลบงวดเงินเดือน ${label}? สลิปและยอดภาษี/ประกันสังคมของงวดนี้จะหายไปด้วย กู้คืนไม่ได้`}
               run={() => deleteRunAction(id)} />
  );
}

/** ปิด/เปิดใช้งานพนักงาน — ไม่ลบแถว งวดเงินเดือนเก่าอ้างถึงอยู่ */
export function ToggleEmployee({ id, name, active }: { id: string; name: string; active: boolean }) {
  return active ? (
    <ActButton label="ปิดใช้งาน" busy="กำลังบันทึก…" className="btn sm act-del"
               confirm={`ปิดใช้งาน ${name}? จะไม่ถูกใส่ในงวดเงินเดือนใหม่ (งวดเดิมไม่เปลี่ยน)`}
               run={() => setEmployeeActiveAction(id, false)} />
  ) : (
    <ActButton label="เปิดใช้งาน" busy="กำลังบันทึก…" className="btn sm"
               run={() => setEmployeeActiveAction(id, true)} />
  );
}
