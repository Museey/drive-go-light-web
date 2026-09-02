'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createCountAction } from './actions';
import type { FormResult } from '@/lib/mutate';

/** เปิดใบตรวจนับใหม่ — ถามแค่วันที่กับหมายเหตุ แล้วเข้าไปกรอกในใบ */
export function NewCount({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormResult, FormData>(createCountAction, {});

  if (!open) {
    return (
      <button className="btn primary" type="button" onClick={() => setOpen(true)}>
        + ตรวจนับสินค้า
      </button>
    );
  }

  return (
    <form action={action} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {state.error ? <span className="chip due">{state.error}</span> : null}
      <input className="in mono" name="countDate" type="date" defaultValue={today} required
             style={{ width: 150 }} />
      <input className="in" name="note" placeholder="เช่น ตรวจนับประจำเดือน ชั้น A–C"
             style={{ width: 260 }} />
      <Submit />
      <button className="btn" type="button" onClick={() => setOpen(false)}>ยกเลิก</button>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? 'กำลังเปิด…' : 'เปิดใบ'}
    </button>
  );
}
