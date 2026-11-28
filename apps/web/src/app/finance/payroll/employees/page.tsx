import Link from 'next/link';
import { requireTab } from '@/lib/auth';
import { canEdit } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { PlusUpsell } from '@/components/plus-upsell';
import { baht } from '@/lib/format';
import { empTypeLabel } from '@/lib/payroll-calc';
import { listEmployees } from '@/lib/payroll';
import { getPlus } from '@/lib/plan';
import { PAYROLL_POINTS } from '../points';
import { ToggleEmployee } from '../row-buttons';

export const dynamic = 'force-dynamic';

/**
 * 06.6 ทะเบียนพนักงาน (Light Plus) — แท็บลูกของเงินเดือน ใช้สิทธิ์ finance.payroll
 *
 * พนักงานคือคนที่อู่จ่ายเงินเดือนให้ คนละเรื่องกับ "ตั้งค่าพนักงาน" (07.2) ซึ่งเป็นบัญชีเข้าระบบ
 */
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; all?: string }>;
}) {
  const session = await requireTab('finance', 'payroll');
  const sp = await searchParams;

  if (!(await getPlus())) {
    return (
      <Shell current="/finance" title="ทะเบียนพนักงาน" sub="ฟีเจอร์ของ DriveGo Light Plus">
        <SubNav menu="finance" current="employees">
          <PlusUpsell feature="เงินเดือนและพนักงาน" points={PAYROLL_POINTS} />
        </SubNav>
      </Shell>
    );
  }

  const showAll = sp.all === '1';
  const employees = await listEmployees({ all: showAll });
  const mayEdit = canEdit(session, 'finance', 'payroll');
  const active = employees.filter((e) => e.active);

  return (
    <Shell current="/finance" title="ทะเบียนพนักงาน"
           sub={`ใช้งานอยู่ ${active.length.toLocaleString('en-US')} คน · เงินเดือนรวม ${baht(active.reduce((s, e) => s + e.baseSalary, 0))} บาท/เดือน`}>
      <SubNav menu="finance" current="employees">
        {sp.saved ? <div className="ok-msg" style={{ marginBottom: 12 }}>บันทึกข้อมูลพนักงานแล้ว</div> : null}
        <div className="card">
          <div className="toolbar">
            <div className="tiles">
              {mayEdit ? <Link className="tile act" href="/finance/payroll/employees/new">+ เพิ่มพนักงาน</Link> : null}
            </div>
            <div className="spacer" />
            <Link className="btn" href={showAll ? '/finance/payroll/employees' : '/finance/payroll/employees?all=1'}>
              {showAll ? 'ซ่อนคนที่ปิดใช้งาน' : 'แสดงคนที่ปิดใช้งานด้วย'}
            </Link>
          </div>

          {employees.length === 0 ? (
            <div className="empty">ยังไม่มีพนักงาน — กด "+ เพิ่มพนักงาน" เพื่อเริ่ม</div>
          ) : (
            <div className="tablewrap">
              <table className="tbl hist">
                <thead>
                  <tr>
                    <th>รหัส</th><th>ชื่อ / ตำแหน่ง</th><th>ประเภท</th>
                    <th className="num">เงินเดือน</th><th>ประกันสังคม</th><th className="num">หัก ณ ที่จ่าย</th><th />
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.id} style={e.active ? undefined : { opacity: 0.55 }}>
                      <td className="mono docno">{e.code}</td>
                      <td className="wrap party">
                        <b>{e.name}</b>{e.active ? null : <span className="chip" style={{ marginLeft: 6 }}>ปิดใช้งาน</span>}
                        <div className="subtle" style={{ fontSize: '0.875rem' }}>{e.position || '-'}{e.tel ? ` · ${e.tel}` : ''}</div>
                      </td>
                      <td>{empTypeLabel(e.empType)}</td>
                      <td className="num mono"><b>{baht(e.baseSalary)}</b></td>
                      <td>{e.ssoEnabled ? 'หัก' : 'ไม่หัก'}</td>
                      <td className="num mono">{e.whtRate > 0 ? `${e.whtRate}%` : '-'}</td>
                      <td>
                        <span className="row-acts">
                          <Link className="btn sm act-edit" href={`/finance/payroll/employees/${e.id}`}>{mayEdit ? 'แก้ไข' : 'เปิด'}</Link>
                          {mayEdit ? <ToggleEmployee id={e.id} name={e.name} active={e.active} /> : null}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="hint" style={{ padding: '8px 12px' }}>
            พนักงานไม่ถูกลบ มีแต่ปิดใช้งาน — งวดเงินเดือนและเอกสารภาษีของปีก่อน ๆ ยังอ้างถึงอยู่ ·
            หน้านี้คือคนที่อู่จ่ายเงินเดือนให้ ส่วนบัญชีเข้าใช้ระบบอยู่ที่เมนูตั้งค่าพนักงาน
          </p>
        </div>
      </SubNav>
    </Shell>
  );
}
