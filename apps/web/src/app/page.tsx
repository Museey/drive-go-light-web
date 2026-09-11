import Link from 'next/link';
import { can, requireSession } from '@/lib/auth';
import { canHomeReport } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { DateRange } from '@/components/date-range';
import { Icon } from '@/components/icon';
import { getHomeSummary, getShop } from '@/lib/queries';
import { getTaxSummary } from '@/lib/reports';
import { baht, KIND_SHORT, monthLabel } from '@/lib/format';
import { OwingList, SalesBars } from '@/components/sales-bars';

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
  const seesReport = canHomeReport(session);

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

      {seesReport ? (
        <div className="card" style={{ marginBottom: 18 }}>
          <DateRange base="/" from={sp.from} to={sp.to} />
        </div>
      ) : null}

      {/* ---------- การ์ดสรุป ตามรุ่น 6.4 ----------
           แต่ละใบมีปุ่มพาไปหน้าที่ทำงานต่อได้ ไม่ใช่แค่บอกตัวเลขแล้วปล่อยให้หาเอง

           พนักงานที่ถูกปิดสิทธิ์ "เห็นรายงานสรุปหน้าแรก" จะเหลือแค่การ์ดเมนูใช้งาน
           ไม่เห็นยอดขาย ลูกหนี้ เจ้าหนี้ และภาษี ตามรุ่น 6.4 */}
      {seesReport ? (
      <div className="hgrid" style={{ marginBottom: 16 }}>

        <div className="hcard">
          <header>
            <Icon name="sales" size={22} color="#1F5FBF" />
            <h2>สรุปยอดขาย{ranged ? ' (ช่วงที่เลือก)' : ''}</h2>
            {seesIncome ? (
              <Link className="go" href="/income?kind=RC">ดูใบเสร็จทั้งหมด<span className="ar">→</span></Link>
            ) : null}
          </header>
          <div className="body">
            <div className="big">{baht(summary.salesThisYear)} <small>บาท ก่อนภาษี</small></div>
            <div className="row"><span>จำนวนใบ</span><b>{summary.salesDocCount.toLocaleString('en-US')}</b></div>
            <div className="row"><span>เฉลี่ยต่อใบ</span><b>{baht(summary.salesAvg)}</b></div>
            <div className="row"><span>รับชำระแล้ว</span><b style={{ color: 'var(--ok)' }}>{baht(summary.salesPaid)}</b></div>
            {/* แท่งหกเดือนไม่ขยับตามช่วงวันที่ที่เลือก — "หกเดือนล่าสุด" ต้องแปลว่าหกเดือนล่าสุดเสมอ */}
            <SalesBars months={summary.salesBars} />
          </div>
        </div>

        <div className="hcard">
          <header>
            <Icon name="cart" size={22} color="#C25A18" />
            <h2>รายจ่ายในช่วงเดียวกัน</h2>
            {can(session, 'expense') ? (
              <Link className="go" href="/expense">ดูรายจ่าย<span className="ar">→</span></Link>
            ) : null}
          </header>
          <div className="body">
            <div className="big">{baht(summary.spendTotal)} <small>บาท</small></div>
            <div className="row"><span>ซื้อสินค้า</span><b>{baht(summary.spendBuy)}</b></div>
            <div className="row"><span>ค่าใช้จ่ายกิจการ</span><b>{baht(summary.spendExpense)}</b></div>
          </div>
        </div>

        <div className="hcard">
          <header>
            <Icon name="ar" size={22} color="#1D7A5F" />
            <h2>สรุปลูกหนี้จากการขาย</h2>
            {seesFinance ? (
              <Link className="go" href="/finance/ar">ไปหน้าตัดชำระ<span className="ar">→</span></Link>
            ) : null}
          </header>
          <div className="body">
            <div className="big" style={{ color: summary.arOutstanding > 0.004 ? 'var(--warn)' : undefined }}>
              {baht(summary.arOutstanding)} <small>บาท</small>
            </div>
            <div className="row"><span>ใบที่ยังค้าง</span><b>{summary.ar.count}</b></div>
            <div className="row">
              <span>เกินกำหนดชำระ</span>
              <b style={summary.ar.overdueCount > 0 ? { color: 'var(--due)' } : undefined}>
                {summary.ar.overdueCount} ใบ · {baht(summary.ar.overdueTotal)}
              </b>
            </div>
            <div className="label" style={{ marginTop: 12 }}>ลูกค้าที่ค้างมากที่สุด</div>
            <OwingList rows={summary.ar.top} empty="ไม่มีลูกหนี้คงค้าง" />
          </div>
        </div>

        <div className="hcard">
          <header>
            <Icon name="ap" size={22} color="#C25A18" />
            <h2>สรุปเจ้าหนี้การค้า</h2>
            {seesFinance ? (
              <Link className="go" href="/finance/ap">ไปหน้าตัดชำระ<span className="ar">→</span></Link>
            ) : null}
          </header>
          <div className="body">
            <div className="big" style={{ color: summary.apOutstanding > 0.004 ? 'var(--due)' : undefined }}>
              {baht(summary.apOutstanding)} <small>บาท</small>
            </div>
            <div className="row"><span>ใบที่ยังค้าง</span><b>{summary.ap.count}</b></div>
            <div className="row">
              <span>เกินกำหนดชำระ</span>
              <b style={summary.ap.overdueCount > 0 ? { color: 'var(--due)' } : undefined}>
                {summary.ap.overdueCount} ใบ · {baht(summary.ap.overdueTotal)}
              </b>
            </div>
            <div className="label" style={{ marginTop: 12 }}>ผู้ขายที่ต้องจ่ายมากที่สุด</div>
            <OwingList rows={summary.ap.top} empty="ไม่มีเจ้าหนี้คงค้าง" />
          </div>
        </div>

        <div className="hcard">
          <header>
            <Icon name="box" size={22} color="#2E8B3D" />
            <h2>สินค้าที่ต้องสั่งซื้อ</h2>
            {seesStock ? (
              <Link className="go" href="/stock?reorder=1">ดูสต๊อกทั้งหมด<span className="ar">→</span></Link>
            ) : null}
          </header>
          <div className="body">
            <div className="big" style={{ color: summary.reorderCount > 0 ? 'var(--warn)' : undefined }}>
              {summary.reorderCount} <small>รายการ</small>
            </div>
            <div className="row">
              <span>ประมาณการเงินที่ต้องใช้</span><b>{baht(summary.reorderCost)}</b>
            </div>
            <div className="row"><span>สินค้าทั้งหมด</span><b>{summary.productCount.toLocaleString('en-US')}</b></div>
          </div>
        </div>

        {/* การ์ดของใกล้หมดอายุขึ้นเฉพาะตอนมีของจริง —
            อู่ที่ขายแต่อะไหล่ซึ่งไม่มีวันหมดอายุจะไม่มีการ์ดศูนย์ค้างอยู่ตลอดกาล
            ส่วนอู่ที่กรอกวันหมดอายุไว้ พอมีของใกล้หมดการ์ดจะโผล่ขึ้นมาเอง */}
        {summary.expiringCount > 0 ? (
        <div className="hcard">
          <header>
            <Icon name="pending" size={22} color={summary.expiredCount > 0 ? '#B3382C' : '#B4720B'} />
            <h2>ของใกล้หมดอายุ</h2>
            {seesStock ? (
              <Link className="go" href="/stock/expiry">ดูรายการ<span className="ar">→</span></Link>
            ) : null}
          </header>
          <div className="body">
            <div className="big" style={{ color: summary.expiredCount > 0 ? 'var(--due)' : 'var(--warn)' }}>
              {summary.expiringCount} <small>ล็อต</small>
            </div>
            <div className="row">
              <span>หมดอายุไปแล้ว</span>
              <b style={summary.expiredCount > 0 ? { color: 'var(--due)' } : undefined}>
                {summary.expiredCount} ล็อต
              </b>
            </div>
            <div className="row"><span>มูลค่าของที่เหลือในล็อตนั้น</span><b>{baht(summary.expiringValue)}</b></div>
          </div>
        </div>
        ) : null}

        <div className="hcard">
          <header>
            <Icon name="pending" size={22} color="#B4720B" />
            <h2>สินค้าค้างสต๊อก ≥ 6 เดือน</h2>
            {seesStock ? (
              <Link className="go" href="/stock?flag=dead">ดูรายการ<span className="ar">→</span></Link>
            ) : null}
          </header>
          <div className="body">
            <div className="big" style={{ color: summary.deadCount > 0 ? 'var(--warn)' : undefined }}>
              {summary.deadCount} <small>รายการ</small>
            </div>
            <div className="row"><span>เงินจมในชั้นวาง</span><b>{baht(summary.deadValue)}</b></div>
          </div>
        </div>

      </div>
      ) : null}

      {/* ---------- ของที่ควรสั่งก่อน ---------- */}
      {seesReport && seesStock && summary.reorderTop.length > 0 ? (
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

            {/* แยกตามอัตรา — รูปเดียวกับที่ต้องกรอกตอนยื่นแบบ ไม่ใช่ยอดรวมก้อนเดียว */}
            {tax.whtRates.length > 0 ? (
              <div style={{ marginTop: 14 }}>
                <div className="label" style={{ marginBottom: 4 }}>
                  ภาษีที่ลูกค้าหักจากอู่ แยกตามอัตรา
                </div>
                {tax.whtRates.map((w) => (
                  <div key={w.rate} className="row">
                    <span>
                      อัตรา {w.rate}%
                      <span className="subtle" style={{ fontSize: 11.5 }}>
                        {' '}· {w.count} ใบ · ฐาน {baht(w.base)}
                      </span>
                    </span>
                    <b>{baht(w.amount)}</b>
                  </div>
                ))}
                <div className="subtle" style={{ marginTop: 8, fontSize: 12 }}>
                  ยอดนี้คือภาษีที่ลูกค้านิติบุคคลหักไว้จากอู่ ใช้เป็นเครดิตภาษีตอนยื่นแบบประจำปี
                  — อย่าลืมขอหนังสือรับรองการหักภาษี ณ ที่จ่ายจากลูกค้าทุกครั้ง
                </div>
              </div>
            ) : null}

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
