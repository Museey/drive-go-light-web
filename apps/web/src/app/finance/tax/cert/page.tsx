import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { bahttext } from '@drivegolight/core';
import { canTab, requireExport } from '@/lib/auth';
import { isUuid } from '@/lib/ids';
import { PrintButton } from '@/app/income/[id]/print/print-button';
import { BackFab } from '@/components/back-fab';
import { baht, thDateLong } from '@/lib/format';
import { todayIso } from '@/lib/license-window';
import { getPlus } from '@/lib/plan';
import { getShop } from '@/lib/queries';
import { getWhtCertForDoc, getWhtCertForEmployee, type WhtCert } from '@/lib/tax';

export const dynamic = 'force-dynamic';

const FORMS: { key: WhtCert['form'] | 'other'; label: string }[] = [
  { key: 'pnd1', label: 'ภ.ง.ด.1ก' },
  { key: 'pnd3', label: 'ภ.ง.ด.3' },
  { key: 'pnd53', label: 'ภ.ง.ด.53' },
];

const COPIES = [
  'ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)',
  'ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)',
];

/**
 * หนังสือรับรองการหักภาษี ณ ที่จ่าย ตามมาตรา 50 ทวิ — พิมพ์สองฉบับในครั้งเดียว
 *
 *   ?doc=<id>                    ค่าใช้จ่ายหนึ่งใบที่อู่หักภาษีไว้ (ภ.ง.ด.3 / ภ.ง.ด.53)
 *   ?employee=<id>&year=<ค.ศ.>   เงินเดือนของพนักงานทั้งปีภาษี (ภ.ง.ด.1ก)
 *
 * มีข้อความครบตามที่มาตรา 50 ทวิ กำหนด แต่จัดหน้าเอง ไม่ใช่สำเนาแบบพิมพ์ของกรมสรรพากรทุกช่อง
 */
export default async function WhtCertPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string; employee?: string; year?: string }>;
}) {
  const session = await requireExport('finance', 'tax');
  const sp = await searchParams;
  if (!(await getPlus())) redirect('/finance/tax');

  let cert: WhtCert | null = null;
  if (sp.doc) {
    if (!isUuid(sp.doc)) notFound();
    cert = await getWhtCertForDoc(sp.doc);
  } else if (sp.employee) {
    /* 50 ทวิ ของพนักงานคือเงินเดือนทั้งปีของคนนั้น — ต้องมีสิทธิ์แท็บเงินเดือนด้วย (taxDocNeedsPayroll) */
    if (!canTab(session, 'finance', 'payroll')) redirect('/?denied=finance.payroll');
    const year = Number(sp.year);
    if (!isUuid(sp.employee) || !Number.isInteger(year) || year < 2000 || year > 2200) notFound();
    cert = await getWhtCertForEmployee(sp.employee, year);
  }
  if (!cert) notFound();

  const shop = await getShop();
  const back = cert.form === 'pnd1' ? '/finance/tax?doc=pnd1' : `/finance/tax?doc=${cert.form}`;
  const issued = todayIso();

  return (
    <>
      <div className="printbar">
        <Link className="btn" href={back}>← กลับเอกสารภาษี</Link>
        <div className="spacer" />
        <span style={{ color: 'var(--ink-3)', fontSize: '0.875rem' }}>พิมพ์สองฉบับ — ให้ผู้รับเงินทั้งสองฉบับ</span>
        <PrintButton label="พิมพ์ 50 ทวิ" />
      </div>
      <BackFab solo fallbackHref={back} />

      <div className="printview">
        {COPIES.map((copy) => (
          <div className="paper" key={copy}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span>{copy}</span>
              <span>เลขที่ <span className="mono">{cert.refNo}</span></span>
            </div>
            <h1 style={{ textAlign: 'center', fontSize: '1.0625rem', marginTop: 6 }}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</h1>
            <div style={{ textAlign: 'center', fontSize: '0.875rem' }}>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>

            <div className="box">
              <h4>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</h4>
              <div className="kv"><b>ชื่อ</b><span>{shop.name}</span><b>เลขประจำตัวผู้เสียภาษี</b><span className="mono">{shop.taxId || '-'}</span></div>
              <div className="kv"><b>ที่อยู่</b><span>{shop.addrText || '-'}</span></div>
            </div>

            <div className="box">
              <h4>ผู้ถูกหักภาษี ณ ที่จ่าย</h4>
              <div className="kv"><b>ชื่อ</b><span>{cert.payeeName || '-'}</span><b>เลขประจำตัวผู้เสียภาษี</b><span className="mono">{cert.payeeTaxId || '-'}</span></div>
              <div className="kv"><b>ที่อยู่</b><span>{cert.payeeAddr || '-'}</span></div>
            </div>

            <div style={{ marginTop: 8, fontSize: '0.875rem' }}>
              แบบยื่นรายการภาษีหัก ณ ที่จ่าย:{' '}
              {FORMS.map((f) => (
                <span key={f.key} style={{ marginLeft: 14 }}>
                  <span className="tick">{f.key === cert.form ? '✓' : ''}</span>{f.label}
                </span>
              ))}
            </div>

            <table className="doc">
              <thead>
                <tr>
                  <th>ประเภทเงินได้พึงประเมินที่จ่าย</th>
                  <th style={{ width: 120 }}>วัน เดือน ปี ที่จ่าย</th>
                  <th style={{ width: 120 }}>จำนวนเงินที่จ่าย</th>
                  <th style={{ width: 120 }}>ภาษีที่หักและนำส่งไว้</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{cert.incomeLabel}</td>
                  <td style={{ textAlign: 'center' }}>{/^\d{4}-\d{2}-\d{2}$/.test(cert.paidOn) ? thDateLong(cert.paidOn) : cert.paidOn}</td>
                  <td className="num mono" style={{ textAlign: 'right' }}>{baht(cert.income)}</td>
                  <td className="num mono" style={{ textAlign: 'right' }}>{baht(cert.wht)}</td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ textAlign: 'right', fontWeight: 700 }}>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td>
                  <td className="num mono" style={{ textAlign: 'right', fontWeight: 700 }}>{baht(cert.income)}</td>
                  <td className="num mono" style={{ textAlign: 'right', fontWeight: 700 }}>{baht(cert.wht)}</td>
                </tr>
              </tbody>
            </table>

            <div className="box">
              <div className="kv"><b>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)</b><span>{bahttext(cert.wht)}</span></div>
              {cert.form === 'pnd1' ? (
                <div className="kv"><b>เงินที่จ่ายเข้ากองทุนประกันสังคม</b><span className="mono">{baht(cert.sso)} บาท</span></div>
              ) : null}
              <div style={{ marginTop: 4, fontSize: '0.875rem' }}>
                ผู้จ่ายเงิน: <span className="tick">✓</span>(1) หัก ณ ที่จ่าย
                <span style={{ marginLeft: 14 }}><span className="tick" />(2) ออกให้ตลอดไป</span>
                <span style={{ marginLeft: 14 }}><span className="tick" />(3) ออกให้ครั้งเดียว</span>
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: '0.875rem' }}>
              ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ
            </div>
            <div className="sign">
              <div />
              <div>
                <div className="line" />
                ผู้จ่ายเงิน
                <div style={{ fontSize: '0.875rem', marginTop: 2 }}>วันที่ออกหนังสือรับรอง {thDateLong(issued)}</div>
              </div>
            </div>

            <div className="brandfoot">
              <span>จัดทำด้วยโปรแกรม DriveGoLight! Plus</span>
              <span>{shop.name}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
