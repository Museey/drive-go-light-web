'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { deleteTenantAction } from './actions';
import type { FormResult } from '@/lib/mutate';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn danger" type="submit" disabled={pending}>
    {pending ? 'กำลังลบ…' : 'ลบข้อมูลทั้งหมดอย่างถาวร'}
  </button>;
}

export function DeleteTenantForm({ shopName }: { shopName: string }) {
  const [state, action] = useActionState<FormResult, FormData>(deleteTenantAction, {});
  const [open, setOpen] = useState(false);

  if (state.ok) {
    return (
      <div className="ok-msg">
        ลบข้อมูลเรียบร้อย — ข้อมูลทั้งหมดของอู่นี้ถูกลบออกจากระบบแล้ว
        <form action="/logout" method="post" style={{ marginTop: 10 }}>
          <button className="btn" type="submit">ออกจากระบบ</button>
        </form>
      </div>
    );
  }

  if (!open) {
    return (
      <button className="btn danger" type="button" onClick={() => setOpen(true)}>
        ขอลบข้อมูลทั้งหมด
      </button>
    );
  }

  return (
    <form className="form" action={action}>
      {state.error ? <div className="err">{state.error}</div> : null}

      <div className="err">
        <b>อ่านก่อนกด</b>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
          <li>ข้อมูลทั้งหมดของอู่จะถูกลบถาวร — เอกสาร ลูกค้า สินค้า และผู้ใช้ทุกคน</li>
          <li>ย้อนกลับไม่ได้ และเรากู้คืนให้ไม่ได้</li>
          <li>ถ้ายังไม่ได้เก็บไฟล์สำรองไว้ ให้ไปดาวน์โหลดที่หน้าสำรองข้อมูลก่อน</li>
        </ul>
      </div>

      <div className={state.field === 'confirmName' ? 'field bad' : 'field'}>
        <label htmlFor="confirmName">
          พิมพ์ชื่ออู่ให้ตรงเพื่อยืนยัน — <b>{shopName}</b>
        </label>
        <input className="in" id="confirmName" name="confirmName" autoComplete="off" required />
      </div>

      <label className="tag-row" style={{ fontSize: 14 }}>
        <input type="checkbox" name="understood" />
        เข้าใจแล้วว่าการลบนี้ย้อนกลับไม่ได้
      </label>

      <div className="tag-row">
        <Submit />
        <button className="btn" type="button" onClick={() => setOpen(false)}>ไม่ลบแล้ว</button>
      </div>
    </form>
  );
}
