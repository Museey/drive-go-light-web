'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { inspectBackupAction, restoreBackupAction } from '../actions';
import type { FormResult } from '@/lib/mutate';
import type { BackupPreview, RestoreResult } from '@/lib/restore';

const COUNT_LABEL: Record<string, string> = {
  products: 'สินค้า',
  customers: 'ลูกค้า',
  vendors: 'ผู้ขาย',
  quotes: 'ใบเสนอราคา',
  invoices: 'ใบส่งมอบ',
  receipts: 'ใบเสร็จ',
  purchases: 'ใบซื้อ',
  expenses: 'ค่าใช้จ่าย',
  categories: 'หมวดหมู่',
  stockMoves: 'การเคลื่อนไหวสต๊อก',
  contacts: 'ผู้ติดต่อ',
  vehicles: 'รถ',
  documents: 'เอกสาร',
  docItems: 'รายการในเอกสาร',
  payments: 'การชำระเงิน',
};

const list = (counts: Record<string, number>) =>
  Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${COUNT_LABEL[k] ?? k} ${n.toLocaleString('en-US')}`)
    .join(' · ');

function Submit({ label, busy, cls = 'btn primary' }: { label: string; busy: string; cls?: string }) {
  const { pending } = useFormStatus();
  return <button className={cls} type="submit" disabled={pending}>{pending ? busy : label}</button>;
}

/**
 * กู้คืนข้อมูลจากไฟล์สำรอง — สองขั้นตอนโดยตั้งใจ
 *
 * ขั้นแรกอ่านไฟล์แล้วบอกว่าจะได้อะไรและจะเสียอะไร ขั้นที่สองถึงลงมือ
 * เพราะการกู้คืนลบข้อมูลเดิมทิ้งก่อนเขียนของใหม่ ถ้ารู้ตอนลบไปแล้วว่าไฟล์ไม่ครบ
 * ก็สายเกินไป — ไฟล์สำรองของเดิมอาจไม่มีใครเก็บไว้
 */
export function RestoreForm() {
  const [check, checkAction] = useActionState<FormResult & { preview?: BackupPreview }, FormData>(
    inspectBackupAction, {},
  );
  const [state, action] = useActionState<FormResult & { result?: RestoreResult }, FormData>(
    restoreBackupAction, {},
  );
  const [open, setOpen] = useState(false);

  /* ---------- กู้คืนเสร็จแล้ว ---------- */
  if (state.ok && state.result) {
    return (
      <div className="ok-msg">
        <b>กู้คืนเรียบร้อย</b>
        <div style={{ marginTop: 6 }}>{list(state.result.counts)}</div>
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

  const preview = check.preview;

  /* ---------- ขั้นที่ 1 · เลือกไฟล์แล้วตรวจ ---------- */
  if (!preview) {
    return (
      <form className="form" action={checkAction}>
        {check.error ? <div className="err">{check.error}</div> : null}

        <div className="note">
          ขั้นแรกระบบจะอ่านไฟล์แล้วบอกว่ามีอะไรอยู่ข้างใน <b>ยังไม่แตะข้อมูลปัจจุบัน</b>
        </div>

        <div className={check.field === 'file' ? 'field bad' : 'field'}>
          <label htmlFor="restoreFile">ไฟล์สำรอง (.json)</label>
          <input className="in" id="restoreFile" type="file" name="file"
                 accept=".json,application/json" required />
        </div>

        <div className="tag-row">
          <Submit label="ตรวจไฟล์" busy="กำลังอ่าน…" />
          <button className="btn" type="button" onClick={() => setOpen(false)}>ปิด</button>
        </div>
      </form>
    );
  }

  /* ---------- ขั้นที่ 2 · เห็นแล้วว่ามีอะไร ค่อยยืนยัน ---------- */
  return (
    <form className="form" action={action}>
      {state.error ? <div className="err">{state.error}</div> : null}

      <div className="ok-msg">
        <b>ไฟล์นี้มีข้อมูล</b>
        <div style={{ marginTop: 4 }}>{list(preview.counts) || 'ไม่พบรายการ'}</div>
      </div>

      {preview.dropped.length ? (
        <div className={preview.needsAcknowledgement ? 'err' : 'note'}>
          <b>ข้อมูลที่ระบบยังรองรับไม่ได้</b>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
            {preview.dropped.map((g) => (
              <li key={g.key}>
                <b>{g.label} {g.count.toLocaleString('en-US')} รายการ</b> —{' '}
                {g.kind === 'lost' ? 'จะไม่ถูกนำเข้า' : 'ยอดยังถูกต้อง แต่ประวัติหาย'}
                <div style={{ fontSize: 12.5, opacity: 0.85 }}>{g.note}</div>
              </li>
            ))}
          </ul>
          {preview.needsAcknowledgement ? (
            <div style={{ marginTop: 10 }}>
              ถ้ารอให้ระบบรองรับก่อนได้ <b>ให้รอ</b> — ข้อมูลในไฟล์ยังอยู่ครบ ไม่ได้หายไปไหน
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="err">
        <b>อ่านก่อนกด</b>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
          <li>ข้อมูลที่มีอยู่ตอนนี้จะถูก<b>ลบทิ้งทั้งหมด</b>แล้วแทนที่ด้วยข้อมูลในไฟล์</li>
          <li>ควรดาวน์โหลดไฟล์สำรองของตอนนี้เก็บไว้ก่อน เผื่อเลือกไฟล์ผิด</li>
          <li>ผู้ใช้งานและรหัสผ่านไม่ถูกแตะ — ไฟล์สำรองไม่มีรหัสผ่านอยู่ในนั้น</li>
          <li>ถ้ากู้คืนไม่สำเร็จกลางทาง ข้อมูลเดิมยังอยู่ครบ ไม่มีสภาพค้างครึ่ง ๆ</li>
        </ul>
      </div>

      {/* ไฟล์ต้องส่งมาอีกรอบ เพราะ server action ไม่ได้เก็บของขั้นก่อนไว้ */}
      <div className={state.field === 'file' ? 'field bad' : 'field'}>
        <label htmlFor="restoreFile2">ยืนยันไฟล์เดิมอีกครั้ง</label>
        <input className="in" id="restoreFile2" type="file" name="file"
               accept=".json,application/json" required />
      </div>

      <div className={state.field === 'confirm' ? 'field bad' : 'field'}>
        <label htmlFor="confirm">พิมพ์คำว่า <b>ทับข้อมูลเดิม</b> เพื่อยืนยัน</label>
        <input className="in" id="confirm" name="confirm" autoComplete="off" required />
      </div>

      {preview.needsAcknowledgement ? (
        <label className="tag-row" style={{ fontSize: 14 }}>
          <input type="checkbox" name="acceptDataLoss" />
          รับทราบว่าข้อมูลที่ระบบยังรองรับไม่ได้จะไม่ตามมา และยอมรับ
        </label>
      ) : null}

      <div className="tag-row">
        <Submit label="กู้คืนทับข้อมูลเดิม" busy="กำลังกู้คืน…" cls="btn danger" />
        <button className="btn" type="button" onClick={() => setOpen(false)}>ไม่กู้คืนแล้ว</button>
      </div>
    </form>
  );
}
