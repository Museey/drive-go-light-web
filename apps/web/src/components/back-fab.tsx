'use client';

import { useRouter } from 'next/navigation';

/**
 * ปุ่มย้อนกลับลอย
 *
 * รุ่น 6.4 เก็บประวัติหน้าไว้เองในอาเรย์ 40 ช่อง เพราะทั้งโปรแกรมอยู่ที่ URL เดียว
 * เบราว์เซอร์จึงไม่รู้ว่าเปลี่ยนหน้า ของเราทุกหน้ามี URL จริง
 * เรียกประวัติของเบราว์เซอร์ได้ตรง ๆ — ปุ่มนี้กับปุ่มย้อนกลับของเบราว์เซอร์จึงตรงกันเสมอ
 */
export function BackFab() {
  const router = useRouter();

  return (
    <button type="button" className="backfab no-print"
            onClick={() => router.back()} title="กลับหน้าก่อนหน้า">
      ← ย้อนกลับ
    </button>
  );
}
