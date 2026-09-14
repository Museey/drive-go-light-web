/**
 * ถังขยะ — ตัวที่ผูกกับ session และสิทธิ์ของผู้ใช้ งานจริงอยู่ใน trash-core.ts
 */
import { query, requireSession } from './auth';
import { mutate } from './mutate';
import {
  assertOwnerPasswordWith, listTrashWith, purgeFromTrashWith, restoreFromTrashWith, type TrashRow,
} from './trash-core';

export type { TrashRow };

type Source = 'doc' | 'billnote';

export async function listTrash(opts: { from?: string; to?: string }): Promise<TrashRow[]> {
  return query((c) => listTrashWith(c, opts));
}

export async function restoreFromTrash(source: Source, id: string): Promise<void> {
  return mutate('settings', (c, userId) => restoreFromTrashWith(c, source, id, userId), { sub: 'shop' });
}

/** ลบถาวร — เฉพาะเจ้าของกิจการ และต้องยืนยันรหัสผ่านซ้ำ (ผู้ใช้กำหนด) · ตรวจรหัสในทรานแซกชันเดียวกับที่ลบ */
export async function purgeFromTrash(source: Source, id: string, password: string): Promise<void> {
  const s = await requireSession();
  return mutate('settings', async (c, userId) => {
    await assertOwnerPasswordWith(c, { userId, role: s.role }, password);
    await purgeFromTrashWith(c, source, id);
  }, { sub: 'shop' });
}
