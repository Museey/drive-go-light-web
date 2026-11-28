'use client';

import { useActionState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { cancelRenewalRequestAction, requestRenewalAction } from './actions';
import type { FormResult } from '@/lib/mutate';
import { ThaiDateInput } from '@/components/thai-date-input';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn primary" type="submit" disabled={pending}>
    {pending ? 'กำลังส่ง…' : 'แจ้งชำระเงิน'}
  </button>;
}

/**
 * ฟอร์มแจ้งชำระเงิน — ส่งคำขอให้ผู้ให้บริการตรวจยอดโอนก่อน **ยังไม่ต่ออายุทันที**
 * (เดิมกดบันทึกแล้วต่ออายุเองได้เลยโดยไม่มีใครตรวจการชำระเงิน)
 */
export function RenewForm({ today }: { today: string }) {
  const [state, action] = useActionState<FormResult, FormData>(requestRenewalAction, {});

  if (state.ok) {
    return (
      <div className="ok-msg">
        ส่งคำขอต่ออายุแล้ว — ผู้ให้บริการจะตรวจยอดโอนและต่ออายุให้
        ดูสถานะได้ที่ตาราง “คำขอต่ออายุ” ด้านล่าง
      </div>
    );
  }

  return (
    <form autoComplete="off" className="form" action={action}>
      {state.error ? <div className="err">{state.error}</div> : null}

      <div className="row-fields f4">
        <div className={state.field === 'years' ? 'field bad' : 'field'}>
          <label htmlFor="years">จำนวนปี</label>
          <select className="in" id="years" name="years" defaultValue="1">
            <option value="1">1 ปี</option>
            <option value="2">2 ปี</option>
            <option value="3">3 ปี</option>
          </select>
        </div>
        <div className={state.field === 'amount' ? 'field bad' : 'field'}>
          <label htmlFor="amount">ยอดที่โอน (บาท) *</label>
          <input className="in mono" id="amount" name="amount" inputMode="decimal"
                 placeholder="3600" required />
        </div>
        <div className={state.field === 'paidOn' ? 'field bad' : 'field'}>
          <label htmlFor="paidOn">วันที่โอน *</label>
          <ThaiDateInput id="paidOn" name="paidOn" defaultIso={today} required full />
        </div>
        <div className={state.field === 'note' ? 'field bad' : 'field'}>
          <label htmlFor="note">อ้างอิงการโอน *</label>
          <input className="in" id="note" name="note" maxLength={300} required
                 placeholder="เช่น โอน 10:20 น. จาก SCB ลงท้าย 1234" />
        </div>
      </div>

      <div className="formbar"><Submit /></div>
    </form>
  );
}

/** ปุ่มยกเลิกคำขอที่ยังรอตรวจ — เผื่อกรอกยอดผิดแล้วต้องการส่งใหม่ */
export function CancelRequest({ id }: { id: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button className="lnk" type="button" disabled={busy}
            onClick={() => start(async () => {
              const r = await cancelRenewalRequestAction(id);
              if (r.error) window.alert(r.error);
              router.refresh();
            })}>
      {busy ? 'กำลังยกเลิก…' : 'ยกเลิกคำขอ'}
    </button>
  );
}
