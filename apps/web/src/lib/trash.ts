/**
 * ถังขยะ — ตัวที่ผูกกับ session และสิทธิ์ของผู้ใช้ งานจริงอยู่ใน trash-core.ts
 */
import { query } from './auth';
import { mutate } from './mutate';
import { listTrashWith, purgeFromTrashWith, restoreFromTrashWith, type TrashRow } from './trash-core';

export type { TrashRow };

type Source = 'doc' | 'billnote';

export async function listTrash(opts: { from?: string; to?: string }): Promise<TrashRow[]> {
  return query((c) => listTrashWith(c, opts));
}

export async function restoreFromTrash(source: Source, id: string): Promise<void> {
  return mutate('settings', (c, userId) => restoreFromTrashWith(c, source, id, userId), { sub: 'shop' });
}

export async function purgeFromTrash(source: Source, id: string): Promise<void> {
  return mutate('settings', (c) => purgeFromTrashWith(c, source, id), { sub: 'shop' });
}
