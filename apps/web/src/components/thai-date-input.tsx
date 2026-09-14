'use client';

import { useEffect, useState } from 'react';
import { CalendarButton } from './thai-calendar';
import { formatThaiDate, parseThaiDate } from '@/lib/thai-date';

/**
 * ช่องวันที่ วว/ดด/ปป (พ.ศ.) — ส่งค่าเข้าฟอร์มเป็น ISO ผ่าน input ซ่อนชื่อ `name`
 * ฝั่งเซิร์ฟเวอร์จึงอ่านเหมือนเดิม (rangeFromParams ฯลฯ) ไม่ต้องแก้
 * พิมพ์ผิดรูป → ขอบแดงและไม่ส่งค่า (ดีกว่าเดาวันให้แล้วกรองผิดเงียบ ๆ)
 */
export function ThaiDateInput({ name, defaultIso, ariaLabel }: {
  name: string; defaultIso?: string | null; ariaLabel?: string;
}) {
  const [text, setText] = useState(formatThaiDate(defaultIso));
  const iso = text.trim() === '' ? '' : parseThaiDate(text);
  const bad = iso === null;

  return (
    <span className="datein">
      <input className="in mono" inputMode="numeric" placeholder="วว/ดด/ปป" aria-label={ariaLabel}
             value={text} onChange={(e) => setText(e.target.value)}
             style={{ width: 104, borderColor: bad ? 'var(--due)' : undefined }}
             title={bad ? 'พิมพ์เป็น วว/ดด/ปป เช่น 13/09/69' : undefined} />
      {/* เลือกจากปฏิทินได้ (ผู้ใช้ขอ) — พิมพ์เองก็ยังได้ */}
      <CalendarButton value={iso || null} onPick={(v) => setText(formatThaiDate(v))} />
      <input type="hidden" name={name} value={iso ?? ''} />
    </span>
  );
}

/**
 * ช่องวันที่ วว/ดด/ปป ที่ผูกกับ state (ฟอร์มที่เก็บค่าเองเป็น ISO) — ใช้ในตัวแก้ไขเอกสาร
 * พิมพ์ครบและถูกรูปเมื่อไรค่อยส่งขึ้น ไม่ส่งค่าพังระหว่างพิมพ์
 */
export function ThaiDateField({ id, value, onChange, style }: {
  id?: string; value: string; onChange: (iso: string) => void; style?: React.CSSProperties;
}) {
  const [text, setText] = useState(formatThaiDate(value));
  useEffect(() => { setText(formatThaiDate(value)); }, [value]);
  const bad = text.trim() !== '' && parseThaiDate(text) === null;
  return (
    <span className="datein">
      <input className="in mono" id={id} inputMode="numeric" placeholder="วว/ดด/ปป" value={text}
             style={{ ...style, borderColor: bad ? 'var(--due)' : style?.borderColor }}
             onChange={(e) => {
               setText(e.target.value);
               const iso = parseThaiDate(e.target.value);
               if (iso) onChange(iso);
             }} />
      <CalendarButton value={value} onPick={(v) => { if (v) onChange(v); }} />
    </span>
  );
}
