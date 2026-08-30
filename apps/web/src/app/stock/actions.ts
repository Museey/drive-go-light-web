'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  adjustStock, createCategory, deleteCategory, renameCategory, saveProduct,
} from '@/lib/products';
import { flag, friendlyDbError, keepValues, money, qty, str, type FormResult } from '@/lib/mutate';

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
