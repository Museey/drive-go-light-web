'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { addOperatorAction, toggleOperatorAction, type LinkResult } from '../actions';
import { LinkBox } from '../link-box';

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return <button className="btn primary" type="submit" disabled={pending}>
    {pending ? busy : label}
  </button>;
}

export function AddOperator() {
  const [state, action] = useActionState<LinkResult, FormData>(addOperatorAction, {});

  return (
    <form action={action}>
      {state.error ? <div className="err">{state.error}</div> : null}
      {state.ok && state.link ? (
        <LinkBox link={state.link} note={`เพิ่มบัญชี ${state.email} แล้ว — ส่งลิงก์นี้ให้เขาตั้งรหัสผ่าน`} />
      ) : null}

      <div className="tag-row">
        <input className="in" name="email" type="email" placeholder="อีเมล" required
               style={{ minWidth: 240 }} />
        <input className="in" name="name" placeholder="ชื่อ (ไม่บังคับ)" style={{ minWidth: 180 }} />
        <Submit label="เพิ่มบัญชี" busy="กำลังเพิ่ม…" />
      </div>
    </form>
  );
}

export function ToggleOperator({ id, active }: { id: string; active: boolean }) {
  return (
    <form action={async () => { await toggleOperatorAction(id, !active); }}>
      <button className={active ? 'btn danger sm' : 'btn sm'} type="submit">
        {active ? 'ปิดบัญชี' : 'เปิดบัญชี'}
      </button>
    </form>
  );
}
