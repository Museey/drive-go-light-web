import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireExport } from '@/lib/auth';
import { isUuid } from '@/lib/ids';
import { PrintButton } from '@/app/income/[id]/print/print-button';
import { BackFab } from '@/components/back-fab';
import { baht, monthLabel, thDateLong } from '@/lib/format';
import { lineDeduct, lineIncome } from '@/lib/payroll-calc';
import { getRun } from '@/lib/payroll';
import { getPlus } from '@/lib/plan';
import { getShop } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * สลิปเงินเดือนทั้งงวด — หนึ่งคนหนึ่งแผ่น สั่งพิมพ์ครั้งเดียวได้ครบ (หรือบันทึกเป็น PDF)
 * อู่แพ็กเกจ Light ถูกพากลับหน้ารายการงวด · getRun ตรวจแพ็กเกจซ้ำเอง
 */
export default async function PayslipsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireExport('finance', 'payroll');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  /* อู่แพ็กเกจ Light — กลับไปหน้าที่มีการ์ดชวนอัปเกรด ไม่ใช่หน้าข้อผิดพลาด */
  if (!(await getPlus())) redirect('/finance/payroll');

  const [run, shop] = await Promise.all([getRun(id), getShop()]);
  if (!run) notFound();
  const back = `/finance/payroll/${run.id}`;

  return (
    <>
      <div className="printbar">
        <Link className="btn" href={back}>← กลับงวดเงินเดือน</Link>
        <div className="spacer" />
        <span style={{ color: 'var(--ink-3)', fontSize: '0.875rem' }}>
          {run.items.length.toLocaleString('en-US')} คน · หนึ่งคนหนึ่งแผ่น
        </span>
        <PrintButton label="พิมพ์สลิป" />
      </div>
      <BackFab solo fallbackHref={back} />

      <div className="printview">
        {run.items.length === 0 ? (
          <div className="paper"><div className="empty">งวดนี้ไม่มีพนักงาน</div></div>
        ) : run.items.map((it) => (
          <div className="paper" key={it.id} style={{ minHeight: 'auto' }}>
            <div className="doc-head">
              <div className="co">
                <b>{shop.name}</b>
                <div>{shop.addrText || ''}</div>
                <div>
                  โทร. {shop.tel || '-'}
                  {shop.taxId ? ` · เลขประจำตัวผู้เสียภาษี ${shop.taxId}` : ''}
                </div>
              </div>
              <div className="doc-meta">
                <h1>สลิปเงินเดือน</h1>
                <div style={{ fontSize: '0.875rem', letterSpacing: '.08em' }}>PAY SLIP</div>
                <table style={{ marginTop: 4 }}>
                  <tbody>
                    <tr><td>งวด</td><td style={{ textAlign: 'right' }}>{monthLabel(run.period)}</td></tr>
                    <tr><td>วันที่จ่าย</td><td style={{ textAlign: 'right' }}>{thDateLong(run.payDate)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="box">
              <div className="kv"><b>พนักงาน</b><span>{it.name}</span><b>รหัส</b><span className="mono">{it.code}</span></div>
              <div className="kv">
                <b>ตำแหน่ง</b><span>{it.position || '-'}</span>
                <b>เลขประจำตัวผู้เสียภาษี</b><span className="mono">{it.taxId || '-'}</span>
              </div>
            </div>

            <table className="doc">
              <thead>
                <tr><th style={{ width: '50%' }}>เงินได้</th><th>รายการหัก</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ verticalAlign: 'top' }}>
                    <Line label="เงินเดือน / ค่าจ้าง" amount={it.base} />
                    <Line label="ค่าล่วงเวลา" amount={it.overtime} />
                    <Line label="เงินได้อื่น" amount={it.otherIncome} />
                  </td>
                  <td style={{ verticalAlign: 'top' }}>
                    <Line label="เงินสมทบประกันสังคม" amount={it.sso} />
                    <Line label="ภาษีหัก ณ ที่จ่าย" amount={it.wht} />
                    <Line label="หักอื่น" amount={it.otherDeduct} />
                  </td>
                </tr>
                <tr>
                  <td><Line label="รวมเงินได้" amount={lineIncome(it)} bold /></td>
                  <td><Line label="รวมรายการหัก" amount={lineDeduct(it)} bold /></td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ background: '#EDEFF1' }}>
                    <Line label="เงินได้สุทธิที่จ่าย" amount={it.net} bold />
                  </td>
                </tr>
              </tbody>
            </table>

            {it.note ? <div style={{ fontSize: '0.875rem', marginTop: 6 }}>หมายเหตุ: {it.note}</div> : null}

            <div className="sign">
              <div><div className="line" />ผู้จ่ายเงิน</div>
              <div><div className="line" />ผู้รับเงิน</div>
            </div>

            <div className="brandfoot">
              <span>จัดทำด้วยโปรแกรม DriveGoLight! Plus</span>
              <span>เอกสารนี้ใช้ภายในกิจการ</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Line({ label, amount, bold }: { label: string; amount: number; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: bold ? 700 : undefined }}>
      <span>{label}</span>
      <span className="mono">{baht(amount)}</span>
    </div>
  );
}
