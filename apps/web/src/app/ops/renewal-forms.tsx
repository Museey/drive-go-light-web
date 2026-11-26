'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { decideRenewalAction } from './actions';
import type { FormResult } from '@/lib/mutate';

function Buttons() {
  const { pending } = useFormStatus();
  return (
    <>
      <button className="btn primary" type="submit" name="decision" value="approve" disabled={pending}>
        {pending ? 'กำลังบันทึก…' : 'ตรวจยอดแล้ว — อนุมัติ'}
      </button>
      <button className="btn danger" type="submit" name="decision" value="reject" disabled={pending}>
        ไม่อนุมัติ
      </button>
    </>
  );
}

/**
 * ปุ่มตัดสินคำขอต่ออายุหนึ่งใบ — ปุ่มที่กดบอกผลผ่าน name="decision"
 * ไม่อนุมัติต้องกรอกเหตุผล เพราะอู่เห็นข้อความนี้ในหน้าลิขสิทธิ์ของตัวเอง
 */
export function DecideRenewal({ requestId }: { requestId: string }) {
  const [state, action] = useActionState<FormResult, FormData>(decideRenewalAction, {});

  if (state.ok) return <div className="ok-msg">บันทึกผลแล้ว</div>;

  return (
    <form autoComplete="off" action={action}>
      <input type="hidden" name="requestId" value={requestId} />
      {state.error ? <div className="err">{state.error}</div> : null}
      <div className="tag-row">
        <input className="in" name="note" maxLength={300} aria-label="หมายเหตุ / เหตุผล"
               placeholder="หมายเหตุ (ต้องกรอกถ้าไม่อนุมัติ)" style={{ width: 320, maxWidth: '100%' }} />
        <Buttons />
      </div>
    </form>
  );
}
