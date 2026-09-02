'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePerm } from '@/lib/auth';
import { friendlyDbError, qty, str, type FormResult } from '@/lib/mutate';
import { mutate } from '@/lib/mutate';
import {
  addCountItems, applyCount, createCount, deleteCount, removeCountItem,
  saveCountHead, scanIntoCount, setCountedQty, type ScanResult,
} from '@/lib/stock-counts';
import { searchProducts } from '@/lib/sales';

function describe(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'code' in err) return friendlyDbError(err);
  return err instanceof Error ? err.message : fallback;
}

const paths = (id?: string) => {
  revalidatePath('/stock');
  revalidatePath('/stock/count');
  if (id) revalidatePath(`/stock/count/${id}`);
  revalidatePath('/finance/pl');
};

export async function createCountAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  await requirePerm('stock');
  const countDate = str(fd, 'countDate');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(countDate)) {
    return { error: 'วันที่ไม่ถูกต้อง', field: 'countDate' };
  }

  let made: { id: string };
  try {
    made = await mutate('stock', (c, userId) =>
      createCount(c, { countDate, note: str(fd, 'note') }, userId));
  } catch (err) {
    return { error: describe(err, 'เปิดใบตรวจนับไม่สำเร็จ') };
  }
  paths();
  redirect(`/stock/count/${made.id}`);
}

export async function saveCountHeadAction(
  id: string, countDate: string, note: string,
): Promise<FormResult> {
  await requirePerm('stock');
  try {
    await mutate('stock', (c) => saveCountHead(c, id, { countDate, note }));
  } catch (err) {
    return { error: describe(err, 'บันทึกไม่สำเร็จ') };
  }
  paths(id);
  return { ok: true };
}

export async function addCountItemsAction(id: string, productIds: string[]): Promise<FormResult> {
  await requirePerm('stock');
  try {
    await mutate('stock', (c) => addCountItems(c, id, productIds));
  } catch (err) {
    return { error: describe(err, 'ดึงสินค้าไม่สำเร็จ') };
  }
  paths(id);
  return { ok: true };
}

/** ยิงบาร์โค้ด — คืนผลดิบให้หน้าจอบอกผู้ใช้ว่าเกิดอะไรขึ้น */
export async function scanAction(
  id: string, term: string,
): Promise<{ result?: ScanResult; error?: string }> {
  await requirePerm('stock');
  try {
    const result = await mutate('stock', (c) => scanIntoCount(c, id, term));
    paths(id);
    return { result };
  } catch (err) {
    return { error: describe(err, 'ยิงบาร์โค้ดไม่สำเร็จ') };
  }
}

/** ค่าว่างแปลว่าล้างช่องกลับเป็น "ยังไม่ได้กรอก" ซึ่งไม่เหมือนกรอกศูนย์ */
export async function setCountedAction(itemId: string, raw: string): Promise<FormResult> {
  await requirePerm('stock');
  const text = raw.trim();
  const fd = new FormData();
  fd.set('q', text);
  const value = text === '' ? null : qty(fd, 'q');

  try {
    await mutate('stock', (c) => setCountedQty(c, itemId, value));
  } catch (err) {
    return { error: describe(err, 'บันทึกจำนวนไม่สำเร็จ') };
  }
  return { ok: true };
}

export async function removeCountItemAction(itemId: string, id: string): Promise<FormResult> {
  await requirePerm('stock');
  try {
    await mutate('stock', (c) => removeCountItem(c, itemId));
  } catch (err) {
    return { error: describe(err, 'เอารายการออกไม่สำเร็จ') };
  }
  paths(id);
  return { ok: true };
}

export async function applyCountAction(id: string): Promise<FormResult> {
  await requirePerm('stock');
  try {
    const r = await mutate('stock', (c, userId) => applyCount(c, id, userId));
    paths(id);
    return {
      ok: true,
      values: {
        note: `ปรับยอด ${r.adjusted} รายการตามใบตรวจนับ ${r.no} แล้ว`
          + ` · รับเข้าเพิ่ม ${r.up} รายการ · ตัดออก ${r.adjusted - r.up} รายการ`,
      },
    };
  } catch (err) {
    return { error: describe(err, 'ปรับยอดไม่สำเร็จ') };
  }
}

export async function deleteCountAction(id: string): Promise<FormResult> {
  await requirePerm('stock');
  try {
    await mutate('stock', (c) => deleteCount(c, id));
  } catch (err) {
    return { error: describe(err, 'ลบใบตรวจนับไม่สำเร็จ') };
  }
  paths();
  redirect('/stock/count');
}

export async function searchCountPartsAction(q: string) {
  await requirePerm('stock');
  return searchProducts(q, 25);
}
