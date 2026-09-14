import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/ids';
import { requireTab } from '@/lib/auth';
import { getDocDetail, getShop } from '@/lib/queries';
import { getShopSettings } from '@/lib/settings';
import { getBuyDocMeta } from '@/lib/purchases';
import { DocPrint } from '@/components/doc-paper';

export const dynamic = 'force-dynamic';

/** หน้าพิมพ์ใบซื้อสินค้า / บันทึกค่าใช้จ่าย — โครงเดียวกับเอกสารขายตามต้นแบบ (components/doc-paper.tsx) */
export default async function BuyPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTab('expense', 'purchase');
  const { id } = await params;
  /* รหัสที่ไม่ใช่ uuid ส่งไป Postgres แล้วพังเป็น 500 — ต้องเป็น 404 */
  if (!isUuid(id)) notFound();

  const [doc, meta, shop, brand] = await Promise.all([getDocDetail(id), getBuyDocMeta(id), getShop(), getShopSettings()]);
  /* meta มีเฉพาะเอกสารฝั่งซื้อ — ใบขายเปิดผ่านหน้านี้ไม่ได้ */
  if (!doc || !meta) notFound();

  return <DocPrint doc={doc} shop={shop} brand={brand} />;
}
