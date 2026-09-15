import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireTab } from '@/lib/auth';
import { isUuid } from '@/lib/ids';
import { canCost, canEdit } from '@/lib/perms';
import { safeBack } from '@/lib/saved-target';
import { Shell } from '@/components/shell';
import { SavedNotice } from '@/components/saved-notice';
import { getKit, nextKitCode } from '@/lib/kits';
import { KitEditor } from '../kit-editor';

export const dynamic = 'force-dynamic';

/** 05.7 สร้าง/แก้ไขชุดอะไหล่ — /stock/kits/new หรือ /stock/kits/<uuid> */
export default async function KitPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; savedId?: string }>;
}) {
  const session = await requireTab('stock', 'kits');
  const { id } = await params;
  if (id !== 'new' && !isUuid(id)) notFound();
  const sp = await searchParams;

  const kit = id === 'new' ? null : await getKit(id);
  if (id !== 'new' && !kit) notFound();
  const code = kit ? kit.code : await nextKitCode();
  /* แก้ไขชุดเดิม บันทึกแล้วกลับหน้าที่กดแก้ไขมา (ผู้ใช้กำหนด) · สร้างใหม่กลับฟอร์มเปล่า (ฝั่ง action) */
  const back = kit ? (safeBack((await headers()).get('referer'), ['/stock/kits']) ?? undefined) : undefined;

  return (
    <Shell current="/stock" title={kit ? `ชุดอะไหล่ ${kit.code}` : 'สร้างชุดอะไหล่ซ่อมบำรุง'}
           sub="รวมวัสดุเป็นชุด ตั้งราคา A/B/C · ใบเสร็จตัดสต๊อกชิ้นส่วนที่ผูกทะเบียน">
      <SavedNotice saved={sp.saved} savedId={sp.savedId} />
      {/* key = ใบบันทึกล่าสุด — สร้างชุดถัดไปติดกัน ฟอร์มต้องเริ่มใหม่ รหัสชุดถัดไปต้องไม่ค้าง */}
      <KitEditor key={`${id}:${sp.savedId ?? ''}`} initial={kit} code={code} showCost={canCost(session)}
                 mayEdit={canEdit(session, 'stock', 'kits')} returnTo={back} />
    </Shell>
  );
}
