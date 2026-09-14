import { notFound } from 'next/navigation';
import { requireTab } from '@/lib/auth';
import { isUuid } from '@/lib/ids';
import { canCost, canEdit } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { getKit, nextKitCode } from '@/lib/kits';
import { KitEditor } from '../kit-editor';

export const dynamic = 'force-dynamic';

/** 05.7 สร้าง/แก้ไขชุดอะไหล่ — /stock/kits/new หรือ /stock/kits/<uuid> */
export default async function KitPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireTab('stock', 'kits');
  const { id } = await params;
  if (id !== 'new' && !isUuid(id)) notFound();

  const kit = id === 'new' ? null : await getKit(id);
  if (id !== 'new' && !kit) notFound();
  const code = kit ? kit.code : await nextKitCode();

  return (
    <Shell current="/stock" title={kit ? `ชุดอะไหล่ ${kit.code}` : 'สร้างชุดอะไหล่ซ่อมบำรุง'}
           sub="รวมวัสดุเป็นชุด ตั้งราคา A/B/C · ใบเสร็จตัดสต๊อกชิ้นส่วนที่ผูกทะเบียน">
      <KitEditor initial={kit} code={code} showCost={canCost(session)}
                 mayEdit={canEdit(session, 'stock', 'kits')} />
    </Shell>
  );
}
