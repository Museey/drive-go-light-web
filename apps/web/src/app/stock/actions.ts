'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  adjustStock, createCategory, deleteCategory, recordStockMove, renameCategory, saveProduct,
} from '@/lib/products';
import {
  createProductFromPending, ignorePendingItem, linkPendingToProduct, restoreIgnoredItems,
} from '@/lib/pending';
import { deletePic, savePic } from '@/lib/pics';
import {
  flag, friendlyDbError, keepValues, money, mutate, qty, str, type FormResult,
} from '@/lib/mutate';
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
      barcode: str(fd, 'barcode'),
      unit: str(fd, 'unit'),
      categoryId: str(fd, 'categoryId') || null,
      lastCost: money(fd, 'lastCost'),
      priceA: money(fd, 'priceA'),
      priceB: money(fd, 'priceB'),
      priceC: money(fd, 'priceC'),
      qtyMin: qty(fd, 'qtyMin'),
      qtyMax: qty(fd, 'qtyMax'),
      active: flag(fd, 'active'),
      /* ว่าง = ไม่มีวันหมดอายุ ไม่ใช่ 0 เดือน — 0 จะทำให้ของหมดอายุทันทีที่รับเข้า */
      shelfLifeMonths: Math.round(money(fd, 'shelfLifeMonths')) || null,
      openingQty: id ? undefined : qty(fd, 'openingQty'),
      openingExpiresOn: id ? undefined : (str(fd, 'openingExpiresOn') || null),
    });
  } catch (err) {
    return {
      error: friendlyDbError(err, {
        code: `รหัสสินค้า "${code}" มีอยู่แล้ว ใช้รหัสอื่น`,
        barcode: `บาร์โค้ด "${str(fd, 'barcode')}" ถูกใช้กับสินค้าตัวอื่นแล้ว`,
      }),
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
  const raw = str(fd, 'direction');
  const direction = raw === 'out' ? 'out' : raw === 'use' ? 'use' : 'in';
  if (!str(fd, 'qty')) return { error: 'ต้องกรอกจำนวน', field: 'qty' };

  const movedOn = str(fd, 'movedOn');
  if (!movedOn) return { error: 'ต้องกรอกวันที่', field: 'movedOn' };

  try {
    await recordStockMove({
      productId: id, direction, qty: qty(fd, 'qty'), movedOn, note: str(fd, 'note'),
      expiresOn: str(fd, 'expiresOn') || null,
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

/* ---------- รูปสินค้า ---------- */

/**
 * รับรูปที่เบราว์เซอร์ย่อมาแล้ว
 *
 * ฝั่งเซิร์ฟเวอร์ตรวจไบต์จริงซ้ำเสมอ ไม่เชื่ออะไรที่มาจากฝั่งผู้ใช้เลย —
 * ทั้ง `file.type` และการที่หน้าเว็บบอกว่าย่อมาแล้ว ผู้ส่งปลอมได้ทั้งคู่
 */
export async function savePicAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const productId = str(fd, 'productId');
  if (!productId) return { error: 'ไม่รู้ว่าเป็นรูปของสินค้าตัวไหน' };

  const full = fd.get('full');
  const thumb = fd.get('thumb');
  if (!(full instanceof File) || !(thumb instanceof File) || full.size === 0) {
    return { error: 'เลือกรูปก่อน — ถ้าเลือกแล้วยังขึ้นข้อความนี้ แปลว่าเบราว์เซอร์ย่อรูปไม่สำเร็จ' };
  }

  const fullBytes = new Uint8Array(await full.arrayBuffer());
  const thumbBytes = new Uint8Array(await thumb.arrayBuffer());

  try {
    const result = await mutate('stock', (c) => savePic(c, productId, fullBytes, thumbBytes),
      { sub: 'list' });
    if (!result.ok) return { error: result.error };
    revalidatePath('/stock');
    revalidatePath(`/stock/${productId}`);
    return { ok: true };
  } catch (err) {
    /* โควตาเต็มมาจาก trigger ในฐานข้อมูล ข้อความบอกตัวเลขจริงอยู่แล้ว */
    return { error: friendlyDbError(err) };
  }
}

export async function deletePicAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const productId = str(fd, 'productId');
  if (!productId) return { error: 'ไม่รู้ว่าเป็นรูปของสินค้าตัวไหน' };

  await mutate('stock', (c) => deletePic(c, productId), { sub: 'list' });
  revalidatePath('/stock');
  revalidatePath(`/stock/${productId}`);
  return { ok: true };
}
