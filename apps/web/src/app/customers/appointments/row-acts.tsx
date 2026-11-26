'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ApptStatus } from '@/lib/appointments-core';
import type { FormResult } from '@/lib/mutate';
import { deleteAppointmentAction, setNotifiedAction, setStatusAction } from './actions';

/**
 * ปุ่มท้ายแถวของนัด — คัดลอกข้อความ · แจ้งแล้ว · เสร็จ · ยกเลิก / เปิดกลับ · ลบ
 * ข้อความร่างจากเซิร์ฟเวอร์ (appointmentMessage) ส่งมาเป็นข้อความสำเร็จ ที่นี่แค่คัดลอก
 */
export function ApptRowActs({ id, status, notified, mayEdit, label, message }: {
  id: string; status: ApptStatus; notified: boolean; mayEdit: boolean; label: string; message: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');
  const [show, setShow] = useState(false);

  const run = (fn: () => Promise<FormResult>) => start(async () => {
    setNote('');
    const r = await fn();
    if (r.error) { setNote(r.error); return; }
    router.refresh();
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setNote('คัดลอกข้อความแล้ว — วางใน LINE ได้เลย');
    } catch {
      /* เบราว์เซอร์ไม่ให้เขียนคลิปบอร์ด (เช่นเปิดผ่าน http) — เปิดข้อความให้เลือกคัดลอกเอง */
      setShow(true);
    }
  };

  return (
    <div>
      <span className="row-acts" style={{ flexWrap: 'wrap' }}>
        {status === 'open' ? (
          <>
            <button className="btn sm" type="button" onClick={copy}>คัดลอกข้อความ</button>
            {mayEdit ? (
              <>
                <button className="btn sm" type="button" disabled={pending}
                        onClick={() => run(() => setNotifiedAction(id, !notified))}>
                  {notified ? 'ยกเลิกแจ้งแล้ว' : 'แจ้งแล้ว'}
                </button>
                <button className="btn sm primary" type="button" disabled={pending}
                        onClick={() => run(() => setStatusAction(id, 'done'))}>เสร็จ</button>
                <Link className="btn sm" href={`/customers/appointments/${id}`}>แก้ไข</Link>
                <button className="btn sm act-del" type="button" disabled={pending}
                        onClick={() => {
                          if (!window.confirm(`ยกเลิกนัด "${label}"?`)) return;
                          run(() => setStatusAction(id, 'cancelled'));
                        }}>ยกเลิก</button>
              </>
            ) : null}
          </>
        ) : mayEdit ? (
          <>
            <button className="btn sm" type="button" disabled={pending}
                    onClick={() => run(() => setStatusAction(id, 'open'))}>เปิดกลับ</button>
            <button className="btn sm act-del" type="button" disabled={pending}
                    onClick={() => {
                      if (!window.confirm(`ลบนัด "${label}" ถาวร? กู้คืนไม่ได้`)) return;
                      run(() => deleteAppointmentAction(id));
                    }}>ลบ</button>
          </>
        ) : null}
      </span>
      {show ? (
        <textarea className="in" readOnly rows={4} value={message} style={{ width: '100%', marginTop: 4 }}
                  aria-label="ข้อความแจ้งลูกค้า" onFocus={(e) => e.target.select()} />
      ) : null}
      {note ? <div className="subtle" role="status" style={{ marginTop: 4, fontSize: '0.875rem' }}>{note}</div> : null}
    </div>
  );
}
