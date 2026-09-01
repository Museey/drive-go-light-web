import { requirePerm } from '@/lib/auth';
import { ClaimListView, type ClaimListParams } from './list-view';

export const dynamic = 'force-dynamic';

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<ClaimListParams>;
}) {
  await requirePerm('stock');
  return <ClaimListView side="customer" sp={await searchParams} />;
}
