'use server';

import { revalidatePath } from 'next/cache';
import { requirePerm } from '@/lib/auth';
import { isUuid } from '@/lib/ids';
import { friendlyDbError } from '@/lib/mutate';
import { purgeFromTrash, restoreFromTrash } from '@/lib/trash';

type Source = 'doc' | 'billnote';
export type TrashActionResult = { error?: string };

const isSource = (v: unknown): v is Source => v === 'doc' || v === 'billnote';

function describe(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'code' in err) return friendlyDbError(err);
  return err instanceof Error ? err.message : fallback;
}

/* เอกสารที่กู้คืนหรือลบถาวรโผล่/หายจากหลายหน้า รวมยอดหน้าแรกและรายงาน */
function refresh() {
  for (const path of ['/settings/trash', '/', '/income', '/income/walkin', '/income/billing',
    '/expense', '/stock', '/finance', '/finance/ar', '/finance/ap', '/finance/sales']) {
    revalidatePath(path);
  }
}

export async function restoreTrashAction(source: Source, id: string): Promise<TrashActionResult> {
  await requirePerm('settings');
  if (!isSource(source) || !isUuid(id)) return { error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง — ลองโหลดหน้าใหม่' };
  try {
    await restoreFromTrash(source, id);
  } catch (err) {
    return { error: describe(err, 'กู้คืนไม่สำเร็จ') };
  }
  refresh();
  return {};
}

/**
 * ลบถาวร — เฉพาะเจ้าของกิจการ + รหัสผ่านของตัวเอง (ชุดแก้ 14 ก.ย. 2569 22:37)
 *
 * แผงยืนยันคือชั้นแรก รหัสผ่านคือชั้นที่สอง ตรวจที่ lib/trash.ts ในทรานแซกชันเดียวกับที่ลบ
 * ปุ่มที่ถูกเรียกตรง ๆ โดยไม่มีรหัสผ่านจะไม่ลบอะไร
 */
export async function purgeTrashAction(
  source: Source, id: string, password: string,
): Promise<TrashActionResult> {
  await requirePerm('settings');
  if (typeof password !== 'string' || !password) return { error: 'ใส่รหัสผ่านของเจ้าของกิจการก่อนลบถาวร' };
  if (!isSource(source) || !isUuid(id)) return { error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง — ลองโหลดหน้าใหม่' };
  try {
    await purgeFromTrash(source, id, password);
  } catch (err) {
    return { error: describe(err, 'ลบถาวรไม่สำเร็จ') };
  }
  refresh();
  return {};
}
