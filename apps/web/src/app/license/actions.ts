'use server';

import { revalidatePath } from 'next/cache';
import { requirePerm } from '@/lib/auth';
import { cancelRenewalRequest, requestRenewal } from '@/lib/subscription';
import { isUuid } from '@/lib/ids';
import { deleteTenantData } from '@/lib/danger';
import { friendlyDbError, money, str, type FormResult } from '@/lib/mutate';

function describe(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'code' in err) return friendlyDbError(err);
  return err instanceof Error ? err.message : fallback;
}

/**
 * แจ้งชำระเงินเพื่อขอต่ออายุ — ส่งคำขอให้ผู้ให้บริการตรวจยอดโอน ยังไม่ต่ออายุเอง
 * (ดู requestRenewal ใน lib/subscription.ts)
 */
export async function requestRenewalAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  await requirePerm('settings');

  const years = Number(str(fd, 'years')) || 0;
  if (!Number.isInteger(years) || years <= 0 || years > 10) {
    return { error: 'จำนวนปีต้องอยู่ระหว่าง 1 ถึง 10', field: 'years' };
  }

  const amount = money(fd, 'amount');
  if (!(amount > 0)) return { error: 'ต้องกรอกยอดเงินที่โอน', field: 'amount' };

  const paidOn = str(fd, 'paidOn');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
    return { error: 'ต้องระบุวันที่โอนเงิน', field: 'paidOn' };
  }

  const note = str(fd, 'note').slice(0, 300);
  if (!note) {
    return { error: 'ต้องกรอกอ้างอิงการโอน เช่น เวลาโอนและธนาคารต้นทาง เพื่อให้ตรวจยอดได้', field: 'note' };
  }

  try {
    await requestRenewal({ years, amount, paidOn, note });
  } catch (err) {
    return { error: describe(err, 'ส่งคำขอต่ออายุไม่สำเร็จ') };
  }
  revalidatePath('/license');
  return { ok: true };
}

export async function cancelRenewalRequestAction(id: string): Promise<FormResult> {
  await requirePerm('settings');
  if (!isUuid(id)) return { error: 'ไม่พบคำขอ' };
  try {
    await cancelRenewalRequest(id);
  } catch (err) {
    return { error: describe(err, 'ยกเลิกคำขอไม่สำเร็จ') };
  }
  revalidatePath('/license');
  return { ok: true };
}

/**
 * ลบข้อมูลของอู่ทั้งหมด — ทำตามคำขอของเจ้าของข้อมูลตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล
 * ต้องพิมพ์ชื่ออู่ให้ตรงเป๊ะก่อน กันกดพลาด
 */
export async function deleteTenantAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  await requirePerm('settings');

  const confirmName = str(fd, 'confirmName');
  const understood = fd.get('understood') === 'on';

  if (!understood) return { error: 'ต้องติ๊กยืนยันว่าเข้าใจว่าการลบนี้ย้อนกลับไม่ได้' };

  /* รหัสผ่านไม่ผ่าน str() เพราะ str() ตัดช่องว่างหัวท้าย · ห้ามส่งค่ากลับไปกับผลลัพธ์ */
  const password = String(fd.get('password') ?? '');
  if (!password) return { error: 'ต้องใส่รหัสผ่านของเจ้าของกิจการเพื่อยืนยันการลบ', field: 'password' };

  try {
    await deleteTenantData(confirmName, password);
  } catch (err) {
    const msg = describe(err, 'ลบข้อมูลไม่สำเร็จ');
    return { error: msg, field: msg.includes('รหัสผ่าน') ? 'password' : 'confirmName' };
  }

  return { ok: true };
}
