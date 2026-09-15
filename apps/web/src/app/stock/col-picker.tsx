'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveStockColsAction } from './actions';
import type { FormResult } from '@/lib/mutate';
import type { StockCol } from '@/lib/ui-prefs';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn primary" type="submit" disabled={pending}>
    {pending ? 'กำลังบันทึก…' : 'บันทึกการแสดงผล'}
  </button>;
}

/**
 * การ์ดตั้งค่าการแสดงผลรายการสินค้า — ติ๊กเลือกได้ทุกคอลัมน์ตั้งแต่รหัสถึงเคลื่อนไหวล่าสุด
 * รหัสและชื่อสินค้าติ๊กออกไม่ได้ · พื้นฐานเปิดไว้ รหัส ชื่อ คงเหลือ ราคา A
 * จำไว้ให้ทั้งอู่ และมีผลกับรายการที่สั่งพิมพ์ด้วย
 * เปิดมาเป็นการ์ดทันทีเมื่อมาจากการ์ด "05.8 ตั้งค่าการแสดงผล" (?cols=1)
 */
export function ColPicker({ cols, hidden, fixed, startOpen = false }: {
  cols: readonly (readonly [string, string])[];
  hidden: StockCol[];
  fixed: readonly StockCol[];
  startOpen?: boolean;
}) {
  const [state, action] = useActionState<FormResult, FormData>(saveStockColsAction, {});
  const [open, setOpen] = useState(startOpen);

  if (!open) {
    return (
      <button className="btn" type="button" onClick={() => setOpen(true)}>
        ตั้งค่าการแสดงผล{hidden.length ? ` (ซ่อน ${hidden.length})` : ''}
      </button>
    );
  }

  return (
    <div className="card" style={{ margin: '0 0 12px', flexBasis: '100%' }}>
      <header><h2>ตั้งค่าการแสดงผลรายการสินค้า</h2><div className="spacer" /><span className="subtle">ติ๊กคอลัมน์ที่ต้องการให้เห็นในตาราง · ข้อมูลทุกช่องยังเก็บครบเหมือนเดิม</span></header>
      <form autoComplete="off" action={action} className="body">
        {state.error ? <div className="err" style={{ marginBottom: 10 }}>{state.error}</div> : null}
        <div className="tiles">
          {cols.map(([k, label]) => {
            const isFixed = fixed.includes(k as StockCol);
            const on = isFixed || !hidden.includes(k as StockCol);
            return (
              <label key={k} className={`tile${on ? ' on' : ''}`} style={{ minHeight: 46 }} title={isFixed ? 'แสดงเสมอ' : undefined}>
                <input type="checkbox" name="col" value={k} defaultChecked={on} disabled={isFixed} />
                {label}{isFixed ? <span className="k">เสมอ</span> : null}
              </label>
            );
          })}
        </div>
        {/* คอลัมน์ที่แสดงเสมอถูก disabled จึงไม่ส่งค่า — ส่งแยกให้เซิร์ฟเวอร์รู้ว่ายังเปิด */}
        {fixed.map((k) => <input key={k} type="hidden" name="col" value={k} />)}
        <div className="formbar">
          <Submit />
          <button className="btn" type="button" onClick={() => setOpen(false)}>ปิด</button>
          <span className="hint">พื้นฐาน: รหัสสินค้า · ชื่อสินค้า · คงเหลือ · ราคา A</span>
        </div>
      </form>
    </div>
  );
}
