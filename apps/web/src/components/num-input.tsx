'use client';

import { useEffect, useState, type InputHTMLAttributes } from 'react';

/**
 * ช่องกรอกตัวเลขที่พิมพ์ทศนิยมได้
 *
 * เดิมช่องจำนวน ราคา ส่วนลด และยอดชำระผูก `value` กับตัวเลขใน state ตรง ๆ
 * แล้วแปลงทุกครั้งที่พิมพ์ด้วย `Number(e.target.value) || 0` — พิมพ์ "1." ได้ 1
 * ช่องจึงถูกเขียนทับกลับเป็น "1" จุดทศนิยมหายทันที พิมพ์ 1.5 แล้วได้ 15
 * (จำนวน 1.5 ลิตรกลายเป็น 15 ลิตร ราคา 99.50 กลายเป็น 9950)
 *
 * ที่นี่เก็บ**ข้อความที่กำลังพิมพ์**ไว้ในตัวเอง ส่งตัวเลขให้ผู้เรียกทุกครั้งที่เปลี่ยน
 * และเขียนทับข้อความเฉพาะเมื่อค่าจากข้างนอกไม่ตรงกับที่พิมพ์อยู่จริง ๆ
 * (เช่น ผู้เรียกบีบค่าเข้าช่วง กดปุ่มรับเงินเต็มจำนวน หรือแถวถูกลบแล้วเลื่อนขึ้นมาแทน)
 */

const parse = (text: string): number => {
  const v = Number(text.replace(/,/g, ''));
  return Number.isFinite(v) ? v : 0;
};

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number;
  onNum: (value: number) => void;
  /** ค่า 0 แสดงเป็นช่องว่าง (ให้ placeholder ขึ้น) แทนเลข 0 */
  blankZero?: boolean;
};

export function NumInput({ value, onNum, blankZero, ...rest }: Props) {
  const show = (v: number) => (blankZero && !v ? '' : String(v));
  const [text, setText] = useState(show(value));

  /* ตรวจหลังวาดทุกรอบ ไม่ใช่เฉพาะตอน value เปลี่ยน — ผู้เรียกอาจ**ไม่รับ**ค่าที่พิมพ์
     (เช่น บรรทัดว่างที่จำนวนต้องเป็น 0 เสมอ หรือส่วนลดที่ถูกบีบไว้ที่ 100) ซึ่ง value จะเท่าเดิม
     ถ้ารอให้ value เปลี่ยน ช่องจะค้างแสดงเลขที่ไม่ได้ถูกบันทึกจริง */
  useEffect(() => {
    if (parse(text) !== value) setText(show(value));
  });

  return (
    <input
      inputMode="decimal"
      autoComplete="off"
      {...rest}
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        /* รับเฉพาะตัวเลข จุลภาคคั่นหลัก และจุดทศนิยมหนึ่งจุด — อย่างอื่นไม่เปลี่ยนค่าเงียบ ๆ */
        if (!/^-?[\d,]*\.?\d*$/.test(next)) return;
        setText(next);
        onNum(parse(next));
      }}
    />
  );
}
