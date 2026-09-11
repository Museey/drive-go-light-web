import Link from 'next/link';
import { requireTab } from '@/lib/auth';
import { canCost, HIDDEN_COST } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { PrintHeader } from '@/components/print-header';
import { PagePrintButton } from '@/components/print-button';
import { DateRange } from '@/components/date-range';
import { getSalesReport, getVatChain } from '@/lib/reports';
import { query } from '@/lib/auth';
import { salesDocsWith } from '@/lib/home-report';
import { PageSize, pageSizeOf } from '@/components/page-size';
import { baht, KIND_SHORT, monthLabel, thDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; page?: string; size?: string }>;
}) {
  const session = await requireTab('finance', 'sales');
  const seeCost = canCost(session);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? '1') || 1);
  const pageSize = pageSizeOf(sp.size);

  const [report, vat, docs] = await Promise.all([
    getSalesReport(sp.from, sp.to),
    getVatChain(),
    query((c) => salesDocsWith(c, { from: sp.from, to: sp.to, page, pageSize })),
  ]);

  const lastPage = Math.max(1, Math.ceil(docs.total / pageSize));
  const keep: Record<string, string> = {
    ...(sp.from ? { from: sp.from } : {}),
    ...(sp.to ? { to: sp.to } : {}),
  };
  const paged = { ...keep, ...(sp.size ? { size: sp.size } : {}) };

  /* ตารางภาษีแสดงเฉพาะงวดที่อยู่ในช่วงที่เลือก แต่เครดิตยกยอดคิดจากทั้งหมดเสมอ
     ไม่งั้นเครดิตที่ยกมาจากก่อนหน้าช่วงจะหายไป */
  const shown = vat.filter((v) =>
    (!sp.from || v.key >= sp.from.slice(0, 7)) && (!sp.to || v.key <= sp.to.slice(0, 7)));

  const csvQuery = new URLSearchParams({
    ...(sp.from ? { from: sp.from } : {}),
    ...(sp.to ? { to: sp.to } : {}),
  }).toString();

  return (
    <Shell actions={
      <div className="tag-row">
        <a className="btn" href={`/finance/csv${csvQuery ? `?${csvQuery}` : ''}`} download>ส่งออก CSV</a>
        <Link className="btn" href={`/finance/print${csvQuery ? `?${csvQuery}` : ''}`}>พิมพ์ / PDF</Link>
        <PagePrintButton />
      </div>
    } current="/finance" title="ยอดขาย" sub="มูลค่าก่อนภาษีและภาษีขายรายงวด">
      <SubNav menu="finance" current="sales">
      <PrintHeader title="รายงานยอดขายและภาษี" range={{ from: sp.from, to: sp.to }} />

      <div className="grid g4" style={{ marginBottom: 18 }}>
        <div className="card"><div className="body stat">
          <div className="label">ยอดขายก่อนภาษี</div>
          <div className="value">{baht(report.totalNet)}</div>
        </div></div>
        <div className="card"><div className="body stat">
          <div className="label">ภาษีขาย</div>
          <div className="value">{baht(report.totalVat)}</div>
        </div></div>
        <div className="card"><div className="body stat">
          <div className="label">ถูกหัก ณ ที่จ่าย</div>
          <div className="value">{baht(report.totalWht)}</div>
        </div></div>
        <div className="card"><div className="body stat">
          <div className="label">จำนวนเอกสาร</div>
          <div className="value">{report.docCount}</div>
        </div></div>
      </div>

      <div className="card">
        <header><h2>ยอดขายรายเดือน</h2></header>
        <DateRange base="/finance/sales" from={sp.from} to={sp.to} />

        {report.months.length === 0 ? (
          <div className="empty">ไม่มียอดขายในช่วงที่เลือก</div>
        ) : (
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>งวด</th><th className="num">เอกสาร</th>
                  <th className="num">มูลค่าก่อนภาษี</th><th className="num">ภาษีขาย</th>
                  <th className="num">รวมทั้งสิ้น</th><th className="num">ถูกหัก ณ ที่จ่าย</th>
                </tr>
              </thead>
              <tbody>
                {report.months.map((m) => (
                  <tr key={m.key}>
                    <td>{monthLabel(m.key)}</td>
                    <td className="num">{m.docCount}</td>
                    <td className="num">{baht(m.net)}</td>
                    <td className="num">{baht(m.vat)}</td>
                    <td className="num">{baht(m.grand)}</td>
                    <td className="num">{m.wht > 0.004 ? baht(m.wht) : '-'}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 600 }}>รวม</td>
                  <td className="num" style={{ fontWeight: 600 }}>{report.docCount}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{baht(report.totalNet)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{baht(report.totalVat)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{baht(report.totalGrand)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{baht(report.totalWht)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ตารางรายใบ — ตอบว่าใบไหนบ้างที่ประกอบเป็นยอดด้านบน ซึ่งสรุปรายงวดตอบไม่ได้ */}
      <div className="card">
        <header>
          <h2>เอกสารขายรายใบ</h2>
          <div className="spacer" />
          <span className="subtle">{docs.total.toLocaleString('en-US')} ใบในช่วงที่เลือก</span>
        </header>

        {docs.rows.length === 0 ? (
          <div className="empty">ไม่มีเอกสารขายในช่วงที่เลือก</div>
        ) : (
          <>
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>เลขที่</th><th>ชนิด</th><th>วันที่</th><th>ลูกค้า</th>
                    <th className="num">ก่อนภาษี</th>
                    <th className="num">VAT</th>
                    <th className="num">หัก ณ ที่จ่าย</th>
                    <th className="num">สุทธิรับ</th>
                    <th className="num">คงค้าง</th>
                    {seeCost ? <th className="num">ต้นทุนขาย</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {docs.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">
                        <Link href={`/income/${r.id}`} style={{ textDecoration: 'underline' }}>
                          {r.docNo}
                        </Link>
                      </td>
                      <td>{KIND_SHORT[r.kind] ?? r.kind}</td>
                      <td>{thDate(r.docDate)}</td>
                      <td className="wrap">{r.partyName || '-'}</td>
                      <td className="num">{baht(r.net)}</td>
                      <td className="num">{r.vat > 0.004 ? baht(r.vat) : '-'}</td>
                      <td className="num">{r.wht > 0.004 ? baht(r.wht) : '-'}</td>
                      <td className="num">{baht(r.payable)}</td>
                      <td className="num" style={r.outstanding > 0.004 ? { color: 'var(--due)' } : undefined}>
                        {r.outstanding > 0.004 ? baht(r.outstanding) : '-'}
                      </td>
                      {seeCost ? (
                        /* ว่างเปล่า = ยังไม่เคยตัดสต๊อก ซึ่งคนละเรื่องกับต้นทุนศูนย์
                           (ศูนย์แปลว่าขายได้กำไรเต็มจำนวน) */
                        <td className="num" style={{ color: 'var(--ink-3)' }}>
                          {r.cost === null ? '-' : baht(r.cost)}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="body">
              <span className="subtle">
                ต้นทุนขายเป็นค่าที่ตรึงไว้ตอนตัดสต๊อกแบบเข้าก่อนออกก่อน ไม่ได้คิดใหม่ตอนเปิดรายงาน
                — ช่องว่างคือใบที่ยังไม่เคยตัดสต๊อก เช่นใบส่งมอบที่ยังไม่ได้ออกใบเสร็จ
              </span>
            </div>

            <div className="pager">
              <span>หน้า {page} จาก {lastPage}</span>
              <PageSize base="/finance/sales" size={pageSize} keep={keep} />
              <div className="spacer" />
              {page > 1 ? (
                <Link className="btn" href={{ pathname: '/finance/sales', query: { ...paged, page: page - 1 } }}>
                  ก่อนหน้า
                </Link>
              ) : null}
              {page < lastPage ? (
                <Link className="btn" href={{ pathname: '/finance/sales', query: { ...paged, page: page + 1 } }}>
                  ถัดไป
                </Link>
              ) : null}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <header>
          <h2>ภาษีมูลค่าเพิ่มรายงวด</h2>
          <div className="spacer" />
          <span className="subtle">เครดิตยกยอดคิดต่อเนื่องจากงวดแรกเสมอ ไม่ขึ้นกับช่วงที่เลือกดู</span>
        </header>

        {shown.length === 0 ? (
          <div className="empty">ไม่มีภาษีในช่วงที่เลือก</div>
        ) : (
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>งวด</th>
                  <th className="num">ภาษีขาย</th><th className="num">ภาษีซื้อ</th>
                  <th className="num">เครดิตยกมา</th>
                  <th className="num">ต้องชำระ</th><th className="num">เครดิตยกไป</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => (
                  <tr key={v.key}>
                    <td>{monthLabel(v.key)}</td>
                    <td className="num">{baht(v.out)}</td>
                    <td className="num">{baht(v.in)}</td>
                    <td className="num subtle">{v.carryIn > 0.004 ? baht(v.carryIn) : '-'}</td>
                    <td className="num" style={{ fontWeight: v.payable > 0.004 ? 700 : undefined }}>
                      {v.payable > 0.004 ? baht(v.payable) : '-'}
                    </td>
                    <td className="num" style={{ color: v.carryOut > 0.004 ? 'var(--ok)' : undefined }}>
                      {v.carryOut > 0.004 ? baht(v.carryOut) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="body">
          <span className="subtle">
            งวดที่ภาษีซื้อมากกว่าภาษีขาย ส่วนเกินยกไปหักงวดถัดไป ไม่ต้องชำระในงวดนั้น
          </span>
        </div>
      </div>
      </SubNav>
    </Shell>
  );
}
