import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { isUuid } from '@/lib/ids';
import { safeBack } from '@/lib/saved-target';
import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getShop } from '@/lib/queries';
import { canEdit, loadDocForCopy, lotExpiryOf, docNoOf } from '@/lib/sales';
import { today } from '@drivegolight/core';
import { KIND_LABEL } from '@/lib/format';
import { DocEditor } from '../../doc-editor';

export const dynamic = 'force-dynamic';

export default async function EditDocPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTab('income', 'receipt');
  const { id } = await params;
  /* รหัสที่ไม่ใช่ uuid ส่งไป Postgres แล้วพังเป็น 500 — ต้องเป็น 404 */
  if (!isUuid(id)) notFound();

  const allowed = await canEdit(id);
  if (!allowed.ok) {
    redirect(`/income/${id}?error=${encodeURIComponent(allowed.reason ?? 'แก้ไขไม่ได้')}`);
  }

  const [source, shop, docNo] = await Promise.all([loadDocForCopy(id), getShop(), docNoOf(id)]);
  if (!source) notFound();

  const initial = { ...source, id };
  const lotExpiry = await lotExpiryOf(source.items.map((i) => i.productId));
  /* บันทึกแล้วกลับหน้าที่กดแก้ไขมา (ผู้ใช้กำหนด) — กรองใน safeBack เหลือเฉพาะหน้าในเมนูรายรับ */
  const back = safeBack((await headers()).get('referer'), ['/income']);

  return (
    <Shell doc
      current="/income"
      title={`แก้ไข${KIND_LABEL[source.kind]}`}
    >
      {/* key = รหัสเอกสาร — จากหน้าแก้ไขใบหนึ่งไปอีกใบ ฟอร์มต้องไม่ค้างข้อมูลใบเดิม */}
      <DocEditor key={id} initial={initial} vatRate={shop.vatRate} shopWhtRate={shop.whtRate} mode="edit"
                 lotExpiry={lotExpiry} expiryWarnDays={shop.expiryWarnDays} today={today()}
                 docNo={docNo ?? undefined} returnTo={back ?? undefined} />
    </Shell>
  );
}
