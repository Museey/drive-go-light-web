import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePerm } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getShop } from '@/lib/queries';
import { canEdit, loadDocForCopy } from '@/lib/sales';
import { KIND_LABEL } from '@/lib/format';
import { DocEditor } from '../../doc-editor';

export const dynamic = 'force-dynamic';

export default async function EditDocPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePerm('income');
  const { id } = await params;

  const allowed = await canEdit(id);
  if (!allowed.ok) {
    redirect(`/income/${id}?error=${encodeURIComponent(allowed.reason ?? 'แก้ไขไม่ได้')}`);
  }

  const [source, shop] = await Promise.all([loadDocForCopy(id), getShop()]);
  if (!source) notFound();

  const initial = { ...source, id };

  return (
    <Shell doc
      current="/income"
      title={`แก้ไข${KIND_LABEL[source.kind]}`}
      actions={<Link className="btn" href={`/income/${id}`}>← กลับหน้าเอกสาร</Link>}
    >
      <DocEditor initial={initial} vatRate={shop.vatRate} shopWhtRate={shop.whtRate} mode="edit" />
    </Shell>
  );
}
