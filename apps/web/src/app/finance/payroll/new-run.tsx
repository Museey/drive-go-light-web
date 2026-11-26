'use client';

import { useActionState } from 'react';
import type { FormResult } from '@/lib/mutate';
import { createRunAction } from './actions';

/** เลือกเดือนแล้วเปิดงวด — แสดงเฉพาะเดือนที่ยังไม่มีงวด */
export function NewRunForm({ months }: { months: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<FormResult, FormData>(createRunAction, {});
  return (
    <form autoComplete="off" action={action} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <label htmlFor="period" className="subtle">งวดเดือน</label>
      <select className="in" id="period" name="period" defaultValue={state.values?.period ?? months[0]?.value}>
        {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? 'กำลังเปิดงวด…' : '+ เปิดงวดเงินเดือน'}
      </button>
      {state.error ? <div className="err" role="alert" style={{ flexBasis: '100%' }}>{state.error}</div> : null}
    </form>
  );
}
