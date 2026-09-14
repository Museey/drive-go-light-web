'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTab } from '@/lib/auth';
import { isUuid } from '@/lib/ids';
import { canCost } from '@/lib/perms';
import { friendlyDbError, keepValues, money, qty, str, type FormResult } from '@/lib/mutate';
import { kitProblem, type KitInput, type KitItemInput } from '@/lib/kit-calc';
import { deactivateKit, saveKit, searchKitParts } from '@/lib/kits';

function describe(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'code' in err) {
    /* รหัสชุดซ้ำ — ดัชนี unique (tenant_id, code) */
    if ((err as { code?: string }).code === '23505') return 'รหัสชุดนี้มีอยู่แล้ว — เปลี่ยนรหัสแล้วบันทึกอีกครั้ง';
    return friendlyDbError(err);
  }
  return err instanceof Error ? err.message : fallback;
}

/** บรรทัดส่งมาเป็นชุดช่อง it{n}_pid, it{n}_name … แบบเดียวกับใบเคลม */
function itemsOf(fd: FormData): KitItemInput[] {
  const items: KitItemInput[] = [];
  for (let i = 0; fd.has(`it${i}_name`); i++) {
    items.push({
      productId: str(fd, `it${i}_pid`) || null,
      name: str(fd, `it${i}_name`),
      unit: str(fd, `it${i}_unit`),
      qty: qty(fd, `it${i}_qty`),
      unitCost: money(fd, `it${i}_cost`),
    });
  }
  return items;
}

export async function saveKitAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  await requireTab('stock', 'kits');
  const id = str(fd, 'id');
  if (id && !isUuid(id)) return { error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง — ลองโหลดหน้าใหม่' };

  const input: KitInput = {
    id: id || null,
    code: str(fd, 'code'),
    name: str(fd, 'name'),
    price: money(fd, 'price'),
    priceB: money(fd, 'priceB'),
    priceC: money(fd, 'priceC'),
    note: str(fd, 'note'),
    items: itemsOf(fd),
  };
  const bad = kitProblem(input);
  if (bad) return { ...bad, values: keepValues(fd) };

  try {
    await saveKit(input);
  } catch (err) {
    return { error: describe(err, 'บันทึกชุดอะไหล่ไม่สำเร็จ'), values: keepValues(fd) };
  }
  revalidatePath('/stock/kits');
  redirect(`/stock/kits?saved=${encodeURIComponent(input.code)}`);
}

export async function deactivateKitAction(id: string): Promise<FormResult> {
  await requireTab('stock', 'kits');
  if (!isUuid(id)) return { error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง — ลองโหลดหน้าใหม่' };
  try {
    await deactivateKit(id);
  } catch (err) {
    return { error: describe(err, 'ปิดใช้งานไม่สำเร็จ') };
  }
  revalidatePath('/stock/kits');
  return { ok: true };
}

export async function searchKitPartsAction(q: string) {
  const session = await requireTab('stock', 'kits');
  return searchKitParts(q, canCost(session));
}
