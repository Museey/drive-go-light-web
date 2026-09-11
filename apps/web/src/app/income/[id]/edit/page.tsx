import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getShop } from '@/lib/queries';
import { canEdit, loadDocForCopy, lotExpiryOf } from '@/lib/sales';
import { today } from '@drivegolight/core';
import { KIND_LABEL } from '@/lib/format';
import { DocEditor } from '../../doc-editor';

export const dynamic = 'force-dynamic';

export default async function EditDocPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTab('income', 'receipt');
  const { id } = await params;

  const allowed = await canEdit(id);
  if (!allowed.ok) {
    redirect(`/income/${id}?error=${encodeURIComponent(allowed.reason ?? 'แก้ไขไม่ได้')}`);
  }

  const [source, shop] = await Promise.all([loadDocForCopy(id), getShop()]);
  if (!source) notFound();

  const initial = { ...source, id };
  const lotExpiry = await lotExpiryOf(source.items.map((i) => i.productId));

  return (
    <Shell doc
      current="/income"
      title={`แก้ไข${KIND_LABEL[source.kind]}`}
      actions={<Link className="btn" href={`/income/${id}`}>← กลับหน้าเอกสาร</Link>}
    >
      <DocEditor initial={initial} vatRate={shop.vatRate} shopWhtRate={shop.whtRate} mode="edit"
                 lotExpiry={lotExpiry} expiryWarnDays={shop.expiryWarnDays} today={today()} />
    </Shell>
  );
}
