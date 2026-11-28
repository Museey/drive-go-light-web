import 'server-only';
import { query } from './auth';
import { todayIso } from './license-window';
import { mutate } from './mutate';
import { assertPlusWith } from './plan-core';
import {
  appointmentCountsWith, appointmentPrefillWith, deleteAppointmentWith, getAppointmentWith,
  listAppointmentsWith, saveAppointmentWith, setAppointmentNotifiedWith, setAppointmentStatusWith,
  type Appointment, type AppointmentInput, type ApptStatus, type ApptView,
} from './appointments-core';

export * from './appointments-core';

/**
 * นัดหมายและแจ้งเตือนลูกค้า (02.5) — ผูกกับ session
 * สิทธิ์ผูกกับแท็บ customer.appt · ทุกตัวตรวจแพ็กเกจ Plus ในทรานแซกชันเดียวกับงานจริง
 */

const SUB = { sub: 'appt' } as const;

export async function listAppointments(view: ApptView, q?: string): Promise<{
  rows: Appointment[]; counts: { today: number; overdue: number; upcoming: number }; today: string;
}> {
  const today = todayIso();
  return query(async (c) => {
    await assertPlusWith(c);
    return {
      rows: await listAppointmentsWith(c, { view, today, q }),
      counts: await appointmentCountsWith(c, today),
      today,
    };
  });
}

export async function getAppointment(id: string): Promise<Appointment | null> {
  return query(async (c) => { await assertPlusWith(c); return getAppointmentWith(c, id); });
}

export async function appointmentPrefill(ids: { contactId?: string | null; vehicleId?: string | null }) {
  return query((c) => appointmentPrefillWith(c, ids));
}

export async function saveAppointment(a: AppointmentInput): Promise<{ id: string }> {
  return mutate('customer', async (c, userId) => {
    await assertPlusWith(c);
    return saveAppointmentWith(c, a, userId);
  }, SUB);
}

export async function setAppointmentStatus(id: string, status: ApptStatus): Promise<void> {
  return mutate('customer', async (c) => { await assertPlusWith(c); await setAppointmentStatusWith(c, id, status); }, SUB);
}

export async function setAppointmentNotified(id: string, notified: boolean): Promise<void> {
  return mutate('customer', async (c) => { await assertPlusWith(c); await setAppointmentNotifiedWith(c, id, notified); }, SUB);
}

export async function deleteAppointment(id: string): Promise<void> {
  return mutate('customer', async (c) => { await assertPlusWith(c); await deleteAppointmentWith(c, id); }, SUB);
}
