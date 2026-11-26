import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTab } from '@/lib/auth';
import { isUuid } from '@/lib/ids';
import { canEdit } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { PlusUpsell } from '@/components/plus-upsell';
import { monthLabel } from '@/lib/format';
import { getRun } from '@/lib/payroll';
import { getPlus } from '@/lib/plan';
import { PAYROLL_POINTS } from '../points';
import { RunEditor } from './run-editor';

export const dynamic = 'force-dynamic';

/** 06.5 งวดเงินเดือนหนึ่งงวด — แก้ตัวเลขรายคน บันทึก แล้วพิมพ์สลิป */
export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireTab('finance', 'payroll');
  const { id } = await params;
  if (!isUuid(id)) notFound();

  if (!(await getPlus())) {
    return (
      <Shell current="/finance" title="เงินเดือนพนักงาน" sub="ฟีเจอร์ของ DriveGo Light Plus">
        <SubNav menu="finance" current="payroll">
          <PlusUpsell feature="เงินเดือนและพนักงาน" points={PAYROLL_POINTS} />
        </SubNav>
      </Shell>
    );
  }

  const run = await getRun(id);
  if (!run) notFound();
  const mayEdit = canEdit(session, 'finance', 'payroll');

  return (
    <Shell current="/finance" title={`เงินเดือนงวด ${monthLabel(run.period)}`}
           sub={`${run.items.length.toLocaleString('en-US')} คน`}
           tools={<Link className="btn" href={`/finance/payroll/${run.id}/print`}>🖨 พิมพ์สลิป</Link>}>
      <SubNav menu="finance" current="payroll">
        <Link className="mback" href="/finance/payroll">← กลับรายการงวด</Link>
        <RunEditor key={`${run.id}:${run.items.length}`} run={run} mayEdit={mayEdit} />
      </SubNav>
    </Shell>
  );
}
