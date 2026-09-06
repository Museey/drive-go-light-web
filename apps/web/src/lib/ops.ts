import 'server-only';
import { withoutTenant } from './db';
import { EXPECTED_MIGRATIONS } from './migrations.generated';
import { currentSession } from './auth';
import {
  healthChecksWith, listErrorsWith, markSeenWith, recordErrorWith,
  type ErrorRow, type HealthCheck, type RecordErrorInput,
} from './ops-core';

export type { ErrorRow, HealthCheck } from './ops-core';

/**
 * บันทึกข้อผิดพลาดที่เกิดบนเครื่อง
 *
 * เติมรหัสอู่และรหัสผู้ใช้ให้เองถ้ารู้ — ตอนไล่ปัญหาสิ่งแรกที่อยากรู้เสมอ
 * คือ "เกิดกับอู่ไหน" และ "คนเดียวหรือทุกคน"
 *
 * ไม่โยนต่อไม่ว่าเกิดอะไรขึ้น ตัวบันทึกที่พังแล้วทำให้ทั้งคำขอพังคือของที่
 * ทำให้เรื่องเล็กกลายเป็นเรื่องใหญ่
 */
export async function recordError(input: RecordErrorInput): Promise<string | null> {
  try {
    let tenantId = input.tenantId ?? null;
    let userId = input.userId ?? null;
    if (!tenantId || !userId) {
      const s = await currentSession().catch(() => null);
      tenantId = tenantId ?? s?.tenantId ?? null;
      userId = userId ?? s?.userId ?? null;
    }
    return await withoutTenant((c) => recordErrorWith(c, { ...input, tenantId, userId }));
  } catch {
    return null;
  }
}

export async function listErrors(
  opts: { limit?: number; onlyUnseen?: boolean } = {},
): Promise<ErrorRow[]> {
  return withoutTenant((c) => listErrorsWith(c, opts));
}

export async function markErrorsSeen(ids: string[]): Promise<void> {
  return withoutTenant((c) => markSeenWith(c, ids));
}

export async function healthChecks(): Promise<HealthCheck[]> {
  try {
    return await withoutTenant((c) => healthChecksWith(c, [...EXPECTED_MIGRATIONS]));
  } catch (err) {
    return [{
      name: 'db',
      ok: false,
      detail: err instanceof Error ? err.message.slice(0, 200) : 'ต่อฐานข้อมูลไม่ได้',
    }];
  }
}
