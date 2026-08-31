import { getShop } from '@/lib/queries';
import { thDateLong } from '@/lib/format';

/**
 * หัวกระดาษสำหรับรายงาน — ซ่อนบนจอ ขึ้นเฉพาะตอนพิมพ์
 * รายงานที่พิมพ์ออกไปต้องบอกได้ว่าเป็นของอู่ไหน ช่วงไหน และพิมพ์เมื่อไร
 * ไม่งั้นกระดาษที่วางบนโต๊ะไม่มีความหมาย
 */
export async function PrintHeader({
  title, range,
}: {
  title: string;
  range?: { from?: string; to?: string };
}) {
  const shop = await getShop();
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const period = range?.from || range?.to
    ? `${range.from ? thDateLong(range.from) : 'เริ่มต้น'} ถึง ${range.to ? thDateLong(range.to) : 'ปัจจุบัน'}`
    : 'ทั้งหมด';

  return (
    <div className="printhead print-only">
      <div className="co"><b>{shop.name}</b>{shop.taxId ? ` · เลขประจำตัวผู้เสียภาษี ${shop.taxId}` : ''}</div>
      <h1>{title}</h1>
      <div className="meta">ช่วงข้อมูล {period} · พิมพ์เมื่อ {thDateLong(iso)}</div>
    </div>
  );
}
