import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTab } from '@/lib/auth';
import { isUuid } from '@/lib/ids';
import { canEdit } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { PlusUpsell } from '@/components/plus-upsell';
import { appointmentPrefill, getAppointment, type Appointment } from '@/lib/appointments';
import { todayIso } from '@/lib/license-window';
import { getPlus } from '@/lib/plan';
import { APPT_POINTS } from '../points';
import { ApptForm } from './appt-form';

export const dynamic = 'force-dynamic';

/**
 * 02.5 เพิ่ม / แก้ไขนัด — id = 'new' คือเพิ่มใหม่
 * ?contact= / ?vehicle= เติมชื่อ เบอร์ ทะเบียนจากทะเบียนลูกค้าให้ (ปุ่ม "+ นัดหมาย" ในหน้าลูกค้า)
 */
export default async function AppointmentPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string; contact?: string; vehicle?: string }>;
}) {
  const session = await requireTab('customer', 'appt');
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === 'new';
  if (!isNew && !isUuid(id)) notFound();

  if (!(await getPlus())) {
    return (
      <Shell current="/customers" title="นัดหมาย / แจ้งเตือนลูกค้า" sub="ฟีเจอร์ของ DriveGo Light Plus">
        <SubNav menu="customer" current="appt">
          <PlusUpsell feature="นัดหมายและแจ้งเตือนลูกค้า" points={APPT_POINTS} />
        </SubNav>
      </Shell>
    );
  }

  let initial: Omit<Appointment, 'id' | 'status' | 'notifiedAt'> & { id: string | null };
  if (isNew) {
    const pre = await appointmentPrefill({
      contactId: sp.contact && isUuid(sp.contact) ? sp.contact : null,
      vehicleId: sp.vehicle && isUuid(sp.vehicle) ? sp.vehicle : null,
    });
    initial = {
      id: null, kind: sp.kind === 'remind' ? 'remind' : 'repair', date: todayIso(), time: '',
      title: '', note: '', ...pre,
    };
  } else {
    const found = await getAppointment(id);
    if (!found) notFound();
    initial = found;
  }

  return (
    <Shell current="/customers" title={isNew ? 'เพิ่มนัด' : 'แก้ไขนัด'}>
      <SubNav menu="customer" current="appt">
        <Link className="mback" href="/customers/appointments">← กลับรายการนัด</Link>
        <ApptForm initial={initial} mayEdit={canEdit(session, 'customer', 'appt')} />
      </SubNav>
    </Shell>
  );
}
