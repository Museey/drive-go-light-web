'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { saveBuyDoc, searchVendors, voidBuyDoc, type BuyDocInput, type PickedVendor } from '@/lib/purchases';
import { friendlyDbError, type FormResult } from '@/lib/mutate';

function describe(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'code' in err) return friendlyDbError(err);
  return err instanceof Error ? err.message : fallback;
}

export async function saveBuyDocAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  let input: BuyDocInput;
  try {
    input = JSON.parse(String(fd.get('payload') ?? ''));
  } catch {
    return { error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง ลองโหลดหน้าใหม่อีกครั้ง' };
  }

  if (!input.partyName?.trim()) {
    return {
      error: input.kind === 'PO' ? 'ต้องระบุชื่อผู้ขาย' : 'ต้องระบุชื่อผู้รับเงิน',
      field: 'party',
    };
  }
  if (!input.items?.length) return { error: 'ต้องมีรายการอย่างน้อยหนึ่งบรรทัด', field: 'items' };
  if (input.items.some((i) => !i.name?.trim())) {
    return { error: 'ทุกบรรทัดต้องมีชื่อรายการ', field: 'items' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.docDate ?? '')) {
    return { error: 'วันที่ไม่ถูกต้อง', field: 'docDate' };
  }
  if (input.kind === 'EX' && !input.expenseCat) {
    return { error: 'ต้องเลือกหมวดค่าใช้จ่าย', field: 'cat' };
  }

  let saved: { id: string; docNo: string };
  try {
    saved = await saveBuyDoc(input);
  } catch (err) {
    return { error: describe(err, 'บันทึกไม่สำเร็จ') };
  }

  revalidatePath('/expense');
  revalidatePath('/stock');
  revalidatePath('/finance/ap');
  redirect(`/expense/${saved.id}?saved=${encodeURIComponent(saved.docNo)}`);
}

export async function voidBuyDocAction(id: string, reason: string): Promise<void> {
  try {
    await voidBuyDoc(id, reason);
  } catch (err) {
    redirect(`/expense/${id}?error=${encodeURIComponent(describe(err, 'ยกเลิกไม่สำเร็จ'))}`);
  }
  revalidatePath('/expense');
  revalidatePath('/stock');
  revalidatePath('/finance/ap');
  redirect(`/expense/${id}`);
}

export async function searchVendorsAction(q: string): Promise<PickedVendor[]> {
  return searchVendors(q);
}
