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
export interface ConfirmItem {
  name: string;
  qty: number;
  unit?: string;
  /** ยอดรวมของบรรทัด (หลังหักส่วนลดรายบรรทัดแล้ว) */
  amount: number;
}

export function ConfirmSave({ open, title, lines, items, warn, submitLabel = 'บันทึก', onEdit }: {
  open: boolean;
  /** เช่น "ใบเสนอราคา" */
  title: string;
  /** สรุปสิ่งที่กำลังจะบันทึก ให้ผู้ใช้กวาดตาตรวจก่อน */
  lines: { label: string; value: string }[];
  /** รายการในเอกสาร — เติมพื้นที่ว่างกลางแผงด้วยของจริงที่กำลังจะบันทึก (ผู้ใช้แจ้ง 19 ก.ย. 2569) */
  items?: ConfirmItem[];
  /**
   * สิ่งที่เอกสารนี้จะ **ไม่** ทำ แต่ผู้ใช้น่าจะคิดว่าทำ — ว่าง = ไม่มีอะไรต้องเตือน
   *
   * ที่ต้องอยู่ในแผงยืนยันไม่ใช่แค่ในฟอร์ม เพราะของที่อยู่บนฟอร์มถูกเลื่อนพ้นตาไปแล้ว
   * ตอนกดบันทึก — จุดนี้คือจุดสุดท้ายที่ยังกลับไปแก้ได้
   */
  warn?: string;
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
        {items?.length ? (
          <div className="confirm-items">
            <div className="ci-head">รายการที่กำลังบันทึก</div>
            <ol>
              {items.map((it, i) => (
                <li key={i}>
                  <span className="nm">{it.name}</span>
                  <span className="qt">{fmtQty(it.qty)}{it.unit ? ` ${it.unit}` : ''}</span>
                  <span className="amt mono">{money(it.amount)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {warn ? <div className="confirm-warn" role="alert">⚠ {warn}</div> : null}

        <div className="acts">
          <SubmitBtn label={submitLabel} />
          <button className="btn amber" type="button" onClick={onEdit}>แก้ไข</button>
        </div>
      </div>
    </>
  );
}

/** ทศนิยมของจำนวนเอาเท่าที่มีจริง — 2 ชิ้นไม่ต้องขึ้นว่า 2.00 */
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn ok" type="submit" disabled={pending} autoFocus>
      {pending ? 'กำลังบันทึก…' : label}
    </button>
  );
}
