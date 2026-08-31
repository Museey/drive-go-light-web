import Link from 'next/link';
import { can, requireSession } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { DateRange } from '@/components/date-range';
import { getHomeSummary, getShop } from '@/lib/queries';
import { getTaxSummary } from '@/lib/reports';
import { baht, KIND_SHORT, monthLabel } from '@/lib/format';

const PERM_LABEL: Record<string, string> = {
  customer: 'ข้อมูลลูกค้า / ผู้ขาย', income: 'รายรับ', expense: 'รายจ่าย',
  stock: 'สินค้า', finance: 'บัญชี / การเงิน', settings: 'ตั้งค่าร้าน',
};

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; from?: string; to?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const seesIncome = can(session, 'income');
  const seesFinance = can(session, 'finance');
  const seesStock = can(session, 'stock');

  const [shop, summary, tax] = await Promise.all([
    getShop(),
    getHomeSummary(sp.from, sp.to),
    seesFinance ? getTaxSummary() : Promise.resolve(null),
  ]);

  const ranged = Boolean(sp.from || sp.to);

  return (
    <Shell current="/" title="หน้าแรก" sub={`ภาษีมูลค่าเพิ่ม ${shop.vatRate}% · หัก ณ ที่จ่าย ${shop.whtRate}%`}>
      {sp.denied ? (
        <div className="note" style={{ background: '#FCF1F1', borderColor: '#EEC4C4', color: '#7A2020' }}>
          คุณไม่มีสิทธิ์เข้าเมนู <b>{PERM_LABEL[sp.denied] ?? sp.denied}</b> — ติดต่อเจ้าของกิจการหากต้องใช้งาน
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 18 }}>
        <DateRange base="/" from={sp.from} to={sp.to} />
      </div>

      <div className="grid g4" style={{ marginBottom: 18 }}>
        <div className="card"><div className="body stat">
          <div className="label">ยอดขายก่อนภาษี{ranged ? ' (ช่วงที่เลือก)' : ' (ทั้งหมด)'}</div>
          <div className="value">{baht(summary.salesThisYear)}</div>
          <span className="n">
            {summary.salesDocCount.toLocaleString('en-US')} ฉบับ · เฉลี่ยใบละ {baht(summary.salesAvg)}
          </span>
        </div></div>

        <div className="card"><div className="body stat">
          <div className="label">รับชำระแล้ว{ranged ? ' (ช่วงที่เลือก)' : ''}</div>
          <div className="value ok">{baht(summary.salesPaid)}</div>
          <span className="n">จากเอกสารขายในช่วงเดียวกัน</span>
        </div></div>

        <div className="card"><div className="body stat">
          <div className="label">รายจ่ายในช่วงเดียวกัน</div>
          <div className="value">{baht(summary.spendTotal)}</div>
          <span className="n">
            ซื้อสินค้า {baht(summary.spendBuy)} · ค่าใช้จ่าย {baht(summary.spendExpense)}
          </span>
        </div></div>

        <div className="card"><div className="body stat">
          <div className="label">ลูกหนี้คงค้าง</div>
          <div className={`value${summary.arOutstanding > 0 ? ' due' : ''}`}>{baht(summary.arOutstanding)}</div>
          {seesFinance ? (
            <Link href="/finance/ar" className="n" style={{ textDecoration: 'underline' }}>ดูรายการ</Link>
          ) : null}
        </div></div>

        <div className="card"><div className="body stat">
          <div className="label">เจ้าหนี้คงค้าง</div>
          <div className={`value${summary.apOutstanding > 0 ? ' warn' : ''}`}>{baht(summary.apOutstanding)}</div>
          {seesFinance ? (
            <Link href="/finance/ap" className="n" style={{ textDecoration: 'underline' }}>ดูรายการ</Link>
          ) : null}
        </div></div>

        <div className="card"><div className="body stat">
          <div className="label">สินค้าที่ต้องสั่งซื้อ</div>
          <div className={`value${summary.reorderCount > 0 ? ' warn' : ''}`}>{summary.reorderCount}</div>
          <span className="n">ประมาณการเงินที่ต้องใช้ {baht(summary.reorderCost)}</span>
        </div></div>

        <div className="card"><div className="body stat">
          <div className="label">สินค้าค้างสต๊อก ≥ 6 เดือน</div>
          <div className={`value${summary.deadCount > 0 ? ' warn' : ''}`}>{summary.deadCount}</div>
          <span className="n">
            เงินจม {baht(summary.deadValue)} · จากสินค้าทั้งหมด {summary.productCount.toLocaleString('en-US')} รายการ
          </span>
        </div></div>
      </div>

      {/* ---------- ของที่ควรสั่งก่อน ---------- */}
      {seesStock && summary.reorderTop.length > 0 ? (
        <div className="card">
          <header>
            <h2>สินค้าที่ควรสั่งก่อน</h2>
            <div className="spacer" />
            <Link className="btn" href="/stock?reorder=1">ดูทั้งหมด {summary.reorderCount} รายการ</Link>
          </header>
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>รหัส</th><th>ชื่อสินค้า</th>
                  <th className="num">คงเหลือ</th><th className="num">จุดสั่ง</th>
                  <th className="num">ควรสั่ง</th><th className="num">เป็นเงิน</th>
                </tr>
              </thead>
              <tbody>
                {summary.reorderTop.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">
                      <Link href={`/stock/${p.id}`} style={{ textDecoration: 'underline' }}>{p.code}</Link>
                    </td>
                    <td className="wrap">{p.name}</td>
                    <td className="num">
                      <span className="chip flag-min">{p.qtyOnHand.toLocaleString('en-US')}</span>
                    </td>
                    <td className="num" style={{ color: 'var(--ink-3)' }}>{p.qtyMin.toLocaleString('en-US')}</td>
                    <td className="num">{p.need.toLocaleString('en-US')} {p.unit}</td>
                    <td className="num">{baht(p.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ---------- สรุปภาษีงวดล่าสุด ---------- */}
      {tax?.latest ? (
        <div className="card">
          <header>
            <h2>ภาษีงวดล่าสุด — {monthLabel(tax.latest.key)}</h2>
            <div className="spacer" />
            <Link className="btn" href="/finance/sales">ดูทุกงวด</Link>
          </header>
          <div className="body">
            <div className="grid g4">
              <div className="stat">
                <div className="label">ภาษีขาย</div>
                <div className="value" style={{ fontSize: 20 }}>{baht(tax.latest.out)}</div>
              </div>
              <div className="stat">
                <div className="label">ภาษีซื้อ</div>
                <div className="value" style={{ fontSize: 20 }}>{baht(tax.latest.in)}</div>
              </div>
              <div className="stat">
                <div className="label">
                  {tax.latest.payable > 0.004 ? 'ภาษีที่ต้องนำส่ง' : 'เครดิตยกไปงวดหน้า'}
                </div>
                <div className={`value${tax.latest.payable > 0.004 ? ' due' : ''}`} style={{ fontSize: 20 }}>
                  {baht(tax.latest.payable > 0.004 ? tax.latest.payable : tax.carryForward)}
                </div>
              </div>
              <div className="stat">
                <div className="label">หัก ณ ที่จ่ายที่ต้องนำส่ง</div>
                <div className="value" style={{ fontSize: 20 }}>{baht(tax.whtToRemit)}</div>
                <span className="n">ลูกค้าหักจากอู่ไว้ {baht(tax.whtWithheld)}</span>
              </div>
            </div>

            {tax.latest.carryIn > 0.004 ? (
              <div className="subtle" style={{ marginTop: 12 }}>
                งวดนี้มีเครดิตภาษียกมาจากงวดก่อน {baht(tax.latest.carryIn)} บาท หักออกให้แล้ว
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="card">
        <header><h2>เอกสารในระบบ</h2></header>
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr><th>ชนิดเอกสาร</th><th className="num">จำนวน</th><th /></tr>
            </thead>
            <tbody>
              {summary.docCounts.map((d) => {
                const sell = ['QT', 'IV', 'IVT', 'RC'].includes(d.kind);
                const canSee = sell ? seesIncome : can(session, 'expense');
                const href = sell ? { pathname: '/income', query: { kind: d.kind } }
                                  : { pathname: '/expense', query: { kind: d.kind } };
                return (
                  <tr key={d.kind}>
                    <td>{KIND_SHORT[d.kind] ?? d.kind}</td>
                    <td className="num">{d.count.toLocaleString('en-US')}</td>
                    <td>
                      {canSee ? (
                        <Link href={href} style={{ color: 'var(--ink-3)', textDecoration: 'underline' }}>
                          ดูรายการ
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
