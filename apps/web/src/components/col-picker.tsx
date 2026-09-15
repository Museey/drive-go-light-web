'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { FormResult } from '@/lib/mutate';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn primary" type="submit" disabled={pending}>
    {pending ? 'กำลังบันทึก…' : 'บันทึกการแสดงผล'}
  </button>;
}

/**
 * การ์ดตั้งค่าการแสดงผลตาราง — ติ๊กเลือกคอลัมน์ที่ต้องการเห็น ข้อมูลทุกช่องยังเก็บครบ
 *
 * ใช้ร่วมกันระหว่างทะเบียนสินค้าและทะเบียนลูกค้า/ผู้ขาย (แยกออกมาจาก stock/col-picker ไม่คัดลอก)
 * คอลัมน์ใน `fixed` ติ๊กออกไม่ได้ · ค่าที่ตั้งจำไว้ให้ทั้งอู่ผ่าน `action` ของแต่ละตาราง
 */
export function ColPicker({ cols, hidden, fixed, action: save, title, basicHint, startOpen = false }: {
  cols: readonly (readonly [string, string])[];
  hidden: readonly string[];
  fixed: readonly string[];
  /** server action ที่บันทึกคอลัมน์ที่ซ่อน — รับค่า col ที่ติ๊กไว้ทั้งหมด */
  action: (prev: FormResult, fd: FormData) => Promise<FormResult>;
  /** เช่น "ตั้งค่าการแสดงผลรายการสินค้า" */
  title: string;
  /** บอกค่าพื้นฐาน เช่น "พื้นฐาน: รหัสสินค้า · ชื่อสินค้า · คงเหลือ · ราคา A" */
  basicHint: string;
  startOpen?: boolean;
}) {
  const [state, action] = useActionState<FormResult, FormData>(save, {});
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
      <header><h2>{title}</h2><div className="spacer" /><span className="subtle">ติ๊กคอลัมน์ที่ต้องการให้เห็นในตาราง · ข้อมูลทุกช่องยังเก็บครบเหมือนเดิม</span></header>
      <form autoComplete="off" action={action} className="body">
        {state.error ? <div className="err" style={{ marginBottom: 10 }}>{state.error}</div> : null}
        <div className="tiles">
          {cols.map(([k, label]) => {
            const isFixed = fixed.includes(k);
            const on = isFixed || !hidden.includes(k);
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
          <span className="hint">{basicHint}</span>
        </div>
      </form>
    </div>
  );
}
