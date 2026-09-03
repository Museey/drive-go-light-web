import 'server-only';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { withoutTenant } from './db';
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

/**
 * ไฟล์ไมเกรชันที่โค้ดชุดนี้ต้องการ — อ่านจากโฟลเดอร์จริง ไม่ใช่รายชื่อที่พิมพ์ไว้
 * เพิ่มไฟล์ใหม่แล้วตัวตรวจสุขภาพรู้เองทันที ไม่ต้องจำไปแก้อีกที่
 */
function expectedMigrations(): string[] {
  try {
    return readdirSync(resolve(process.cwd(), '../../db'))
      .filter((f) => /^\d+.*\.sql$/.test(f))
      .sort();
  } catch {
    return [];
  }
}

export async function healthChecks(): Promise<HealthCheck[]> {
  try {
    return await withoutTenant((c) => healthChecksWith(c, expectedMigrations()));
  } catch (err) {
    return [{
      name: 'db',
      ok: false,
      detail: err instanceof Error ? err.message.slice(0, 200) : 'ต่อฐานข้อมูลไม่ได้',
    }];
  }
}
