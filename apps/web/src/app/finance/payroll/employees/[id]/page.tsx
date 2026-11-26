import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTab } from '@/lib/auth';
import { isUuid } from '@/lib/ids';
import { canEdit } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { PlusUpsell } from '@/components/plus-upsell';
import { todayIso } from '@/lib/license-window';
import { getEmployee, nextEmployeeCode } from '@/lib/payroll';
import { getPlus } from '@/lib/plan';
import { PAYROLL_POINTS } from '../../points';
import { EmployeeForm } from './employee-form';

export const dynamic = 'force-dynamic';

/** 06.6 เพิ่ม / แก้ไขพนักงาน — id = 'new' คือเพิ่มใหม่ */
export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireTab('finance', 'payroll');
  const { id } = await params;
  const isNew = id === 'new';
  if (!isNew && !isUuid(id)) notFound();

  if (!(await getPlus())) {
    return (
      <Shell current="/finance" title="ทะเบียนพนักงาน" sub="ฟีเจอร์ของ DriveGo Light Plus">
        <SubNav menu="finance" current="employees">
          <PlusUpsell feature="เงินเดือนและพนักงาน" points={PAYROLL_POINTS} />
        </SubNav>
      </Shell>
    );
  }

  const employee = isNew ? null : await getEmployee(id);
  if (!isNew && !employee) notFound();
  const code = isNew ? await nextEmployeeCode() : employee!.code;
  const mayEdit = canEdit(session, 'finance', 'payroll');
  /* ปีภาษีล่าสุดที่ออก 50 ทวิ ได้ — ต้นปีพนักงานมาขอของปีที่แล้ว จึงให้เลือกสองปี */
  const year = Number(todayIso().slice(0, 4));

  return (
    <Shell current="/finance" title={isNew ? 'เพิ่มพนักงาน' : employee!.name}
           sub={isNew ? undefined : `${employee!.code}${employee!.active ? '' : ' · ปิดใช้งาน'}`}>
      <SubNav menu="finance" current="employees">
        <Link className="mback" href="/finance/payroll/employees">← กลับทะเบียนพนักงาน</Link>
        <EmployeeForm employee={employee} code={code} mayEdit={mayEdit} />
        {employee ? (
          <div className="card">
            <header><h2>หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)</h2></header>
            <div className="body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {[year, year - 1].map((y) => (
                <Link key={y} className="btn" href={`/finance/tax/cert?employee=${employee.id}&year=${y}`}>
                  ปีภาษี {y + 543}
                </Link>
              ))}
              <span className="subtle">รวมทุกงวดเงินเดือนของปีนั้น</span>
            </div>
          </div>
        ) : null}
      </SubNav>
    </Shell>
  );
}
