'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  adjustStock, createCategory, deleteCategory, recordStockMove, renameCategory, saveProduct,
} from '@/lib/products';
import {
  createProductFromPending, ignorePendingItem, linkPendingToProduct, restoreIgnoredItems,
} from '@/lib/pending';
import { flag, friendlyDbError, keepValues, money, qty, str, type FormResult } from '@/lib/mutate';
import { setStockHiddenCols, STOCK_COLS } from '@/lib/ui-prefs';

export async function saveProductAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const id = str(fd, 'id') || undefined;

  const kept = keepValues(fd);

  const code = str(fd, 'code');
  if (!code) return { error: 'ต้องกรอกรหัสสินค้า', field: 'code', values: kept };

  const name = str(fd, 'name');
  if (!name) return { error: 'ต้องกรอกชื่อสินค้า', field: 'name', values: kept };

  let savedId: string;
  try {
    savedId = await saveProduct({
      id,
      code,
      name,
      oem: str(fd, 'oem'),
      unit: str(fd, 'unit'),
      categoryId: str(fd, 'categoryId') || null,
      lastCost: money(fd, 'lastCost'),
      priceA: money(fd, 'priceA'),
      priceB: money(fd, 'priceB'),
      priceC: money(fd, 'priceC'),
      qtyMin: qty(fd, 'qtyMin'),
      qtyMax: qty(fd, 'qtyMax'),
      active: flag(fd, 'active'),
      openingQty: id ? undefined : qty(fd, 'openingQty'),
    });
  } catch (err) {
    return {
      error: friendlyDbError(err, { code: `รหัสสินค้า "${code}" มีอยู่แล้ว ใช้รหัสอื่น` }),
      field: 'code',
      values: kept,
    };
  }

  revalidatePath('/stock');
  redirect(`/stock/${savedId}?saved=1`);
}

export async function adjustStockAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const id = str(fd, 'productId');
  const counted = qty(fd, 'countedQty');
  if (!str(fd, 'countedQty')) return { error: 'ต้องกรอกจำนวนที่นับได้' };

  try {
    await adjustStock(id, counted, str(fd, 'note'));
  } catch (err) {
    return { error: friendlyDbError(err) };
  }

  revalidatePath(`/stock/${id}`);
  revalidatePath('/stock');
  return { ok: true };
}

export async function stockMoveAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const id = str(fd, 'productId');
  const direction = str(fd, 'direction') === 'out' ? 'out' : 'in';
  if (!str(fd, 'qty')) return { error: 'ต้องกรอกจำนวน', field: 'qty' };

  const movedOn = str(fd, 'movedOn');
  if (!movedOn) return { error: 'ต้องกรอกวันที่', field: 'movedOn' };

  try {
    await recordStockMove({
      productId: id, direction, qty: qty(fd, 'qty'), movedOn, note: str(fd, 'note'),
    });
  } catch (err) {
    return { error: friendlyDbError(err), values: keepValues(fd) };
  }

  revalidatePath(`/stock/${id}`);
  revalidatePath('/stock');
  return { ok: true, values: { direction } };
}

/** เปิด–ปิดคอลัมน์ในตารางสินค้า จำไว้ให้ทั้งอู่ */
export async function saveStockColsAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const shown = fd.getAll('col').map(String);
  const hidden = STOCK_COLS.map(([k]) => k).filter((k) => !shown.includes(k));

  try {
    await setStockHiddenCols(hidden);
  } catch (err) {
    return { error: friendlyDbError(err) };
  }

  revalidatePath('/stock');
  return { ok: true };
}

export async function createCategoryAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const name = str(fd, 'name');
  if (!name) return { error: 'ต้องกรอกชื่อหมวดหมู่' };
  try {
    await createCategory(name);
  } catch (err) {
    return { error: friendlyDbError(err, {}) };
  }
  revalidatePath('/stock');
  return { ok: true };
}

export async function renameCategoryAction(id: string, name: string): Promise<void> {
  await renameCategory(id, name);
  revalidatePath('/stock');
}

export async function deleteCategoryAction(id: string): Promise<void> {
  await deleteCategory(id);
  revalidatePath('/stock');
}

/* ---------- รายการค้างทำ ---------- */

export async function linkPendingAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const nameNorm = str(fd, 'nameNorm');
  const productId = str(fd, 'productId');
  if (!productId) return { error: 'ต้องเลือกสินค้าที่จะผูกด้วย' };

  try {
    const linked = await linkPendingToProduct(nameNorm, productId);
    revalidatePath('/stock/pending');
    return { ok: true, error: undefined, values: { linked: String(linked) } };
  } catch (err) {
    return { error: friendlyDbError(err) };
  }
}

export async function ignorePendingAction(nameNorm: string): Promise<void> {
  await ignorePendingItem(nameNorm);
  revalidatePath('/stock/pending');
}

export async function restoreIgnoredAction(): Promise<void> {
  await restoreIgnoredItems();
  revalidatePath('/stock/pending');
}

export async function createFromPendingAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const nameNorm = str(fd, 'nameNorm');
  const code = str(fd, 'code');
  if (!code) return { error: 'ต้องกรอกรหัสสินค้า', field: 'code' };

  try {
    await createProductFromPending(
      nameNorm, code, str(fd, 'name'), str(fd, 'unit'), money(fd, 'cost'), money(fd, 'priceA'),
    );
  } catch (err) {
    return { error: friendlyDbError(err, { code: `รหัสสินค้า "${code}" มีอยู่แล้ว` }), field: 'code' };
  }

  revalidatePath('/stock/pending');
  revalidatePath('/stock');
  return { ok: true };
}
