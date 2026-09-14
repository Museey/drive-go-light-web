'use client';

import { useEffect } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * ยืนยันก่อนบันทึก — แผงเลื่อนเข้าจากขวา "ตรวจสอบถูกต้องแล้ว:"
 *
 * ทุกเอกสารใช้ตัวเดียวกัน: ปุ่มบันทึกในฟอร์มเป็น type="button" ที่เปิดแผงนี้
 * ปุ่ม "บันทึก" (เขียว) ในแผงคือ type="submit" ตัวจริง — ต้องวางแผงไว้ *ในฟอร์ม*
 * ปุ่ม "แก้ไข" (อำพัน) ปิดแผงกลับไปแก้ · กดฉากหลังหรือ Esc = แก้ไข
 *
 * Enter ในช่องกรอกต้องไม่ส่งฟอร์มข้ามแผงนี้ — ฟอร์มต้องกัน implicit submit เอง
 */
export function ConfirmSave({ open, title, lines, submitLabel = 'บันทึก', onEdit }: {
  open: boolean;
  /** เช่น "ใบเสนอราคา" */
  title: string;
  /** สรุปสิ่งที่กำลังจะบันทึก ให้ผู้ใช้กวาดตาตรวจก่อน */
  lines: { label: string; value: string }[];
  submitLabel?: string;
  onEdit: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onEdit(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onEdit]);

  if (!open) return null;

  return (
    <>
      <button className="scrim" type="button" aria-label="ปิดแล้วแก้ไข" onClick={onEdit} />
      <div className="confirm" role="dialog" aria-modal="true" aria-label="ยืนยันการบันทึก">
        <header>
          <b>ตรวจสอบถูกต้องแล้ว:</b>
          <span className="subtle">{title}</span>
        </header>
        <dl className="kv">
          {lines.map((l) => (
            <div key={l.label} className="kvrow"><dt>{l.label}</dt><dd>{l.value}</dd></div>
          ))}
        </dl>
        <div className="acts">
          <SubmitBtn label={submitLabel} />
          <button className="btn amber" type="button" onClick={onEdit}>แก้ไข</button>
        </div>
      </div>
    </>
  );
}

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn ok" type="submit" disabled={pending} autoFocus>
      {pending ? 'กำลังบันทึก…' : label}
    </button>
  );
}
