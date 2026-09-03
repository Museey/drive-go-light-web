import Link from 'next/link';
import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { query } from '@/lib/auth';
import { listBillnotes } from '@/lib/billnotes';
import { DocDateFilter, rangeFromParams } from '@/components/doc-date-filter';
import { baht, thDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string; month?: string; year?: string }>;
}) {
  await requireTab('income', 'billing');
  const sp = await searchParams;
  const { from, to } = rangeFromParams(sp);

  const rows = await query((c) => listBillnotes(c, { search: sp.q, from, to }));
  const live = rows.filter((r) => r.status !== 'void');
  const owed = live.reduce((s, r) => s + r.total, 0);

  return (
    <Shell
      current="/income"
      title="ใบวางบิล"
      sub={`${live.length} ใบที่ยังไม่ยกเลิก · รอเก็บรวม ${baht(owed)} บาท`}
      actions={<Link className="btn primary" href="/income/billing/new">+ ออกใบวางบิล</Link>}
    >
      <SubNav menu="income" current="billing">
        <div className="note" style={{ marginBottom: 14 }}>
          ใบวางบิลเป็น<b>เอกสารแจ้งเก็บเงิน</b> รวมใบที่ยังค้างของลูกค้ารายเดียวไว้ใบเดียว
          — <b>ไม่ตั้งลูกหนี้ซ้ำและไม่นับเป็นรายได้</b> ยอดขายกับลูกหนี้ไม่เปลี่ยนเพราะใบนี้
          เมื่อได้รับเงินแล้วให้ออกใบเสร็จรับเงินตามปกติ
        </div>

        <div className="card">
          <div className="toolbar">
            <form action="/income/billing" method="get" style={{ display: 'flex', gap: 6 }}>
              <input className="in" type="search" name="q" defaultValue={sp.q ?? ''}
                     placeholder="เลขที่ใบวางบิล หรือชื่อลูกค้า" style={{ width: 260 }} />
              <button className="btn" type="submit">ค้นหา</button>
            </form>
          </div>

          <DocDateFilter base="/income/billing" from={from} to={to}
                         keep={sp.q ? { q: sp.q } : {}} />

          {rows.length === 0 ? (
            <div className="empty">ยังไม่มีใบวางบิล</div>
          ) : (
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>เลขที่</th><th>วันที่วางบิล</th><th>ลูกค้า</th>
                    <th className="num">จำนวนใบ</th>
                    <th className="num">ยอดที่แจ้งไป</th>
                    <th className="num">ค้างอยู่ตอนนี้</th>
                    <th>นัดรับเงิน</th><th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">
                        <Link href={`/income/billing/${r.id}`} style={{ textDecoration: 'underline' }}>
                          {r.no}
                        </Link>
                      </td>
                      <td>{thDate(r.billDate)}</td>
                      <td className="wrap">{r.partyName || '-'}</td>
                      <td className="num">{r.docCount}</td>
                      <td className="num">{baht(r.totalSnapshot)}</td>
                      <td className="num">
                        {r.status === 'void' ? '-'
                          : r.total > 0.004
                            ? <span className="chip warn">{baht(r.total)}</span>
                            : <span className="chip ok">เก็บครบแล้ว</span>}
                      </td>
                      <td>{thDate(r.dueDate)}</td>
                      <td>
                        {r.status === 'void'
                          ? <span className="chip due" title={r.voidedReason ?? ''}>ยกเลิกแล้ว</span>
                          : <span className="chip">วางบิลแล้ว</span>}
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
