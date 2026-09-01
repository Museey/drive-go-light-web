'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePerm } from '@/lib/auth';
import { mutate } from '@/lib/mutate';
import { saveBillnote, voidBillnote } from '@/lib/billnotes';
import { friendlyDbError, keepValues, str, type FormResult } from '@/lib/mutate';

function describe(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'code' in err) return friendlyDbError(err);
  return err instanceof Error ? err.message : fallback;
}

export async function saveBillnoteAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  await requirePerm('income');

  const id = str(fd, 'id') || undefined;
  const docIds = fd.getAll('doc').map(String);

  let saved: { id: string };
  try {
    saved = await mutate('income', (c, userId) => saveBillnote(c, {
      id,
      billDate: str(fd, 'billDate'),
      dueDate: str(fd, 'dueDate') || null,
      partyId: str(fd, 'partyId') || null,
      partyName: str(fd, 'partyName'),
      partyTaxId: str(fd, 'partyTaxId'),
      partyAddrText: str(fd, 'partyAddrText'),
      byWhom: str(fd, 'byWhom'),
      note: str(fd, 'note'),
      docIds,
    }, userId));
  } catch (err) {
    return { error: describe(err, 'บันทึกใบวางบิลไม่สำเร็จ'), values: keepValues(fd) };
  }

  revalidatePath('/income/billing');
  redirect(`/income/billing/${saved.id}?saved=1`);
}

export async function voidBillnoteAction(id: string, reason: string): Promise<FormResult> {
  await requirePerm('income');
  try {
    await mutate('income', (c) => voidBillnote(c, id, reason));
  } catch (err) {
    return { error: describe(err, 'ยกเลิกใบวางบิลไม่สำเร็จ') };
  }
  revalidatePath('/income/billing');
  revalidatePath(`/income/billing/${id}`);
  return { ok: true };
}
