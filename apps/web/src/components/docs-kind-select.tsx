'use client';

import { useRouter } from 'next/navigation';

/**
 * dropdown เลือกชนิดเอกสารของการ์ด "เอกสารที่ออก" บนหน้าแรก
 *
 * ชนิดที่เลือกอยู่ใน URL (`?dk=`) ไม่ใช่ state ของหน้าจอ — ตัวเลขคิดที่เซิร์ฟเวอร์
 * รีเฟรชหรือส่งลิงก์ต่อแล้วได้การ์ดเดิม · ช่วงวันที่ที่เลือกไว้ติดไปด้วยเสมอ
 * `scroll: false` — เปลี่ยนชนิดแล้วหน้าต้องไม่เด้งกลับขึ้นบนสุด
 */
export function DocsKindSelect({ value, options, from, to }: {
  value: string;
  options: { key: string; label: string }[];
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  return (
    <select className="in" aria-label="ชนิดเอกสาร" value={value}
            onChange={(e) => {
              const q = new URLSearchParams();
              if (from) q.set('from', from);
              if (to) q.set('to', to);
              /* ใบเสนอราคาเป็นค่าเริ่มต้น — ไม่ต้องใส่ใน URL */
              if (e.target.value !== 'QT') q.set('dk', e.target.value);
              const s = q.toString();
              router.replace(s ? `/?${s}` : '/', { scroll: false });
            }}>
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  );
}
