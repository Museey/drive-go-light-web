'use client';

import { useRouter } from 'next/navigation';

/**
 * ปุ่มย้อนกลับลอย
 *
 * รุ่น 6.4 เก็บประวัติหน้าไว้เองในอาเรย์ 40 ช่อง เพราะทั้งโปรแกรมอยู่ที่ URL เดียว
 * เบราว์เซอร์จึงไม่รู้ว่าเปลี่ยนหน้า ของเราทุกหน้ามี URL จริง
 * เรียกประวัติของเบราว์เซอร์ได้ตรง ๆ — ปุ่มนี้กับปุ่มย้อนกลับของเบราว์เซอร์จึงตรงกันเสมอ
 *
 * หน้าพิมพ์ (ผู้ใช้แจ้ง 17 ก.ย. 2569 — "มาที่หน้าพิมพ์แล้ว ปุ่มย้อนกลับไม่ตามมา") ส่ง `fallbackHref` มา:
 * หน้าพิมพ์มักถูกเปิดในแท็บใหม่ ไม่มีหน้าก่อนหน้าให้ย้อน — กดแล้วไปหน้าเอกสารแทนการไม่ทำอะไร
 * `solo` = หน้าที่ไม่มีแถบล่างของมือถือ ปุ่มชิดล่างแทนที่จะลอยค้างเหนือแถบที่ไม่มีอยู่
 */
export function BackFab({ fallbackHref, solo = false }: { fallbackHref?: string; solo?: boolean } = {}) {
  const router = useRouter();

  const back = () => {
    if (fallbackHref && window.history.length <= 1) router.push(fallbackHref);
    else router.back();
  };

  return (
    <button type="button" className={solo ? 'backfab solo no-print' : 'backfab no-print'}
            onClick={back} title="กลับหน้าก่อนหน้า">
      ← ย้อนกลับ
    </button>
  );
}
