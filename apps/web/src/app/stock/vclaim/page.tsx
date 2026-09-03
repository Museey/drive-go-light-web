import { requireTab } from '@/lib/auth';
import { ClaimListView, type ClaimListParams } from '../claim/list-view';

export const dynamic = 'force-dynamic';

export default async function VendorClaimPage({
  searchParams,
}: {
  searchParams: Promise<ClaimListParams>;
}) {
  await requireTab('stock', 'vclaim');
  return <ClaimListView side="vendor" sp={await searchParams} />;
}
