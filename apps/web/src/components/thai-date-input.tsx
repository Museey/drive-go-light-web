'use client';

import { useEffect, useState } from 'react';
import { CalendarButton } from './thai-calendar';
import { formatThaiDate, parseThaiDate } from '@/lib/thai-date';

/**
 * ช่องวันที่ วว/ดด/ปป (พ.ศ.) — ส่งค่าเข้าฟอร์มเป็น ISO ผ่าน input ซ่อนชื่อ `name`
 * ฝั่งเซิร์ฟเวอร์จึงอ่านเหมือนเดิม (rangeFromParams ฯลฯ) ไม่ต้องแก้
 * พิมพ์ผิดรูป → ขอบแดงและไม่ส่งค่า (ดีกว่าเดาวันให้แล้วกรองผิดเงียบ ๆ)
 *
 * ใช้แทน <input type="date"> ทั้งระบบ (ผู้ใช้กำหนด: ปฏิทินภาษาไทยทั้งหมด) — ของเบราว์เซอร์แสดง ค.ศ.
 * และภาษาตามเครื่อง · `full` = กว้างเต็มช่องในฟอร์มแบบกริด · `required` ตรวจที่ช่องที่มองเห็น
 */
export function ThaiDateInput({ name, defaultIso, ariaLabel, id, required, disabled, full }: {
  name: string; defaultIso?: string | null; ariaLabel?: string;
  id?: string; required?: boolean; disabled?: boolean; full?: boolean;
}) {
  const [text, setText] = useState(formatThaiDate(defaultIso));
  const iso = text.trim() === '' ? '' : parseThaiDate(text);
  const bad = iso === null;

  return (
    <span className={full ? 'datein full' : 'datein'}>
      <input className="in mono" inputMode="numeric" placeholder="วว/ดด/ปป" aria-label={ariaLabel}
             id={id} required={required} disabled={disabled} autoComplete="off"
             value={text} onChange={(e) => setText(e.target.value)}
             style={{ width: full ? undefined : 104, borderColor: bad ? 'var(--due)' : undefined }}
             title={bad ? 'พิมพ์เป็น วว/ดด/ปป เช่น 13/09/69' : undefined} />
      {/* เลือกจากปฏิทินได้ (ผู้ใช้ขอ) — พิมพ์เองก็ยังได้ */}
      {disabled ? null : <CalendarButton value={iso || null} onPick={(v) => setText(formatThaiDate(v))} />}
      <input type="hidden" name={name} value={iso ?? ''} />
    </span>
  );
}

/**
 * ช่องวันที่ วว/ดด/ปป ที่ผูกกับ state (ฟอร์มที่เก็บค่าเองเป็น ISO) — ใช้ในตัวแก้ไขเอกสาร
 * พิมพ์ครบและถูกรูปเมื่อไรค่อยส่งขึ้น ไม่ส่งค่าพังระหว่างพิมพ์
 *
 * `name` = ส่งเข้าฟอร์มด้วย (input ซ่อน) · `onCommit` = เรียกตอนออกจากช่องหรือเลือกจากปฏิทิน
 * พร้อมค่าล่าสุด — ใช้บันทึกอัตโนมัติ (เลือกจากปฏิทินไม่ทำให้ช่องเสียโฟกัส onBlur จึงไม่พอ)
 * `allowEmpty` = ลบทั้งช่องแล้วส่งค่าว่างขึ้นไป (ช่องที่เว้นว่างได้ เช่นวันหมดอายุ) —
 * ค่าตั้งต้นไม่ส่ง เพราะวันที่เอกสารลบแล้วต้องคงค่าเดิมไว้ ไม่ใช่กลายเป็นเอกสารไม่มีวันที่
 */
export function ThaiDateField({ id, value, onChange, style, name, required, disabled, full, onCommit, allowEmpty }: {
  id?: string; value: string; onChange: (iso: string) => void; style?: React.CSSProperties;
  name?: string; required?: boolean; disabled?: boolean; full?: boolean;
  onCommit?: (iso: string) => void; allowEmpty?: boolean;
}) {
  const [text, setText] = useState(formatThaiDate(value));
  useEffect(() => { setText(formatThaiDate(value)); }, [value]);
  const bad = text.trim() !== '' && parseThaiDate(text) === null;
  return (
    <span className={full ? 'datein full' : 'datein'}>
      <input className="in mono" id={id} inputMode="numeric" placeholder="วว/ดด/ปป" value={text}
             required={required} disabled={disabled} autoComplete="off"
             style={{ ...style, borderColor: bad ? 'var(--due)' : style?.borderColor }}
             onChange={(e) => {
               setText(e.target.value);
               const iso = parseThaiDate(e.target.value);
               if (iso) onChange(iso);
               else if (allowEmpty && e.target.value.trim() === '') onChange('');
             }}
             onBlur={() => { const iso = parseThaiDate(text); if (iso) onCommit?.(iso); }} />
      {disabled ? null : (
        <CalendarButton value={value} onPick={(v) => { if (v) { onChange(v); onCommit?.(v); } }} />
      )}
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </span>
  );
}
