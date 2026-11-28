'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ThaiDateInput } from '@/components/thai-date-input';
import { APPT_KINDS, type Appointment } from '@/lib/appointments-core';
import type { FormResult } from '@/lib/mutate';
import { saveAppointmentAction } from '../actions';

/** ฟอร์มนัด — บันทึกไม่ผ่านแล้วค่าที่กรอกยังอยู่ครบ (state.values) */
export function ApptForm({ initial, mayEdit }: {
  initial: Omit<Appointment, 'id' | 'status' | 'notifiedAt'> & { id: string | null };
  mayEdit: boolean;
}) {
  const [state, action, pending] = useActionState<FormResult, FormData>(saveAppointmentAction, {});
  const v = state.values ?? {};
  const bad = (f: string) => (state.field === f ? 'field bad' : 'field');

  return (
    <form autoComplete="off" className="form card" action={action} style={{ padding: 16 }}>
      <input type="hidden" name="id" value={initial.id ?? ''} />
      <input type="hidden" name="contactId" value={initial.contactId ?? ''} />
      <input type="hidden" name="vehicleId" value={initial.vehicleId ?? ''} />
      {state.error ? <div className="err" role="alert">{state.error}</div> : null}

      <div className="row-fields f3">
        <div className={bad('kind')}>
          <label htmlFor="kind">ชนิด</label>
          <select className="in" id="kind" name="kind" defaultValue={v.kind ?? initial.kind} disabled={!mayEdit}>
            {APPT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </div>
        <div className={bad('date')}>
          <label htmlFor="date">วันที่ *</label>
          <ThaiDateInput id="date" name="date" defaultIso={v.date ?? initial.date} required disabled={!mayEdit} full />
        </div>
        <div className={bad('time')}>
          <label htmlFor="time">เวลา</label>
          <input className="in mono" id="time" name="time" type="time" defaultValue={v.time ?? initial.time} readOnly={!mayEdit} />
        </div>
      </div>

      <div className={bad('title')}>
        <label htmlFor="title">เรื่องที่นัด *</label>
        <input className="in" id="title" name="title" defaultValue={v.title ?? initial.title} required readOnly={!mayEdit}
               placeholder="เช่น เช็กระยะ 40,000 กม. · เปลี่ยนถ่ายน้ำมันเครื่อง · ต่อ พ.ร.บ." />
      </div>

      <div className="row-fields f3">
        <div className={bad('partyName')}>
          <label htmlFor="partyName">ชื่อลูกค้า</label>
          <input className="in" id="partyName" name="partyName" defaultValue={v.partyName ?? initial.partyName} readOnly={!mayEdit} />
        </div>
        <div className="field">
          <label htmlFor="tel">เบอร์โทร</label>
          <input className="in mono" id="tel" name="tel" inputMode="tel" defaultValue={v.tel ?? initial.tel} readOnly={!mayEdit} />
        </div>
        <div className="field">
          <label htmlFor="plate">ทะเบียนรถ</label>
          <input className="in" id="plate" name="plate" defaultValue={v.plate ?? initial.plate} readOnly={!mayEdit} />
        </div>
      </div>
      {initial.contactId ? (
        <span className="hint">
          ผูกกับ <Link href={`/customers/${initial.contactId}`} style={{ textDecoration: 'underline' }}>ลูกค้าในทะเบียน</Link> —
          แก้ชื่อหรือเบอร์ตรงนี้มีผลเฉพาะนัดนี้ ไม่แก้ทะเบียนลูกค้า
        </span>
      ) : (
        <span className="hint">กรอกอย่างน้อยหนึ่งอย่าง — ชื่อ เบอร์ หรือทะเบียน · อยากให้เติมอัตโนมัติ ให้กด "+ นัดหมาย" จากหน้าลูกค้า</span>
      )}

      <div className="field">
        <label htmlFor="note">หมายเหตุ</label>
        <textarea className="in" id="note" name="note" rows={2} defaultValue={v.note ?? initial.note} readOnly={!mayEdit} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {mayEdit ? (
          <button className="btn primary" type="submit" disabled={pending}>
            {pending ? 'กำลังบันทึก…' : 'บันทึกนัด'}
          </button>
        ) : null}
        <Link className="btn" href="/customers/appointments">ยกเลิก</Link>
      </div>
    </form>
  );
}
