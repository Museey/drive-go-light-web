import { notFound, redirect } from 'next/navigation';
import { isUuid } from '@/lib/ids';
import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getShop } from '@/lib/queries';
import { getBuyDocMeta, loadBuyDoc } from '@/lib/purchases';
import { BuyEditor } from '../../buy-editor';

export const dynamic = 'force-dynamic';

export default async function EditBuyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTab('expense', 'purchase');
  const { id } = await params;
  /* รหัสที่ไม่ใช่ uuid ส่งไป Postgres แล้วพังเป็น 500 — ต้องเป็น 404 */
  if (!isUuid(id)) notFound();

  const [doc, meta, shop] = await Promise.all([loadBuyDoc(id), getBuyDocMeta(id), getShop()]);
  if (!doc || !meta) notFound();

  if (meta.status === 'void') {
    redirect(`/expense/${id}?error=${encodeURIComponent('เอกสารนี้ถูกยกเลิกแล้ว แก้ไขไม่ได้')}`);
  }

  return (
    <Shell doc
      current="/expense"
      title={doc.kind === 'PO' ? 'แก้ไขใบซื้อ' : 'แก้ไขค่าใช้จ่าย'}
      sub={`เลขที่ ${meta.docNo}`}
    >
      {/* key = รหัสเอกสาร — จากหน้าแก้ไขใบหนึ่งไปอีกใบ ฟอร์มต้องไม่ค้างข้อมูลใบเดิม */}
      <BuyEditor key={id} initial={doc} vatRate={shop.vatRate} mode="edit" docNo={meta.docNo} />
    </Shell>
  );
}
