'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { stockMoveAction } from './actions';
import type { FormResult } from '@/lib/mutate';

function Submit({ direction }: { direction: 'in' | 'out' }) {
  const { pending } = useFormStatus();
  return (
    <button className={`btn ${direction === 'in' ? 'primary' : 'danger'}`} type="submit" disabled={pending}>
      {pending ? 'กำลังบันทึก…' : direction === 'in' ? 'รับเข้าสต๊อก' : 'ตัดออกจากสต๊อก'}
    </button>
  );
}

/**
 * รับเข้าหรือตัดออกด้วยมือ พร้อมระบุวันที่
 * ใช้ตอนรับของที่ไม่ได้เปิดใบซื้อ หรือเบิกของไปใช้ในอู่เอง
 */
export function MoveForm({ productId, unit, today }: {
  productId: string;
  unit: string;
  today: string;
}) {
  const [state, action] = useActionState<FormResult, FormData>(stockMoveAction, {});
  const [direction, setDirection] = useState<'in' | 'out'>('in');

  return (
    <form className="form" action={action}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="direction" value={direction} />

      {state.error ? <div className="err">{state.error}</div> : null}
      {state.ok ? (
        <div className="ok-msg">
          บันทึก{state.values?.direction === 'out' ? 'การตัดออก' : 'การรับเข้า'}เรียบร้อย
        </div>
      ) : null}

      <div className="tag-row" style={{ marginBottom: 12 }}>
        {(['in', 'out'] as const).map((d) => (
          <button key={d} type="button" className="chip"
                  onClick={() => setDirection(d)}
                  aria-pressed={direction === d}
                  style={direction === d
                    ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' }
                    : undefined}>
            {d === 'in' ? 'รับเข้า' : 'ตัดออก'}
          </button>
        ))}
      </div>

      <div className="row-fields f3">
        <div className={state.field === 'qty' ? 'field bad' : 'field'}>
          <label htmlFor="qty">จำนวน ({unit || 'หน่วย'})</label>
          <input className="in mono" id="qty" name="qty" inputMode="decimal" defaultValue="1" required />
        </div>
        <div className={state.field === 'movedOn' ? 'field bad' : 'field'}>
          <label htmlFor="movedOn">วันที่</label>
          <input className="in mono" id="movedOn" name="movedOn" type="date" defaultValue={today} required />
        </div>
        <div className="field">
          <label htmlFor="moveNote">หมายเหตุ</label>
          <input className="in" id="moveNote" name="note"
                 placeholder={direction === 'in' ? 'เช่น รับจากร้านอะไหล่ ใบส่งของเลขที่…' : 'เช่น เบิกใช้งาน / ของชำรุด'} />
        </div>
      </div>

      <div><Submit direction={direction} /></div>
    </form>
  );
}
