'use client';

/**
 * ปุ่มพิมพ์รายงานของหน้ารายการ — ทุกหน้าเอกสารพิมพ์ได้ (ผู้ใช้ขอ)
 * ใช้ @media print ใน globals.css: ซ่อนเมนู/แถบเครื่องมือ เหลือหัวรายงาน + ตาราง
 */
export function PrintReport({ label = '🖨 พิมพ์รายงาน' }: { label?: string }) {
  return (
    <button className="btn" type="button" onClick={() => window.print()} title="พิมพ์รายการที่แสดงอยู่เป็นรายงาน">
      {label}
    </button>
  );
}
