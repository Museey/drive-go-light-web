'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { adjustStockAction } from './actions';
import type { FormResult } from '@/lib/mutate';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending ? 'กำลังบันทึก…' : 'ปรับยอด'}</button>;
}

/**
 * ปรับยอดสต๊อกให้ตรงกับที่นับได้จริง
 * กรอกจำนวนที่นับได้ ระบบบันทึกเป็นส่วนต่างให้ ตรวจย้อนได้ว่าใครปรับเมื่อไหร่
 */
export function AdjustForm({ productId, current, unit }: { productId: string; current: number; unit: string }) {
  const [state, action] = useActionState<FormResult, FormData>(adjustStockAction, {});

  return (
    <form className="form" action={action}>
      <input type="hidden" name="productId" value={productId} />

      {state.error ? <div className="err">{state.error}</div> : null}
      {state.ok ? <div className="ok-msg">ปรับยอดเรียบร้อย</div> : null}

      <div className="row-fields f2">
        <div className="field">
          <label htmlFor="countedQty">จำนวนที่นับได้จริง ({unit || 'หน่วย'})</label>
          <input className="in mono" id="countedQty" name="countedQty" inputMode="decimal"
                 defaultValue={String(current)} required />
        </div>
        <div className="field">
          <label htmlFor="note">เหตุผล</label>
          <input className="in" id="note" name="note" placeholder="เช่น ตรวจนับประจำเดือน · ของชำรุด" />
        </div>
      </div>

      <div><Submit /></div>
    </form>
  );
}
