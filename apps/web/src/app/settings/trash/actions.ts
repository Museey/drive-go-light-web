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
 * ลบถาวร — ยืนยันสองชั้นตามที่เจ้าของกิจการเลือก (14 ก.ย. 2569)
 *
 * ชั้นที่หนึ่งคือแผงยืนยัน ชั้นที่สองคือช่อง "เข้าใจแล้วว่ากู้คืนไม่ได้" ที่ต้องติ๊กก่อนปุ่มจะกดได้
 * ฝั่งเซิร์ฟเวอร์รับ understood แยกด้วย — ปุ่มที่ถูกเรียกตรง ๆ โดยไม่ผ่านแผงจะไม่ลบอะไร
 */
export async function purgeTrashAction(
  source: Source, id: string, understood: boolean,
): Promise<TrashActionResult> {
  await requirePerm('settings');
  if (understood !== true) return { error: 'ต้องติ๊กยืนยันว่าเข้าใจว่ากู้คืนไม่ได้ก่อน' };
  if (!isSource(source) || !isUuid(id)) return { error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง — ลองโหลดหน้าใหม่' };
  try {
    await purgeFromTrash(source, id);
  } catch (err) {
    return { error: describe(err, 'ลบถาวรไม่สำเร็จ') };
  }
  refresh();
  return {};
}
