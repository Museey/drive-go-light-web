import Link from 'next/link';
import { notFound } from 'next/navigation';
import { query, requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getCount } from '@/lib/stock-counts';
import { thDate } from '@/lib/format';
import { CountEditor } from '../count-editor';
import { CountHead } from '../count-head';

export const dynamic = 'force-dynamic';

export default async function CountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTab('stock', 'count');
  const { id } = await params;

  const count = await query((c) => getCount(c, id));
  if (!count) notFound();

  return (
    <Shell
      doc
      current="/stock"
      title={`ใบตรวจนับ ${count.no}`}
      sub={`วันที่ ${thDate(count.countDate)}${count.note ? ` · ${count.note}` : ''}`}
      actions={
        <div className="tag-row">
          <Link className="btn" href={`/stock/count/${id}/print`}>พิมพ์ใบนับ</Link>
          <Link className="btn" href="/stock/count">← กลับรายการ</Link>
        </div>
      }
    >
      {count.applied ? (
        <div className="ok-msg" style={{ marginBottom: 16 }}>
          ปรับยอดแล้ว — ใบนี้เป็นหลักฐานว่า ณ วันนั้นระบบว่ามีเท่าไร นับได้เท่าไร
          และปรับไปเท่าไร แก้ไขไม่ได้อีก
        </div>
      ) : null}

      <CountHead count={count} />
      <CountEditor count={count} />
    </Shell>
  );
}
