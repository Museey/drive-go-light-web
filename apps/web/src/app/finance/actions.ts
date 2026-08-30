'use server';

import { revalidatePath } from 'next/cache';
import { deletePayment, recordPayment } from '@/lib/receivables';
import { friendlyDbError, money, str, type FormResult } from '@/lib/mutate';

function describe(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'code' in err) return friendlyDbError(err);
  return err instanceof Error ? err.message : fallback;
}

export async function recordPaymentAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const docId = str(fd, 'docId');
  const amount = money(fd, 'amount');
  const paidOn = str(fd, 'paidOn');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { error: 'วันที่รับชำระไม่ถูกต้อง', field: 'paidOn' };
  if (amount <= 0) return { error: 'ต้องกรอกจำนวนเงินที่รับ', field: 'amount' };

  try {
    await recordPayment({
      docId, paidOn, amount,
      method: str(fd, 'method') || 'เงินสด',
      ref: str(fd, 'ref'),
    });
  } catch (err) {
    return { error: describe(err, 'บันทึกการรับชำระไม่สำเร็จ'), field: 'amount' };
  }

  revalidatePath('/finance/ar');
  revalidatePath(`/income/${docId}`);
  revalidatePath('/');
  return { ok: true };
}

export async function deletePaymentAction(paymentId: string, docId: string): Promise<FormResult> {
  try {
    await deletePayment(paymentId);
  } catch (err) {
    return { error: describe(err, 'ลบไม่สำเร็จ') };
  }
  revalidatePath('/finance/ar');
  revalidatePath(`/income/${docId}`);
  revalidatePath('/');
  return { ok: true };
}
