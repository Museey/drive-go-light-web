import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/ids';
import { requireTab } from '@/lib/auth';
import { getDocDetail, getShop } from '@/lib/queries';
import { getShopSettings } from '@/lib/settings';
import { DocPrint } from '@/components/doc-paper';

export const dynamic = 'force-dynamic';

/** หน้าพิมพ์เอกสารขาย (ใบเสนอราคา ใบส่งมอบ ใบกำกับภาษี ใบเสร็จ) — โครงตามต้นแบบ อยู่ใน components/doc-paper.tsx */
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTab('income', 'receipt');
  const { id } = await params;
  /* รหัสที่ไม่ใช่ uuid ส่งไป Postgres แล้วพังเป็น 500 — ต้องเป็น 404 */
  if (!isUuid(id)) notFound();
  const [doc, shop, brand] = await Promise.all([getDocDetail(id), getShop(), getShopSettings()]);
  if (!doc) notFound();

  return <DocPrint doc={doc} shop={shop} brand={brand} />;
}
