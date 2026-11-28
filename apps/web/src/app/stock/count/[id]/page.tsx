import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/ids';
import { query, requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getCount, hideCountCost } from '@/lib/stock-counts';
import { canCost } from '@/lib/perms';
import { thDate } from '@/lib/format';
import { CountEditor } from '../count-editor';
import { CountHead } from '../count-head';

export const dynamic = 'force-dynamic';

export default async function CountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireTab('stock', 'count');
  const showValue = canCost(session);
  const { id } = await params;
  /* รหัสที่ไม่ใช่ uuid ส่งไป Postgres แล้วพังเป็น 500 — ต้องเป็น 404 */
  if (!isUuid(id)) notFound();

  const loaded = await query((c) => getCount(c, id));
  if (!loaded) notFound();
  /* ไม่มีสิทธิ์เห็นต้นทุน = ตัดตัวเลขออกตั้งแต่ตรงนี้ ไม่ใช่แค่ซ่อนคอลัมน์ (ดู hideCountCost) */
  const count = showValue ? loaded : hideCountCost(loaded);

  return (
    <Shell
      doc
      current="/stock"
      title={`ใบตรวจนับ ${count.no}`}
      sub={`วันที่ ${thDate(count.countDate)}${count.note ? ` · ${count.note}` : ''}`}
      tools={
        <div className="tag-row">
          <Link className="btn" href={`/stock/count/${id}/print`}>พิมพ์ใบนับ</Link>
        </div>
      }
    >
      {count.applied ? (
        <div className="ok-msg" style={{ marginBottom: 16 }}>
          {count.offCount === 0
            ? 'ปิดใบแล้ว — นับได้ตรงกับระบบทุกรายการ สต๊อกไม่ถูกปรับ ใบนี้เป็นหลักฐานว่า ณ วันนั้นระบบว่ามีเท่าไร นับได้เท่าไร แก้ไขไม่ได้อีก'
            : 'ปรับยอดแล้ว — ใบนี้เป็นหลักฐานว่า ณ วันนั้นระบบว่ามีเท่าไร นับได้เท่าไร และปรับไปเท่าไร แก้ไขไม่ได้อีก'}
        </div>
      ) : null}

      <CountHead count={count} />
      <CountEditor count={count} showValue={showValue} />
    </Shell>
  );
}
