'use server';

import { revalidatePath } from 'next/cache';
import { deletePayment, recordBulkPayments, recordPayment } from '@/lib/receivables';
import { friendlyDbError, money, str, type FormResult } from '@/lib/mutate';
import { baht } from '@/lib/format';

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

/**
 * ตัดชำระหลายใบพร้อมกัน
 *
 * ฟอร์มส่งจำนวนเงินมาเป็นช่อง `amt:<docId>` ใบละช่อง — ใบที่ไม่ได้ติ๊กไม่มีช่องส่งมา
 * จึงไม่ต้องมีรายการ "ใบที่เลือก" แยกอีกชุดให้หลุดกันเอง
 */
export async function recordBulkPaymentsAction(
  _prev: FormResult,
  fd: FormData,
): Promise<FormResult> {
  const paidOn = str(fd, 'paidOn');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
    return { error: 'วันที่รับชำระไม่ถูกต้อง', field: 'paidOn' };
  }

  const lines: { docId: string; amount: number }[] = [];
  for (const key of fd.keys()) {
    if (!key.startsWith('amt:')) continue;
    lines.push({ docId: key.slice(4), amount: money(fd, key) });
  }
  if (lines.length === 0) return { error: 'ยังไม่ได้เลือกใบที่จะตัดชำระ' };

  let result;
  try {
    result = await recordBulkPayments({
      lines, paidOn,
      method: str(fd, 'method') || 'เงินสด',
      ref: str(fd, 'ref'),
    });
  } catch (err) {
    return { error: describe(err, 'บันทึกการรับชำระไม่สำเร็จ') };
  }

  revalidatePath('/finance/ar');
  revalidatePath('/finance/ap');
  revalidatePath('/income/billing');
  revalidatePath('/');

  /* บอกผลเป็นข้อความเดียว รวมใบที่ถูกปรับยอดลง ไม่ให้การปรับเงียบหาย */
  let note = `บันทึกแล้ว ${result.count} ใบ รวม ${baht(result.total)} บาท`;
  if (result.trimmed.length > 0) {
    note += ' — ปรับยอดลงให้พอดียอดค้าง: '
      + result.trimmed.map((t) => `${t.docNo} ${baht(t.asked)} → ${baht(t.used)}`).join(', ');
  }
  return { ok: true, values: { note } };
}
