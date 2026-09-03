import Link from 'next/link';
import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { today } from '@drivegolight/core';
import { CLAIM_SIDE, isClaimSide } from '@/lib/claims';
import { ClaimEditor } from '../claim-editor';

export const dynamic = 'force-dynamic';

export default async function NewClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ side?: string }>;
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
      actions={<Link className="btn" href={S.href}>← กลับรายการ</Link>}
    >
      <ClaimEditor side={side} today={today()} />
    </Shell>
  );
}
