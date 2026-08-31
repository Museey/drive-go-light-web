import { requirePerm } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { FinanceNav } from '@/components/finance-nav';
import { PrintHeader } from '@/components/print-header';
import { PagePrintButton } from '@/components/print-button';
import { DateRange } from '@/components/date-range';
import { getProfitAndLoss } from '@/lib/reports';
import { baht, monthLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PLPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePerm('finance');
  const sp = await searchParams;
  const pl = await getProfitAndLoss(sp.from, sp.to);

  const pct = (v: number) => (pl.revenue > 0 ? `${((v / pl.revenue) * 100).toFixed(1)}%` : '—');
  const profitColor = pl.netProfit >= 0 ? 'var(--ok)' : 'var(--due)';

  return (
    <Shell actions={<PagePrintButton />} current="/finance" title="งบกำไรขาดทุน" sub="คิดจากมูลค่าก่อนภาษีมูลค่าเพิ่ม">
      <FinanceNav current="pl" />
      <PrintHeader title="งบกำไรขาดทุน" range={{ from: sp.from, to: sp.to }} />

      <div className="card">
        <DateRange base="/finance/pl" from={sp.from} to={sp.to} />

        <div className="body">
          <div className="totals" style={{ width: 'min(520px, 100%)', marginLeft: 0 }}>
            <div className="row" style={{ fontWeight: 600, borderBottom: '1px solid var(--line)' }}>
              <span>รายได้</span><span />
            </div>
            <div className="row">
              <span className="lbl">รายได้จากการขายและบริการ</span>
              <span>{baht(pl.revenue)}</span>
            </div>

            <div className="row" style={{ fontWeight: 600, borderBottom: '1px solid var(--line)', marginTop: 10 }}>
              <span>ต้นทุนขาย</span><span />
            </div>
            <div className="row">
              <span className="lbl">ค่าอะไหล่และวัสดุที่ซื้อเข้า <span className="subtle">{pct(pl.cogs)}</span></span>
              <span>−{baht(pl.cogs)}</span>
            </div>
            <div className="row grand">
              <span>กำไรขั้นต้น <span className="subtle" style={{ fontWeight: 400 }}>{pct(pl.grossProfit)}</span></span>
              <span>{baht(pl.grossProfit)}</span>
            </div>

            <div className="row" style={{ fontWeight: 600, borderBottom: '1px solid var(--line)', marginTop: 10 }}>
              <span>ค่าใช้จ่ายดำเนินงาน</span><span />
            </div>
            {pl.opsByCat.map((c) => (
              <div className="row" key={c.key}>
                <span className="lbl" style={{ paddingLeft: 12 }}>
                  {c.label} <span className="subtle">{pct(c.amount)}</span>
                </span>
                <span>{c.amount > 0.004 ? `−${baht(c.amount)}` : '-'}</span>
              </div>
            ))}
            <div className="row" style={{ fontWeight: 600 }}>
              <span>รวมค่าใช้จ่ายดำเนินงาน</span>
              <span>−{baht(pl.opsTotal)}</span>
            </div>

            <div className="row grand" style={{ fontSize: 17 }}>
              <span>กำไรสุทธิ <span className="subtle" style={{ fontWeight: 400 }}>{pct(pl.netProfit)}</span></span>
              <span style={{ color: profitColor }}>{baht(pl.netProfit)}</span>
            </div>
          </div>

          {pl.assetTotal > 0.004 ? (
            <div className="note" style={{ marginTop: 18, marginBottom: 0 }}>
              ในช่วงนี้มีการซื้อสินทรัพย์ <b>{baht(pl.assetTotal)}</b> บาท ซึ่ง<b>ไม่ได้</b>หักเป็นค่าใช้จ่ายข้างบน
              เพราะต้องทยอยคิดเป็นค่าเสื่อมราคาตามอายุการใช้งาน — ระบบยังไม่คำนวณค่าเสื่อมให้
              ตัวเลขกำไรสุทธิจึงเป็นกำไร<b>ก่อน</b>หักค่าเสื่อม เหมือนโปรแกรมรุ่นเดิม
            </div>
          ) : null}
        </div>
      </div>

      <div className="card">
        <header><h2>แยกรายเดือน</h2></header>
        {pl.months.length === 0 ? (
          <div className="empty">ไม่มีข้อมูลในช่วงที่เลือก</div>
        ) : (
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>งวด</th>
                  <th className="num">รายได้</th><th className="num">ต้นทุนขาย</th>
                  <th className="num">ค่าใช้จ่าย</th><th className="num">กำไรสุทธิ</th>
                </tr>
              </thead>
              <tbody>
                {pl.months.map((m) => (
                  <tr key={m.key}>
                    <td>{monthLabel(m.key)}</td>
                    <td className="num">{baht(m.revenue)}</td>
                    <td className="num">{baht(m.cogs)}</td>
                    <td className="num">{baht(m.ops)}</td>
                    <td className="num" style={{ fontWeight: 600, color: m.netProfit >= 0 ? 'var(--ok)' : 'var(--due)' }}>
                      {baht(m.netProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
