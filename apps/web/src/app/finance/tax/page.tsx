import Link from 'next/link';
import { requireTab } from '@/lib/auth';
import { canExport, canTab } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { PlusUpsell } from '@/components/plus-upsell';
import { PrintReport } from '@/components/print-report';
import { PrintHeader } from '@/components/print-header';
import { EXPENSE_CATS } from '@drivegolight/core';
import { baht, monthLabel, thDate } from '@/lib/format';
import { todayIso } from '@/lib/license-window';
import { periodEnd } from '@/lib/payroll-calc';
import { getPlus } from '@/lib/plan';
import { getVatRegistered } from '@/lib/queries';
import {
  getTaxReport, recentMonths, TAX_DOCS, taxDocLabel, taxDocNeedsPayroll, taxDocOf, taxMonthOf,
  type PayTaxReport, type VatReport, type WhtReport,
} from '@/lib/tax';

export const dynamic = 'force-dynamic';

const TAX_POINTS = [
  'รายงานภาษีขายและรายงานภาษีซื้อรายเดือน พร้อมยื่น ภ.พ.30',
  'ใบแนบ ภ.ง.ด.3 และ ภ.ง.ด.53 จากค่าใช้จ่ายที่อู่หักภาษี ณ ที่จ่ายไว้',
  'ใบแนบ ภ.ง.ด.1 และเงินสมทบประกันสังคม (สปส.1-10) จากงวดเงินเดือน',
  'พิมพ์หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ให้ผู้รับเงินและพนักงาน',
  'ส่งออกทุกรายงานเป็น CSV ให้สำนักงานบัญชี',
];

/**
 * 06.7 เอกสารภาษี (Light Plus) — เลือกแบบและงวด ได้ตารางที่พิมพ์หรือส่งออกได้ทันที
 *
 * ตัวเลขทุกตัวอ่านจากเอกสารที่บันทึกไว้แล้ว ไม่มีการคำนวณภาษีใหม่ในหน้านี้ (tax-core.ts)
 */
export default async function TaxPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string; month?: string }>;
}) {
  const session = await requireTab('finance', 'tax');
  const sp = await searchParams;

  if (!(await getPlus())) {
    return (
      <Shell current="/finance" title="เอกสารภาษี" sub="ฟีเจอร์ของ DriveGo Light Plus">
        <SubNav menu="finance" current="tax">
          <PlusUpsell feature="เอกสารภาษี" points={TAX_POINTS} />
        </SubNav>
      </Shell>
    );
  }

  const today = todayIso();
  const doc = taxDocOf(sp.doc);
  const month = taxMonthOf(sp.month, today);
  /* ภ.ง.ด.1 และ สปส.1-10 แสดงเงินได้ของพนักงานรายคน — ต้องมีสิทธิ์แท็บเงินเดือนด้วย (taxDocNeedsPayroll)
     ไม่มีสิทธิ์ = ไม่อ่านข้อมูลเลย ไม่ใช่อ่านมาแล้วซ่อน */
  const blocked = taxDocNeedsPayroll(doc) && !canTab(session, 'finance', 'payroll');
  const [report, vatRegistered] = await Promise.all([
    blocked ? Promise.resolve(null) : getTaxReport(doc, month), getVatRegistered(),
  ]);
  const mayExport = !blocked && canExport(session, 'finance', 'tax');
  const months = recentMonths(today);
  if (!months.includes(month)) months.push(month);
  const title = `${taxDocLabel(doc)} — ${monthLabel(month)}`;
  const isVat = doc === 'vat-out' || doc === 'vat-in';

  return (
    <Shell current="/finance" title="เอกสารภาษี" sub={title}
           tools={mayExport ? (
             <>
               <PrintReport />{' '}
               <a className="btn" href={`/finance/tax/csv?doc=${doc}&month=${month}`} download>ส่งออก CSV</a>
             </>
           ) : undefined}>
      <SubNav menu="finance" current="tax">
        <PrintHeader title={title} range={{ from: `${month}-01`, to: periodEnd(month) }} />

        <div className="card no-print">
          <div className="toolbar" style={{ gap: 6, flexWrap: 'wrap' }}>
            {TAX_DOCS.map((d) => (
              <Link key={d.key} className={d.key === doc ? 'btn primary' : 'btn'}
                    href={{ pathname: '/finance/tax', query: { doc: d.key, month } }}>
                {d.short}
              </Link>
            ))}
            <div className="spacer" />
            <form autoComplete="off" action="/finance/tax" method="get" data-enter="own" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="hidden" name="doc" value={doc} />
              <label htmlFor="month" className="subtle">งวด</label>
              <select className="in" id="month" name="month" defaultValue={month}>
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
              <button className="btn" type="submit">แสดง</button>
            </form>
          </div>
        </div>

        {isVat && !vatRegistered ? (
          <div className="note" style={{ marginBottom: 14 }}>
            ร้านตั้งค่าเป็น<b>ไม่จดภาษีมูลค่าเพิ่ม</b> — รายงานนี้ใช้ยื่นแบบไม่ได้ แสดงไว้ให้ตรวจเอกสารเก่าที่มีภาษีเท่านั้น
          </div>
        ) : null}

        {report === null ? (
          <div className="card" data-payroll-blocked>
            <div className="empty">
              แบบนี้แสดงเงินได้ของพนักงานรายคน — เปิดได้เฉพาะผู้ที่มีสิทธิ์แท็บ "เงินเดือนพนักงาน" ติดต่อเจ้าของกิจการ
            </div>
          </div>
        ) : 'vat' in report
          ? <VatTable r={report.vat} sell={report.key === 'vat-out'} />
          : 'wht' in report
            ? <WhtTable r={report.wht} form={report.key} />
            : <PayTable r={report.pay} sso={report.key === 'sso'} month={month} />}
      </SubNav>
    </Shell>
  );
}

const sumRow = { fontWeight: 700 } as const;

function VatTable({ r, sell }: { r: VatReport; sell: boolean }) {
  return (
    <div className="card">
      <header>
        <h2>{sell ? 'รายงานภาษีขาย' : 'รายงานภาษีซื้อ'}</h2>
        <div className="spacer" />
        <span className="subtle">{r.rows.length.toLocaleString('en-US')} ใบ · ภาษี {baht(r.vat)} บาท</span>
      </header>
      {r.rows.length === 0 ? (
        <div className="empty">ไม่มีเอกสารที่มีภาษีมูลค่าเพิ่มในงวดนี้</div>
      ) : (
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 44 }}>ลำดับ</th><th>วันที่</th>
                <th>{sell ? 'เลขที่ใบกำกับภาษี / ใบเสร็จ' : 'เลขที่ใบกำกับภาษี (ผู้ขาย)'}</th>
                <th>{sell ? 'ชื่อผู้ซื้อ' : 'ชื่อผู้ขาย'}</th><th>เลขประจำตัวผู้เสียภาษี</th>
                <th className="num">มูลค่า</th><th className="num">ภาษีมูลค่าเพิ่ม</th><th className="num">รวม</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((x, i) => (
                <tr key={x.id}>
                  <td className="subtle">{i + 1}</td>
                  <td>{thDate(x.docDate)}</td>
                  <td className="mono">
                    <Link href={sell ? `/income/${x.id}` : `/expense/${x.id}`} style={{ textDecoration: 'underline' }}>
                      {sell ? x.docNo : (x.refDocNo || x.docNo)}
                    </Link>
                    {!sell && !x.refDocNo ? <div className="subtle" style={{ fontSize: '0.875rem' }}>ยังไม่ได้กรอกเลขใบกำกับของผู้ขาย</div> : null}
                  </td>
                  <td className="wrap">{x.partyName || '-'}</td>
                  <td className="mono">{x.partyTaxId || '-'}</td>
                  <td className="num mono">{baht(x.net)}</td>
                  <td className="num mono">{baht(x.vat)}</td>
                  <td className="num mono">{baht(x.total)}</td>
                </tr>
              ))}
              <tr style={sumRow}>
                <td colSpan={5}>รวม</td>
                <td className="num mono">{baht(r.net)}</td>
                <td className="num mono">{baht(r.vat)}</td>
                <td className="num mono">{baht(r.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="body">
        <span className="subtle">
          {sell
            ? 'นับเอกสารขายชุดเดียวกับรายงานยอดขาย — ใบส่งมอบ/ใบกำกับภาษี และใบเสร็จที่ไม่ได้ออกต่อจากใบส่งมอบ ยอดรวมจึงตรงกับการ์ดภาษีมูลค่าเพิ่มรายงวดของหน้ายอดขาย'
            : 'ใบซื้อและค่าใช้จ่ายที่บันทึกภาษีซื้อไว้ — ตรวจว่ามีใบกำกับภาษีตัวจริงครบก่อนนำไปหัก'}
        </span>
      </div>
    </div>
  );
}

const catLabel: Record<string, string> = Object.fromEntries(EXPENSE_CATS.map((c) => [c.key, c.label]));

function WhtTable({ r, form }: { r: WhtReport; form: 'pnd3' | 'pnd53' }) {
  return (
    <div className="card">
      <header>
        <h2>ใบแนบ {form === 'pnd3' ? 'ภ.ง.ด.3 (ผู้รับเป็นบุคคลธรรมดา)' : 'ภ.ง.ด.53 (ผู้รับเป็นนิติบุคคล)'}</h2>
        <div className="spacer" />
        <span className="subtle">{r.rows.length.toLocaleString('en-US')} ราย · ภาษีที่ต้องนำส่ง {baht(r.wht)} บาท</span>
      </header>
      {r.rows.length === 0 ? (
        <div className="empty">ไม่มีค่าใช้จ่ายที่หักภาษี ณ ที่จ่ายในงวดนี้</div>
      ) : (
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 44 }}>ลำดับ</th><th>วันที่จ่าย</th><th>ผู้รับเงิน</th><th>เลขประจำตัวผู้เสียภาษี</th>
                <th>ประเภทเงินได้</th><th className="num">อัตรา</th>
                <th className="num">จำนวนเงินที่จ่าย</th><th className="num">ภาษีที่หัก</th><th className="no-print" />
              </tr>
            </thead>
            <tbody>
              {r.rows.map((x, i) => (
                <tr key={x.id}>
                  <td className="subtle">{i + 1}</td>
                  <td>{thDate(x.docDate)}</td>
                  <td className="wrap">
                    {x.partyName || '-'}
                    {x.partyAddr ? <div className="subtle" style={{ fontSize: '0.875rem' }}>{x.partyAddr}</div> : null}
                  </td>
                  <td className="mono">{x.partyTaxId || <span style={{ color: 'var(--due)' }}>ยังไม่ได้กรอก</span>}</td>
                  <td>{catLabel[x.cat] ?? x.cat}</td>
                  <td className="num mono">{x.rate}%</td>
                  <td className="num mono">{baht(x.base)}</td>
                  <td className="num mono">{baht(x.wht)}</td>
                  <td className="no-print">
                    <span className="row-acts">
                      <Link className="btn sm" href={`/expense/${x.id}`}>{x.docNo}</Link>
                      <Link className="btn sm" href={`/finance/tax/cert?doc=${x.id}`}>50 ทวิ</Link>
                    </span>
                  </td>
                </tr>
              ))}
              <tr style={sumRow}>
                <td colSpan={6}>รวม</td>
                <td className="num mono">{baht(r.base)}</td>
                <td className="num mono">{baht(r.wht)}</td>
                <td className="no-print" />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="body">
        <span className="subtle">
          งวดดูจากวันที่ของเอกสารค่าใช้จ่าย — ตามกฎหมายภาษีหัก ณ ที่จ่ายถือวันที่จ่ายเงินจริง
          ใบที่บันทึกเดือนหนึ่งแต่จ่ายอีกเดือนให้ตรวจงวดก่อนยื่น · แยกแบบตามชนิดผู้ติดต่อ (บุคคล / นิติบุคคล) ของเอกสาร
        </span>
      </div>
    </div>
  );
}

function PayTable({ r, sso, month }: { r: PayTaxReport; sso: boolean; month: string }) {
  const rows = sso ? r.rows.filter((x) => x.sso > 0.004) : r.rows;
  const year = Number(month.slice(0, 4));
  return (
    <div className="card">
      <header>
        <h2>{sso ? 'เงินสมทบประกันสังคม (สปส.1-10 ส่วนที่ 2)' : 'ใบแนบ ภ.ง.ด.1 (เงินเดือน ค่าจ้าง)'}</h2>
        <div className="spacer" />
        <span className="subtle">
          {r.payDate ? `จ่าย ${thDate(r.payDate)} · ` : ''}{rows.length.toLocaleString('en-US')} คน
        </span>
      </header>
      {r.payDate === null ? (
        <div className="empty">
          {sso ? 'ยังไม่ได้เปิดงวดเงินเดือนของเดือนนี้' : 'ไม่มีงวดเงินเดือนที่จ่ายเงินในเดือนนี้'} — <Link href="/finance/payroll" style={{ textDecoration: 'underline' }}>ไปที่เงินเดือนพนักงาน</Link>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">{sso ? 'งวดนี้ไม่มีพนักงานที่หักเงินสมทบ' : 'งวดนี้ไม่มีพนักงาน'}</div>
      ) : (
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              {sso ? (
                <tr>
                  <th style={{ width: 44 }}>ลำดับ</th><th>เลขประจำตัวประชาชน</th><th>ชื่อผู้ประกันตน</th>
                  <th className="num">ค่าจ้าง</th><th className="num">เงินสมทบผู้ประกันตน</th>
                </tr>
              ) : (
                <tr>
                  <th style={{ width: 44 }}>ลำดับ</th><th>เลขประจำตัวผู้เสียภาษี</th><th>ชื่อผู้มีเงินได้</th>
                  <th className="num">เงินได้ที่จ่าย</th><th className="num">ภาษีที่หัก</th><th className="no-print" />
                </tr>
              )}
            </thead>
            <tbody>
              {rows.map((x, i) => (
                <tr key={x.employeeId}>
                  <td className="subtle">{i + 1}</td>
                  <td className="mono">{x.taxId || <span style={{ color: 'var(--due)' }}>ยังไม่ได้กรอก</span>}</td>
                  <td className="wrap">{x.name}</td>
                  {sso ? (
                    <>
                      <td className="num mono">{baht(x.ssoWage)}</td>
                      <td className="num mono">{baht(x.sso)}</td>
                    </>
                  ) : (
                    <>
                      <td className="num mono">{baht(x.income)}</td>
                      <td className="num mono">{baht(x.wht)}</td>
                      <td className="no-print">
                        <Link className="btn sm" href={`/finance/tax/cert?employee=${x.employeeId}&year=${year}`}>50 ทวิ</Link>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              <tr style={sumRow}>
                <td colSpan={3}>รวม</td>
                {sso ? (
                  <>
                    <td className="num mono">{baht(rows.reduce((s, x) => s + x.ssoWage, 0))}</td>
                    <td className="num mono">{baht(r.sso)}</td>
                  </>
                ) : (
                  <>
                    <td className="num mono">{baht(r.income)}</td>
                    <td className="num mono">{baht(r.wht)}</td>
                    <td className="no-print" />
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="body">
        <span className="subtle">
          {sso
            ? `เงินสมทบส่วนนายจ้างเท่ากับส่วนผู้ประกันตน — รวมนำส่งงวดนี้ ${baht(r.sso * 2)} บาท (ผู้ประกันตน ${baht(r.sso)} + นายจ้าง ${baht(r.sso)}) · ค่าจ้างแสดงตามฐานที่ใช้คิดเงินสมทบ (1,650 – 17,500 บาท)`
            : 'นับตามวันที่จ่ายเงิน ไม่ใช่เดือนของงวด — งวดที่จ่ายข้ามเดือนจะอยู่ในแบบของเดือนที่จ่าย · แสดงผู้มีเงินได้ทุกคน รวมคนที่ภาษีเป็นศูนย์ ตามที่ใบแนบ ภ.ง.ด.1 ต้องกรอก'}
        </span>
      </div>
    </div>
  );
}
