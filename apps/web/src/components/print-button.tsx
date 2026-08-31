'use client';

/** ปุ่มพิมพ์หน้าปัจจุบัน — ใช้กับรายงานที่ดูบนจอกับพิมพ์เป็นเนื้อหาชุดเดียวกัน */
export function PagePrintButton({ label = 'พิมพ์รายงาน' }: { label?: string }) {
  return (
    <button className="btn no-print" type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}
