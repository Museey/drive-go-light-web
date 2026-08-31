'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveStockColsAction } from './actions';
import type { FormResult } from '@/lib/mutate';
import type { StockCol } from '@/lib/ui-prefs';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn primary" type="submit" disabled={pending}>
    {pending ? 'กำลังบันทึก…' : 'บันทึก'}
  </button>;
}

/**
 * เลือกคอลัมน์ที่แสดงในตารางสินค้า
 * จำไว้ให้ทั้งอู่ และมีผลกับเอกสารที่สั่งพิมพ์ด้วย เหมือนรุ่นเดิม
 */
export function ColPicker({ cols, hidden }: {
  cols: readonly (readonly [string, string])[];
  hidden: StockCol[];
}) {
  const [state, action] = useActionState<FormResult, FormData>(saveStockColsAction, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="btn" type="button" onClick={() => setOpen(true)}>
        เลือกคอลัมน์{hidden.length ? ` (ซ่อน ${hidden.length})` : ''}
      </button>
    );
  }

  return (
    <form action={action} className="tag-row" style={{ flexWrap: 'wrap' }}>
      {state.error ? <span className="chip due">{state.error}</span> : null}
      {cols.map(([k, label]) => (
        <label key={k} className="tag-row" style={{ fontSize: 13 }}>
          <input type="checkbox" name="col" value={k} defaultChecked={!hidden.includes(k as StockCol)} />
          {label}
        </label>
      ))}
      <Submit />
      <button className="btn" type="button" onClick={() => setOpen(false)}>ปิด</button>
    </form>
  );
}
