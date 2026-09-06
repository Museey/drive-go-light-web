'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { openShopAction, type LinkResult } from '../actions';
import { LinkBox } from '../link-box';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn primary" type="submit" disabled={pending}>
    {pending ? 'กำลังเปิด…' : 'เปิดอู่'}
  </button>;
}

const Field = ({
  id, label, hint, ...rest
}: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div style={{ marginBottom: 12 }}>
    <label htmlFor={id} style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 4 }}>
      {label}
    </label>
    <input className="in" id={id} name={id} style={{ width: '100%' }} {...rest} />
    {hint ? <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>{hint}</div> : null}
  </div>
);

export function NewShopForm() {
  const [state, action] = useActionState<LinkResult, FormData>(openShopAction, {});

  return (
    <form action={action}>
      {state.error ? <div className="err">{state.error}</div> : null}

      {state.ok && state.link ? (
        <LinkBox
          link={state.link}
          note={`เปิดอู่แล้ว — ส่งลิงก์นี้ให้ ${state.email} เพื่อตั้งรหัสผ่าน`}
        />
      ) : null}

      <div className="grid g2">
        <Field id="name" label="ชื่ออู่" required autoFocus
               placeholder="อู่ ช่างเอ ออโต้เซอร์วิส" />
        <Field id="tel" label="โทรศัพท์" placeholder="081-234-5678" />
      </div>
      <div className="grid g2">
        <Field id="ownerEmail" label="อีเมลของเจ้าของอู่" type="email" required
               hint="ใช้เข้าสู่ระบบ — ต้องไม่ซ้ำกับผู้ใช้ของอู่อื่น" />
        <Field id="ownerName" label="ชื่อเจ้าของอู่" placeholder="สมชาย ใจดี" />
      </div>

      <div style={{ marginTop: 8 }}><Submit /></div>
    </form>
  );
}
