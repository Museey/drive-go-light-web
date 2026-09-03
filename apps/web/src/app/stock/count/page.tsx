import Link from 'next/link';
import { query, requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { DocDateFilter, rangeFromParams } from '@/components/doc-date-filter';
import { listCounts } from '@/lib/stock-counts';
import { today } from '@drivegolight/core';
import { baht, thDate } from '@/lib/format';
import { NewCount } from './new-count';

export const dynamic = 'force-dynamic';

export default async function CountPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string; month?: string; year?: string }>;
}) {
  await requireTab('stock', 'count');
  const sp = await searchParams;
  const { from, to } = rangeFromParams(sp);

  const { rows, drafts, adjusted, adjustedValue } =
    await query((c) => listCounts(c, { search: sp.q, from, to }));

  return (
    <Shell
      current="/stock"
      title="ตรวจนับสต๊อก"
      sub={`${rows.length} ฉบับ · ร่างที่ยังไม่ปรับยอด ${drafts}`}
      actions={<NewCount today={today()} />}
    >
      <SubNav menu="stock" current="count">
        <div className="grid g4" style={{ marginBottom: 18 }}>
          <div className="card"><div className="body stat">
            <div className="label">ใบตรวจนับทั้งหมด</div>
            <div className="value">{rows.length}</div>
          </div></div>
          <div className="card"><div className="body stat">
            <div className="label">ร่างที่ยังไม่ปรับยอด</div>
            <div className={`value${drafts > 0 ? ' warn' : ''}`}>{drafts}</div>
          </div></div>
          <div className="card"><div className="body stat">
            <div className="label">รายการที่ปรับยอดไปแล้ว</div>
            <div className="value">{adjusted}</div>
          </div></div>
          <div className="card"><div className="body stat">
            <div className="label">มูลค่าส่วนต่างสะสม</div>
            <div className={`value${adjustedValue < 0 ? ' due' : ''}`}>{baht(adjustedValue)}</div>
          </div></div>
        </div>

        <div className="note" style={{ marginBottom: 14 }}>
          เดินนับของจริงในชั้นวางแล้วปรับยอดในระบบให้ตรง —
          <b>สต๊อกจะยังไม่เปลี่ยนจนกว่าจะกดปุ่มปรับยอด</b> บันทึกร่างไว้ก่อนแล้วกลับมานับต่อวันหลังได้
          {' '}ต้องการใบเปล่าไว้เดินนับ กด{' '}
          <Link href="/stock/sheet" style={{ textDecoration: 'underline' }}>พิมพ์ใบนับเปล่า</Link>
        </div>

        <div className="card">
          <div className="toolbar">
            <form action="/stock/count" method="get" style={{ display: 'flex', gap: 6 }}>
              <input className="in" type="search" name="q" defaultValue={sp.q ?? ''}
                     placeholder="เลขที่ใบ หรือหมายเหตุ" style={{ width: 260 }} />
              <button className="btn" type="submit">ค้นหา</button>
            </form>
            <span className="spacer" />
            <Link className="btn" href="/stock/sheet">พิมพ์ใบนับเปล่า</Link>
          </div>

          <DocDateFilter base="/stock/count" from={from} to={to} keep={sp.q ? { q: sp.q } : {}} />

          {rows.length === 0 ? (
            <div className="empty">ยังไม่มีใบตรวจนับ — กดปุ่มตรวจนับสินค้าเพื่อเริ่ม</div>
          ) : (
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>เลขที่</th><th>วันที่</th><th>หมายเหตุ</th>
                    <th className="num">รายการ</th>
                    <th className="num">กรอกแล้ว</th>
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">
                        <Link href={`/stock/count/${r.id}`} style={{ textDecoration: 'underline' }}>
                          {r.no}
                        </Link>
                      </td>
                      <td>{thDate(r.countDate)}</td>
                      <td className="wrap" style={{ fontSize: 12.5 }}>{r.note || '-'}</td>
                      <td className="num">{r.lines}</td>
                      <td className="num">{r.done}</td>
                      <td>
                        {r.applied
                          ? <span className="chip ok">ปรับยอดแล้ว</span>
                          : <span className="chip warn">ร่าง</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SubNav>
    </Shell>
  );
}
