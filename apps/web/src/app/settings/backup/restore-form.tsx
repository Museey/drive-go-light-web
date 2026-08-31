'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { restoreBackupAction } from '../actions';
import type { FormResult } from '@/lib/mutate';
import type { RestoreResult } from '@/lib/restore';

const COUNT_LABEL: Record<string, string> = {
  categories: 'หมวดหมู่',
  products: 'สินค้า',
  stockMoves: 'การเคลื่อนไหวสต๊อก',
  contacts: 'ผู้ติดต่อ',
  vehicles: 'รถ',
  documents: 'เอกสาร',
  docItems: 'รายการในเอกสาร',
  payments: 'การชำระเงิน',
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn danger" type="submit" disabled={pending}>
      {pending ? 'กำลังกู้คืน…' : 'กู้คืนทับข้อมูลเดิม'}
    </button>
  );
}

export function RestoreForm() {
  const [state, action] = useActionState<FormResult & { result?: RestoreResult }, FormData>(
    restoreBackupAction, {},
  );
  const [open, setOpen] = useState(false);

  if (state.ok && state.result) {
    const c = state.result.counts;
    return (
      <div className="ok-msg">
        <b>กู้คืนเรียบร้อย</b>
        <div style={{ marginTop: 6 }}>
          {Object.entries(COUNT_LABEL)
            .filter(([k]) => (c[k] ?? 0) > 0)
            .map(([k, label]) => `${label} ${(c[k] ?? 0).toLocaleString('en-US')}`)
            .join(' · ')}
        </div>
        {state.result.warnings.length ? (
          <ul style={{ margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
            {state.result.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        ) : null}
      </div>
    );
  }

  if (!open) {
    return (
      <button className="btn" type="button" onClick={() => setOpen(true)}>
        กู้คืนข้อมูลจากไฟล์สำรอง
      </button>
    );
  }

  return (
    <form className="form" action={action}>
      {state.error ? <div className="err">{state.error}</div> : null}

      <div className="err">
        <b>อ่านก่อนกด</b>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
          <li>ข้อมูลที่มีอยู่ตอนนี้จะถูก<b>ลบทิ้งทั้งหมด</b>แล้วแทนที่ด้วยข้อมูลในไฟล์</li>
          <li>ควรดาวน์โหลดไฟล์สำรองของตอนนี้เก็บไว้ก่อน เผื่อเลือกไฟล์ผิด</li>
          <li>ผู้ใช้งานและรหัสผ่านไม่ถูกแตะ — ไฟล์สำรองไม่มีรหัสผ่านอยู่ในนั้น</li>
          <li>ถ้ากู้คืนไม่สำเร็จกลางทาง ข้อมูลเดิมยังอยู่ครบ ไม่มีสภาพค้างครึ่ง ๆ</li>
        </ul>
      </div>

      <div className={state.field === 'file' ? 'field bad' : 'field'}>
        <label htmlFor="restoreFile">ไฟล์สำรอง (.json)</label>
        <input className="in" id="restoreFile" type="file" name="file" accept=".json,application/json" required />
      </div>

      <div className={state.field === 'confirm' ? 'field bad' : 'field'}>
        <label htmlFor="confirm">พิมพ์คำว่า <b>ทับข้อมูลเดิม</b> เพื่อยืนยัน</label>
        <input className="in" id="confirm" name="confirm" autoComplete="off" required />
      </div>

      <div className="tag-row">
        <Submit />
        <button className="btn" type="button" onClick={() => setOpen(false)}>ไม่กู้คืนแล้ว</button>
      </div>
    </form>
  );
}
