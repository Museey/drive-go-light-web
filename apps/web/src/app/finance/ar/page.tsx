import { requireTab } from '@/lib/auth';
import { canExport as mayExportOf } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { PrintHeader } from '@/components/print-header';
import { PagePrintButton } from '@/components/print-button';
import { listReceivables } from '@/lib/receivables';
import { baht } from '@/lib/format';
import { BulkPay } from '../bulk-pay';
import { ArRow } from './ar-row';

export const dynamic = 'force-dynamic';

export default async function ArPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; overdue?: string; bulk?: string }>;
}) {
  const session = await requireTab('finance', 'ar');
  const sp = await searchParams;
  const onlyOverdue = sp.overdue === '1';

  /* ลิงก์ส่งออกพาตัวกรองที่เปิดอยู่ไปด้วย — ไฟล์ที่ได้จึงตรงกับที่เห็นบนจอ */
  const csvQuery = new URLSearchParams({
    ...(sp.q ? { q: sp.q } : {}),
    ...(onlyOverdue ? { overdue: '1' } : {}),
  }).toString();

  const { rows, total, overdueTotal, overdueCount, count } =
    await listReceivables({ search: sp.q, onlyOverdue });

  return (
    <Shell actions={
      <div className="tag-row">
        {mayExportOf(session, 'finance', 'ar') ? (
          <a className="btn" href={`/finance/ar/csv${csvQuery ? `?${csvQuery}` : ''}`} download>
            ส่งออก CSV
          </a>
        ) : null}
        <PagePrintButton />
      </div>
    } current="/finance" title="ลูกหนี้" sub="เอกสารขายที่ยังเก็บเงินไม่ครบ">
      <SubNav menu="finance" current="ar">
      <PrintHeader title="รายงานลูกหนี้คงค้าง" range={undefined} />

      <div className="grid g4" style={{ marginBottom: 18 }}>
        <div className="card"><div className="body stat">
          <div className="label">ลูกหนี้คงค้างทั้งหมด</div>
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
        direction="sell"
        rows={rows.map((r) => ({
          id: r.id, docNo: r.docNo, partyName: r.partyName,
          dueDate: r.dueDate, outstanding: r.outstanding, daysOverdue: r.daysOverdue,
        }))}
      />

      <div className="card">
        <div className="toolbar">
          <form action="/finance/ar" method="get" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input className="in" type="search" name="q" defaultValue={sp.q ?? ''}
                   placeholder="เลขที่เอกสาร ชื่อลูกค้า หรือทะเบียนรถ" style={{ width: 260 }} />
            <label className="tag-row" style={{ fontSize: 13 }}>
              <input type="checkbox" name="overdue" value="1" defaultChecked={onlyOverdue} />
              เฉพาะที่เกินกำหนด
            </label>
            <button className="btn" type="submit">ค้นหา</button>
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="empty">
            {onlyOverdue ? 'ไม่มีลูกหนี้ที่เกินกำหนดชำระ' : 'ไม่มีลูกหนี้คงค้าง'}
          </div>
        ) : (
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>เลขที่</th><th>ชนิด</th><th>ลูกค้า</th><th>ทะเบียน</th>
                  <th>วันที่</th><th>ครบกำหนด</th>
                  <th className="num">ยอดสุทธิ</th><th className="num">ชำระแล้ว</th><th className="num">คงค้าง</th>
                  <th style={{ width: 96 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => <ArRow key={r.id} row={r} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </SubNav>
    </Shell>
  );
}
