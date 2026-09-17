import { requireTab } from '@/lib/auth';
import { canExport as mayExportOf } from '@/lib/perms';
import { PrintReport } from '@/components/print-report';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { PrintHeader } from '@/components/print-header';
import { listPayables } from '@/lib/receivables';
import { baht } from '@/lib/format';
import { BulkPay } from '../bulk-pay';
import { PartyList } from '../party-list';
import { rowsOfParty } from '@/lib/party-groups';
import { ApRow } from './ap-row';

export const dynamic = 'force-dynamic';

export default async function ApPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; overdue?: string; bulk?: string;
    /** คีย์ของคน (ทะเบียนผู้ติดต่อ หรือ `n:ชื่อ`) — หน้ารายคน · ใช้ได้ทั้งจอแคบและเดสก์ท็อป */
    party?: string;
  }>;
}) {
  const session = await requireTab('finance', 'ap');
  const sp = await searchParams;
  const onlyOverdue = sp.overdue === '1';

  /* ลิงก์ส่งออกพาตัวกรองที่เปิดอยู่ไปด้วย — ไฟล์ที่ได้จึงตรงกับที่เห็นบนจอ */
  const csvQuery = new URLSearchParams({
    ...(sp.q ? { q: sp.q } : {}),
    ...(onlyOverdue ? { overdue: '1' } : {}),
  }).toString();

  const { rows, total, overdueTotal, overdueCount, count } =
    await listPayables({ search: sp.q, onlyOverdue });
  /* หน้ารายคน — กรองจากใบค้างที่ดึงมาแล้ว ไม่แตะคิวรี (lib/party-groups.ts)
     ตัวเลขสี่ใบด้านบนยังเป็นยอดของทุกคน เพื่อให้เทียบได้ว่าคนนี้กินสัดส่วนเท่าไร */
  const shown = sp.party ? rowsOfParty(rows, sp.party) : rows;
  const keep: Record<string, string> = {
    ...(sp.q ? { q: sp.q } : {}),
    ...(onlyOverdue ? { overdue: '1' } : {}),
  };

  return (
    <Shell tools={<><PrintReport />{" "}
      <div className="tag-row">
        {mayExportOf(session, 'finance', 'ap') ? (
          <a className="btn" href={`/finance/ap/csv${csvQuery ? `?${csvQuery}` : ''}`} download>
            ส่งออก CSV
          </a>
        ) : null}
      </div>
    </>} current="/finance" title="เจ้าหนี้" sub="ใบซื้อและค่าใช้จ่ายที่ยังจ่ายไม่ครบ">
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
        rows={shown.map((r) => ({
          id: r.id, docNo: r.docNo, partyName: r.partyName,
          dueDate: r.dueDate, outstanding: r.outstanding, daysOverdue: r.daysOverdue,
        }))}
      />

      <div className="card">
        <div className="toolbar">
          <form autoComplete="off" action="/finance/ap" method="get" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input className="in search" type="search" name="q" defaultValue={sp.q ?? ''}
                   placeholder="กรอกคำค้นหา — เลขที่ ชื่อผู้ขาย หรือเลขใบกำกับ" style={{ width: 260 }} />
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
          <>
          {/* จอต่ำกว่า 1280: การ์ดรายคน / ใบค้างของคนนั้น · 1280 ขึ้นไปและตอนพิมพ์: ตารางรายใบเดิม */}
          <PartyList base="/finance/ap" rows={shown} party={sp.party} direction="buy" keep={keep} />
          <div className="tablewrap doc-table">
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
                {shown.map((r) => <ApRow key={r.id} row={r} />)}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
      </SubNav>
    </Shell>
  );
}
