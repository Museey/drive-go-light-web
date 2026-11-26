'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTab } from '@/lib/auth';
import { isUuid } from '@/lib/ids';
import { friendlyDbError, keepValues, str, type FormResult } from '@/lib/mutate';
import {
  appointmentProblem, deleteAppointment, saveAppointment, setAppointmentNotified, setAppointmentStatus,
  type AppointmentInput, type ApptKind, type ApptStatus,
} from '@/lib/appointments';

/**
 * action ของนัดหมายและแจ้งเตือนลูกค้า (02.5)
 * ตรวจสิทธิ์แท็บเองทุกตัว — แพ็กเกจ Plus และสิทธิ์แก้ไขตรวจซ้ำในตัวบันทึก (appointments.ts)
 */

const BAD = 'ข้อมูลที่ส่งมาไม่ถูกต้อง — ลองโหลดหน้าใหม่';
const LIST = '/customers/appointments';

function describe(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'code' in err) return friendlyDbError(err);
  return err instanceof Error ? err.message : fallback;
}

const uuidOrNull = (v: string): string | null => (isUuid(v) ? v : null);

export async function saveAppointmentAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  await requireTab('customer', 'appt');
  const id = str(fd, 'id');
  if (id && !isUuid(id)) return { error: BAD };

  const input: AppointmentInput = {
    id: id || null,
    kind: (str(fd, 'kind') === 'remind' ? 'remind' : 'repair') as ApptKind,
    date: str(fd, 'date'),
    time: str(fd, 'time'),
    contactId: uuidOrNull(str(fd, 'contactId')),
    vehicleId: uuidOrNull(str(fd, 'vehicleId')),
    partyName: str(fd, 'partyName'),
    tel: str(fd, 'tel'),
    plate: str(fd, 'plate'),
    title: str(fd, 'title'),
    note: str(fd, 'note'),
  };
  const bad = appointmentProblem(input);
  if (bad) return { ...bad, values: keepValues(fd) };

  try {
    await saveAppointment(input);
  } catch (err) {
    return { error: describe(err, 'บันทึกนัดไม่สำเร็จ'), values: keepValues(fd) };
  }
  revalidatePath(LIST);
  redirect(`${LIST}?saved=1`);
}

export async function setStatusAction(id: string, status: ApptStatus): Promise<FormResult> {
  await requireTab('customer', 'appt');
  if (!isUuid(id) || !['open', 'done', 'cancelled'].includes(status)) return { error: BAD };
  try {
    await setAppointmentStatus(id, status);
  } catch (err) {
    return { error: describe(err, 'บันทึกไม่สำเร็จ') };
  }
  revalidatePath(LIST);
  return { ok: true };
}

export async function setNotifiedAction(id: string, notified: boolean): Promise<FormResult> {
  await requireTab('customer', 'appt');
  if (!isUuid(id)) return { error: BAD };
  try {
    await setAppointmentNotified(id, notified);
  } catch (err) {
    return { error: describe(err, 'บันทึกไม่สำเร็จ') };
  }
  revalidatePath(LIST);
  return { ok: true };
}

export async function deleteAppointmentAction(id: string): Promise<FormResult> {
  await requireTab('customer', 'appt');
  if (!isUuid(id)) return { error: BAD };
  try {
    await deleteAppointment(id);
  } catch (err) {
    return { error: describe(err, 'ลบนัดไม่สำเร็จ') };
  }
  revalidatePath(LIST);
  return { ok: true };
}
