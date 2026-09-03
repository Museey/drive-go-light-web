import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { PrintHeader } from '@/components/print-header';
import { PagePrintButton } from '@/components/print-button';
import { listPayables } from '@/lib/receivables';
import { baht } from '@/lib/format';
import { BulkPay } from '../bulk-pay';
import { ApRow } from './ap-row';

export const dynamic = 'force-dynamic';

export default async function ApPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; overdue?: string; bulk?: string }>;
}) {
  await requireTab('finance', 'ap');
  const sp = await searchParams;
  const onlyOverdue = sp.overdue === '1';

  const { rows, total, overdueTotal, overdueCount, count } =
    await listPayables({ search: sp.q, onlyOverdue });

  return (
    <Shell actions={<PagePrintButton />} current="/finance" title="เจ้าหนี้" sub="ใบซื้อและค่าใช้จ่ายที่ยังจ่ายไม่ครบ">
      <SubNav menu="finance" current="ap">
      <PrintHeader title="รายงานเจ้าหนี้คงค้าง" range={undefined} />

      <div className="grid g4" style={{ marginBottom: 18 }}>
        <div className="card"><div className="body stat">
          <div className="label">เจ้าหนี้คงค้างทั้งหมด</div>
          <div className="value">{baht(total)}</div>
        </div></div>
        <div className="card"><div className="body stat">
          <div className="label">เกินกำหนดชำระ</div>
          <div className={`value${overdueTotal > 0 ? ' due' : ''}`}>{baht(overdueTotal)}</div>
        </div></div>
        <div className="card"><div className="body stat">
          <div className="label">จำนวนใบที่ค้าง</div>
          <div className="value">{count}</div>
        </div></div>
        <div className="card"><div className="body stat">
          <div className="label">ใบที่เกินกำหนด</div>
          <div className={`value${overdueCount > 0 ? ' warn' : ''}`}>{overdueCount}</div>
        </div></div>
      </div>

      <BulkPay
        defaultOpen={sp.bulk === '1'}
        direction="buy"
        rows={rows.map((r) => ({
          id: r.id, docNo: r.docNo, partyName: r.partyName,
          dueDate: r.dueDate, outstanding: r.outstanding, daysOverdue: r.daysOverdue,
        }))}
      />

      <div className="card">
        <div className="toolbar">
          <form action="/finance/ap" method="get" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input className="in" type="search" name="q" defaultValue={sp.q ?? ''}
                   placeholder="เลขที่ ชื่อผู้ขาย หรือเลขใบกำกับ" style={{ width: 260 }} />
            <label className="tag-row" style={{ fontSize: 13 }}>
              <input type="checkbox" name="overdue" value="1" defaultChecked={onlyOverdue} />
              เฉพาะที่เกินกำหนด
            </label>
            <button className="btn" type="submit">ค้นหา</button>
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="empty">
            {onlyOverdue ? 'ไม่มีเจ้าหนี้ที่เกินกำหนดชำระ' : 'ไม่มีเจ้าหนี้คงค้าง'}
          </div>
        ) : (
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>เลขที่</th><th>ชนิด</th><th>ผู้ขาย / ผู้รับเงิน</th><th>อ้างอิง</th>
                  <th>วันที่</th><th>ครบกำหนด</th>
                  <th className="num">ยอดจ่าย</th><th className="num">จ่ายแล้ว</th><th className="num">คงค้าง</th>
                  <th style={{ width: 96 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => <ApRow key={r.id} row={r} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </SubNav>
    </Shell>
  );
}
