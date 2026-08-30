'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  saveSalesDoc, searchCustomers, searchProducts, voidSalesDoc,
  type PickedContact, type PickedProduct, type SalesDocInput,
} from '@/lib/sales';
import { friendlyDbError, type FormResult } from '@/lib/mutate';

/**
 * ฟอร์มออกเอกสารเก็บสถานะไว้ฝั่งเบราว์เซอร์ทั้งก้อนแล้วส่งมาเป็น JSON ชุดเดียว
 * ต่างจากฟอร์มอื่นที่ส่งทีละช่อง เพราะตารางรายการเพิ่มลดแถวได้
 * ผลพลอยได้คือบันทึกไม่ผ่านแล้วไม่มีอะไรหาย ของยังอยู่ในหน้าจอครบ
 */
export async function saveDocAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  let input: SalesDocInput;
  try {
    input = JSON.parse(String(fd.get('payload') ?? ''));
  } catch {
    return { error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง ลองโหลดหน้าใหม่อีกครั้ง' };
  }

  if (!input.partyName?.trim()) {
    return { error: 'ต้องระบุชื่อลูกค้า — เลือกจากทะเบียนหรือพิมพ์เอง', field: 'party' };
  }
  if (!input.items?.length) {
    return { error: 'ต้องมีรายการอย่างน้อยหนึ่งบรรทัด', field: 'items' };
  }
  if (input.items.some((i) => !i.name?.trim())) {
    return { error: 'ทุกบรรทัดต้องมีชื่อรายการ', field: 'items' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.docDate ?? '')) {
    return { error: 'วันที่เอกสารไม่ถูกต้อง', field: 'docDate' };
  }
  if (input.kind === 'IVT' && !input.partyTaxId?.replace(/\D/g, '')) {
    return {
      error: 'ใบกำกับภาษีต้องมีเลขประจำตัวผู้เสียภาษีของลูกค้า — ' +
             'ถ้ายังไม่ทราบให้ออกเป็นใบส่งมอบ (ไม่มี VAT) ก่อน',
      field: 'party',
    };
  }

  let saved: { id: string; docNo: string };
  try {
    saved = await saveSalesDoc(input);
  } catch (err) {
    return { error: describe(err, 'บันทึกไม่สำเร็จ') };
  }

  revalidatePath('/income');
  revalidatePath('/stock');
  redirect(`/income/${saved.id}?saved=${encodeURIComponent(saved.docNo)}`);
}

export async function voidDocAction(id: string, reason: string): Promise<void> {
  try {
    await voidSalesDoc(id, reason);
  } catch (err) {
    redirect(`/income/${id}?error=${encodeURIComponent(describe(err, 'ยกเลิกไม่สำเร็จ'))}`);
  }
  revalidatePath('/income');
  revalidatePath('/stock');
  redirect(`/income/${id}`);
}

/**
 * ข้อความบอกผู้ใช้ — กฎธุรกิจที่เราโยนเองอ่านรู้เรื่องอยู่แล้ว
 * ส่วน error จาก Postgres (มี code) ต้องแปลงก่อน ไม่งั้นผู้ใช้เจอชื่อ constraint ดิบ ๆ
 */
function describe(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'code' in err) return friendlyDbError(err);
  return err instanceof Error ? err.message : fallback;
}

export async function searchProductsAction(q: string): Promise<PickedProduct[]> {
  return searchProducts(q);
}

export async function searchCustomersAction(q: string): Promise<PickedContact[]> {
  return searchCustomers(q);
}
