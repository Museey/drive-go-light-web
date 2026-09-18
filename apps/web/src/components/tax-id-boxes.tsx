'use client';

import { useRef, useState } from 'react';
import { TAX_ID_LEN, taxIdBoxes, taxIdDigits } from '@/lib/tax-id';

/**
 * ช่องเลขประจำตัวผู้เสียภาษี 13 ช่อง แบบแบบฟอร์มสรรพากร (ผู้ใช้กำหนด 19 ก.ย. 2569)
 *
 * ส่งค่าออกเป็นช่องซ่อนช่องเดียวชื่อเดิม (`taxId`) — ฝั่งเซิร์ฟเวอร์ไม่ต้องรู้ว่าหน้าจอแบ่งกี่ช่อง
 * พิมพ์แล้วเลื่อนช่องเอง · Backspace ในช่องว่างถอยไปช่องก่อน · ลูกศรซ้ายขวาเดินช่อง ·
 * วางทั้งชุด (มีขีดคั่นก็ได้) กระจายลงช่องให้
 */
export function TaxIdBoxes({ name = 'taxId', defaultValue = '', id }: {
  name?: string;
  defaultValue?: string;
  id?: string;
}) {
  const [boxes, setBoxes] = useState<string[]>(() => taxIdBoxes(defaultValue));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const focusAt = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(TAX_ID_LEN - 1, i))];
    el?.focus();
    el?.select();
  };

  const putFrom = (start: number, digits: string) => {
    if (!digits) return;
    setBoxes((old) => {
      const next = [...old];
      for (let k = 0; k < digits.length && start + k < TAX_ID_LEN; k++) next[start + k] = digits[k];
      return next;
    });
    focusAt(start + digits.length);
  };

  return (
    <div className="taxid" data-enter="own">
      {/* ค่าที่ส่งจริง — ฟอร์มเดิมอ่านชื่อนี้อยู่แล้ว */}
      <input type="hidden" name={name} value={boxes.join('')} />
      {boxes.map((v, i) => (
        <input
          key={i}
          id={i === 0 ? id : undefined}
          ref={(el) => { refs.current[i] = el; }}
          className="in mono taxid-box"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`เลขประจำตัวผู้เสียภาษี หลักที่ ${i + 1}`}
          value={v}
          onChange={(e) => putFrom(i, taxIdDigits(e.target.value))}
          onPaste={(e) => { e.preventDefault(); putFrom(i, taxIdDigits(e.clipboardData.getData('text'))); }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault();
              setBoxes((old) => {
                const next = [...old];
                if (next[i]) next[i] = '';
                else if (i > 0) next[i - 1] = '';
                return next;
              });
              if (!boxes[i]) focusAt(i - 1);
            } else if (e.key === 'ArrowLeft') { e.preventDefault(); focusAt(i - 1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); focusAt(i + 1); }
          }}
        />
      ))}
    </div>
  );
}
