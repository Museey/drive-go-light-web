import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { SavedNotice } from '@/components/saved-notice';
import { today } from '@drivegolight/core';
import { CLAIM_SIDE, isClaimSide } from '@/lib/claims';
import { ClaimEditor } from '../claim-editor';

export const dynamic = 'force-dynamic';

export default async function NewClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ side?: string; saved?: string; savedId?: string }>;
}) {
  await requireTab('stock', 'claim');
  const sp = await searchParams;
  const side = isClaimSide(sp.side) ? sp.side : 'customer';
  const S = CLAIM_SIDE[side];

  return (
    <Shell
      doc
      current="/stock"
      title={`เปิด${S.title}`}
      sub="บันทึกแล้วตัดสต๊อกทันที และแก้ไขไม่ได้อีก"
    >
      {/* บันทึกใบเคลมแล้วกลับมาฟอร์มเปล่าพร้อมการ์ด (ผู้ใช้กำหนด) — key ให้ฟอร์มเริ่มใหม่ทุกใบ */}
      <SavedNotice saved={sp.saved} savedId={sp.savedId} />
      <ClaimEditor key={`${side}:${sp.savedId ?? ''}`} side={side} today={today()} />
    </Shell>
  );
}
