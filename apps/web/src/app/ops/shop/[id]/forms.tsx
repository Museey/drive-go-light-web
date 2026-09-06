'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { issueResetAction, renewAction, setSeatsAction, type LinkResult } from '../../actions';
import { LinkBox } from '../../link-box';
import type { FormResult } from '@/lib/mutate';

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return <button className="btn primary" type="submit" disabled={pending}>
    {pending ? busy : label}
  </button>;
}

export function SeatsForm({ tenantId, maxUsers }: { tenantId: string; maxUsers: number | null }) {
  const [state, action] = useActionState<FormResult, FormData>(setSeatsAction, {});

  return (
    <form action={action} style={{ marginTop: 10 }}>
      <input type="hidden" name="tenantId" value={tenantId} />
      {state.error ? <div className="err">{state.error}</div> : null}
      {state.ok ? <div className="ok-msg">บันทึกแล้ว</div> : null}

      <div className="tag-row">
        <input className="in mono" name="maxUsers" type="number" min={1}
               defaultValue={maxUsers ?? ''} placeholder="ไม่จำกัด" style={{ width: 120 }} />
        <Submit label="บันทึกที่นั่ง" busy="กำลังบันทึก…" />
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        เว้นว่าง = ไม่จำกัด · เจ้าของกิจการไม่ถูกนับ · ลดให้น้อยกว่าที่ใช้อยู่ได้
        แต่<b>ไม่ล็อกใครออก</b> ระบบตรวจตอนเปิดบัญชีใหม่เท่านั้น
      </div>
    </form>
  );
}

export function RenewForm({
  tenantId, from, to, plan,
}: { tenantId: string; from: string; to: string; plan: string }) {
  const [state, action] = useActionState<FormResult, FormData>(renewAction, {});

  return (
    <form action={action}>
      <input type="hidden" name="tenantId" value={tenantId} />
      {state.error ? <div className="err">{state.error}</div> : null}
      {state.ok ? <div className="ok-msg">บันทึกการต่ออายุแล้ว</div> : null}

      <div className="grid g4">
        <div>
          <label htmlFor="from" style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)' }}>
            เริ่มวันที่
          </label>
          <input className="in" id="from" name="from" type="date" defaultValue={from}
                 required style={{ width: '100%' }} />
        </div>
        <div>
          <label htmlFor="to" style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)' }}>
            ถึงวันที่
          </label>
          <input className="in" id="to" name="to" type="date" defaultValue={to}
                 required style={{ width: '100%' }} />
        </div>
        <div>
          <label htmlFor="plan" style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)' }}>
            แพ็กเกจ
          </label>
          <input className="in" id="plan" name="plan" defaultValue={plan} style={{ width: '100%' }} />
        </div>
        <div>
          <label htmlFor="amount" style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)' }}>
            ยอดที่เก็บ (บาท)
          </label>
          <input className="in mono" id="amount" name="amount" inputMode="decimal"
                 placeholder="เว้นว่างได้" style={{ width: '100%' }} />
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label htmlFor="note" style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)' }}>
          หมายเหตุ
        </label>
        <input className="in" id="note" name="note" style={{ width: '100%' }}
               placeholder="เช่น โอนผ่านพร้อมเพย์ 5 ก.ย." />
      </div>

      <div style={{ marginTop: 12 }}>
        <Submit label="บันทึกการต่ออายุ" busy="กำลังบันทึก…" />
      </div>
    </form>
  );
}

export function ResetLink({ tenantId }: { tenantId: string }) {
  const [state, action] = useActionState<LinkResult, FormData>(issueResetAction, {});

  return (
    <form action={action}>
      <input type="hidden" name="tenantId" value={tenantId} />
      {state.error ? <div className="err">{state.error}</div> : null}
      {state.ok && state.link ? (
        <LinkBox link={state.link} note={`ลิงก์ตั้งรหัสผ่านใหม่ของ ${state.email}`} />
      ) : null}
      <Submit label="ออกลิงก์ตั้งรหัสผ่านใหม่" busy="กำลังออกลิงก์…" />
    </form>
  );
}
