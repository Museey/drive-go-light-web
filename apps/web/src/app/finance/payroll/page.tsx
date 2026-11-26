import Link from 'next/link';
import { requireTab } from '@/lib/auth';
import { canEdit } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { PlusUpsell } from '@/components/plus-upsell';
import { baht, monthLabel, thDate } from '@/lib/format';
import { todayIso } from '@/lib/license-window';
import { listEmployees, listRuns } from '@/lib/payroll';
import { getPlus } from '@/lib/plan';
import { recentMonths } from '@/lib/tax';
import { NewRunForm } from './new-run';
import { PAYROLL_POINTS } from './points';
import { DeleteRun } from './row-buttons';

export const dynamic = 'force-dynamic';

/**
 * 06.5 เงินเดือนพนักงาน — รายการงวด (Light Plus)
 *
 * เดือนละหนึ่งงวด เปิดงวดแล้วระบบใส่พนักงานที่ใช้งานอยู่ทุกคนพร้อมค่าเสนอจากทะเบียน
 */
export default async function PayrollPage() {
  const session = await requireTab('finance', 'payroll');
  const plus = await getPlus();

  if (!plus) {
    return (
      <Shell current="/finance" title="เงินเดือนพนักงาน" sub="ฟีเจอร์ของ DriveGo Light Plus">
        <SubNav menu="finance" current="payroll">
          <PlusUpsell feature="เงินเดือนและพนักงาน" points={PAYROLL_POINTS} />
        </SubNav>
      </Shell>
    );
  }

  const [runs, employees] = await Promise.all([listRuns(), listEmployees()]);
  const mayEdit = canEdit(session, 'finance', 'payroll');
  const today = todayIso();
  const taken = new Set(runs.map((r) => r.period));
  const months = recentMonths(today, 6).filter((m) => !taken.has(m));

  return (
    <Shell current="/finance" title="เงินเดือนพนักงาน"
           sub={`${runs.length.toLocaleString('en-US')} งวด · พนักงานที่ใช้งานอยู่ ${employees.length.toLocaleString('en-US')} คน`}>
      <SubNav menu="finance" current="payroll">
        {employees.length === 0 ? (
          <div className="note" style={{ marginBottom: 14 }}>
            ยังไม่มีพนักงานในทะเบียน — <Link href="/finance/payroll/employees/new" style={{ textDecoration: 'underline' }}>เพิ่มพนักงานคนแรก</Link> ก่อนเปิดงวดเงินเดือน
          </div>
        ) : null}

        {mayEdit && employees.length > 0 ? (
          <div className="card">
            <header><h2>เปิดงวดเงินเดือน</h2></header>
            <div className="body">
              {months.length ? (
                <NewRunForm months={months.map((m) => ({ value: m, label: monthLabel(m) }))} />
              ) : (
                <span className="subtle">หกเดือนล่าสุดเปิดงวดครบแล้ว — เปิดงวดเดิมจากรายการด้านล่างเพื่อแก้ไข</span>
              )}
              <div className="hint" style={{ marginTop: 8 }}>
                เดือนละหนึ่งงวด · ระบบใส่พนักงานที่ใช้งานอยู่ทุกคนพร้อมค่าเสนอจากทะเบียน แล้วแก้ตัวเลขได้ก่อนบันทึก
              </div>
            </div>
          </div>
        ) : null}

        {/* งวดเงินเดือนกับรายงานกำไรขาดทุนยังเป็นคนละชุดข้อมูล — บอกไว้ตรงนี้ ไม่งั้นเจ้าของจะเข้าใจว่ากำไรหักเงินเดือนแล้ว
            ไม่ลงให้อัตโนมัติเพราะอู่ที่บันทึกค่าใช้จ่ายหมวดเงินเดือนอยู่แล้วจะถูกนับซ้ำ */}
        <div className="note" style={{ marginBottom: 14 }}>
          ยอดของงวดเงินเดือน<b>ยังไม่ถูกนำไปลงรายงานกำไรขาดทุนให้อัตโนมัติ</b> — ให้บันทึกค่าใช้จ่ายหมวด
          "เงินเดือนพนักงาน" ที่เมนูรายจ่ายตามเดิม เพื่อให้ขึ้นในกำไรขาดทุน
        </div>

        <div className="card">
          <header><h2>งวดเงินเดือน</h2></header>
          {runs.length === 0 ? (
            <div className="empty">ยังไม่มีงวดเงินเดือน</div>
          ) : (
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>งวด</th><th>วันที่จ่าย</th><th className="num">พนักงาน</th>
                    <th className="num">เงินได้รวม</th><th className="num">ประกันสังคม</th>
                    <th className="num">หัก ณ ที่จ่าย</th><th className="num">จ่ายสุทธิ</th><th />
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td><b>{monthLabel(r.period)}</b></td>
                      <td>{thDate(r.payDate)}</td>
                      <td className="num">{r.people}</td>
                      <td className="num mono">{baht(r.income)}</td>
                      <td className="num mono">{baht(r.sso)}</td>
                      <td className="num mono">{baht(r.wht)}</td>
                      <td className="num mono"><b>{baht(r.net)}</b></td>
                      <td>
                        <span className="row-acts">
                          <Link className="btn sm act-edit" href={`/finance/payroll/${r.id}`}>{mayEdit ? 'แก้ไข' : 'เปิด'}</Link>
                          <Link className="btn sm" href={`/finance/payroll/${r.id}/print`}>สลิป</Link>
                          {mayEdit ? <DeleteRun id={r.id} label={monthLabel(r.period)} /> : null}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SubNav>
    </Shell>
  );
}
