'use server';

import { revalidatePath } from 'next/cache';
import { requirePerm } from '@/lib/auth';
import { recordRenewal } from '@/lib/subscription';
import { deleteTenantData } from '@/lib/danger';
import { friendlyDbError, money, str, type FormResult } from '@/lib/mutate';

function describe(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'code' in err) return friendlyDbError(err);
  return err instanceof Error ? err.message : fallback;
}

export async function recordRenewalAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  await requirePerm('settings');

  const years = Number(str(fd, 'years')) || 0;
  if (years <= 0 || years > 10) return { error: 'จำนวนปีต้องอยู่ระหว่าง 1 ถึง 10', field: 'years' };

  const amountText = str(fd, 'amount');
  try {
    const r = await recordRenewal({
      years,
      amount: amountText ? money(fd, 'amount') : null,
      note: str(fd, 'note'),
    });
    revalidatePath('/license');
    return { ok: true, values: { expiresOn: r.expiresOn } };
  } catch (err) {
    return { error: describe(err, 'บันทึกการต่ออายุไม่สำเร็จ') };
  }
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

  try {
    await deleteTenantData(confirmName);
  } catch (err) {
    return { error: describe(err, 'ลบข้อมูลไม่สำเร็จ'), field: 'confirmName' };
  }

  return { ok: true };
}
