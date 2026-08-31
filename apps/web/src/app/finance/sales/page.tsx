import { requirePerm } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { FinanceNav } from '@/components/finance-nav';
import { DateRange } from '@/components/date-range';
import { getSalesReport, getVatChain } from '@/lib/reports';
import { baht, monthLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePerm('finance');
  const sp = await searchParams;

  const [report, vat] = await Promise.all([
    getSalesReport(sp.from, sp.to),
    getVatChain(),
  ]);

  /* ตารางภาษีแสดงเฉพาะงวดที่อยู่ในช่วงที่เลือก แต่เครดิตยกยอดคิดจากทั้งหมดเสมอ
     ไม่งั้นเครดิตที่ยกมาจากก่อนหน้าช่วงจะหายไป */
  const shown = vat.filter((v) =>
    (!sp.from || v.key >= sp.from.slice(0, 7)) && (!sp.to || v.key <= sp.to.slice(0, 7)));

  return (
    <Shell current="/finance" title="ยอดขาย" sub="มูลค่าก่อนภาษีและภาษีขายรายงวด">
      <FinanceNav current="sales" />

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
    </Shell>
  );
}
