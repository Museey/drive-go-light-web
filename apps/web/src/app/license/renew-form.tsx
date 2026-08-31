'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { recordRenewalAction } from './actions';
import type { FormResult } from '@/lib/mutate';
import { thDateLong } from '@/lib/format';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn primary" type="submit" disabled={pending}>
    {pending ? 'กำลังบันทึก…' : 'บันทึกการต่ออายุ'}
  </button>;
}

export function RenewForm() {
  const [state, action] = useActionState<FormResult, FormData>(recordRenewalAction, {});

  if (state.ok && state.values?.expiresOn) {
    return (
      <div className="ok-msg">
        ต่ออายุเรียบร้อย — ใช้งานได้ถึง {thDateLong(state.values.expiresOn)}
      </div>
    );
  }

  return (
    <form className="form" action={action}>
      {state.error ? <div className="err">{state.error}</div> : null}

      <div className="row-fields f3">
        <div className={state.field === 'years' ? 'field bad' : 'field'}>
          <label htmlFor="years">จำนวนปี</label>
          <select className="in" id="years" name="years" defaultValue="1">
            <option value="1">1 ปี</option>
            <option value="2">2 ปี</option>
            <option value="3">3 ปี</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="amount">ยอดที่ได้รับ (บาท)</label>
          <input className="in mono" id="amount" name="amount" inputMode="decimal" placeholder="3600" />
        </div>
        <div className="field">
          <label htmlFor="note">อ้างอิงการโอน</label>
          <input className="in" id="note" name="note" placeholder="เช่น โอนวันที่ 1 ก.ย. เวลา 10:20" />
        </div>
      </div>

      <div className="formbar"><Submit /></div>
    </form>
  );
}
