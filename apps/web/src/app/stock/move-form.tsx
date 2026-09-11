'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { addMonths } from '@drivegolight/core';
import { stockMoveAction } from './actions';
import type { FormResult } from '@/lib/mutate';

type Dir = 'in' | 'out' | 'use';

const DIR_LABEL: Record<Dir, string> = {
  in: 'รับเข้า',
  out: 'ตัดออก',
  use: 'เบิกใช้ในอู่',
};

const SUBMIT_LABEL: Record<Dir, string> = {
  in: 'รับเข้าสต๊อก',
  out: 'ตัดออกจากสต๊อก',
  use: 'บันทึกการเบิกใช้',
};

function Submit({ direction }: { direction: Dir }) {
  const { pending } = useFormStatus();
  return (
    <button className={`btn ${direction === 'in' ? 'primary' : 'danger'}`} type="submit" disabled={pending}>
      {pending ? 'กำลังบันทึก…' : SUBMIT_LABEL[direction]}
    </button>
  );
}

/**
 * รับเข้าหรือตัดออกด้วยมือ พร้อมระบุวันที่
 * ใช้ตอนรับของที่ไม่ได้เปิดใบซื้อ หรือเบิกของไปใช้ในอู่เอง
 */
export function MoveForm({ productId, unit, today, shelfLifeMonths }: {
  productId: string;
  unit: string;
  today: string;
  /** อายุการเก็บของสินค้าตัวนี้ ใช้เติมวันหมดอายุให้ — ว่าง = ไม่มีวันหมดอายุ */
  shelfLifeMonths: number | null;
}) {
  const [state, action] = useActionState<FormResult, FormData>(stockMoveAction, {});
  const [direction, setDirection] = useState<Dir>('in');
  const [movedOn, setMovedOn] = useState(today);
  const [expiresOn, setExpiresOn] = useState(addMonths(today, shelfLifeMonths) ?? '');
  /* แก้วันหมดอายุเองแล้วห้ามทับ — ของจริงบนกล่องสำคัญกว่าอายุการเก็บที่ตั้งไว้ */
  const [touched, setTouched] = useState(false);

  const changeDate = (d: string) => {
    setMovedOn(d);
    if (!touched && d) setExpiresOn(addMonths(d, shelfLifeMonths) ?? '');
  };

  return (
    <form className="form" action={action}>
      {/* เบิกใช้ในอู่แยกจากตัดออกเฉย ๆ เพราะงบกำไรขาดทุนนับคนละช่อง —
          ของที่เบิกใช้เป็นค่าใช้จ่ายดำเนินงาน ไม่ใช่ต้นทุนขาย */}
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="direction" value={direction} />

      {state.error ? <div className="err">{state.error}</div> : null}
      {state.ok ? (
        <div className="ok-msg">
          บันทึก{DIR_LABEL[(state.values?.direction as Dir) ?? 'in']}เรียบร้อย
        </div>
      ) : null}

      <div className="tag-row" style={{ marginBottom: 12 }}>
        {(['in', 'out', 'use'] as const).map((d) => (
          <button key={d} type="button" className="chip"
                  onClick={() => setDirection(d)}
                  aria-pressed={direction === d}
                  style={direction === d
                    ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' }
                    : undefined}>
            {DIR_LABEL[d]}
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
          <input className="in mono" id="movedOn" name="movedOn" type="date" required
                 value={movedOn} onChange={(e) => changeDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="moveNote">หมายเหตุ</label>
          <input className="in" id="moveNote" name="note"
                 placeholder={
                   direction === 'in' ? 'เช่น รับจากร้านอะไหล่ ใบส่งของเลขที่…'
                   : direction === 'use' ? 'เช่น น้ำยาล้างชิ้นส่วน ใช้กับงานในอู่'
                   : 'เช่น ของชำรุด / คืนผู้ขาย'} />
        </div>
      </div>

      {/* วันหมดอายุเป็นคุณสมบัติของของที่รับเข้า ตอนตัดออกจึงไม่มีช่องนี้ —
          ฐานข้อมูลก็ปฏิเสธแถวตัดออกที่มีวันหมดอายุอยู่แล้ว (stock_move_expiry_on_receipt) */}
      {direction === 'in' ? (
        <div className="row-fields f3" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="moveExpiresOn">วันหมดอายุของล็อตนี้</label>
            <input className="in mono" id="moveExpiresOn" name="expiresOn" type="date"
                   value={expiresOn}
                   onChange={(e) => { setTouched(true); setExpiresOn(e.target.value); }} />
            <span className="hint">
              {shelfLifeMonths
                ? `เติมให้จากอายุการเก็บ ${shelfLifeMonths} เดือน แก้ได้ถ้าของจริงไม่ตรง`
                : 'เว้นว่างได้ถ้าของไม่มีวันหมดอายุ'}
            </span>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 12 }}><Submit direction={direction} /></div>
    </form>
  );
}
