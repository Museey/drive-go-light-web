import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePerm } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getShop } from '@/lib/queries';
import { getBuyDocMeta, loadBuyDoc } from '@/lib/purchases';
import { BuyEditor } from '../../buy-editor';

export const dynamic = 'force-dynamic';

export default async function EditBuyPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePerm('expense');
  const { id } = await params;

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
      actions={<Link className="btn" href={`/expense/${id}`}>← กลับหน้าเอกสาร</Link>}
    >
      <BuyEditor initial={doc} vatRate={shop.vatRate} mode="edit" />
    </Shell>
  );
}
