import 'server-only';
import { mutate } from './mutate';
import { parseBackupFile, restoreIntoTenant, type RestoreResult } from './restore-core';

/**
 * กู้คืนข้อมูลของอู่จากไฟล์สำรอง — ทับข้อมูลเดิมทั้งหมด
 *
 * ยกความสามารถของปุ่ม "กู้คืนข้อมูลจากไฟล์สำรอง" ในรุ่น HTML มา
 * ต่างกันสองเรื่องที่บอกไว้บนหน้าจอด้วย:
 *
 *   1. ไม่แตะผู้ใช้งานและรหัสผ่าน — ไฟล์สำรองไม่มีรหัสผ่านอยู่ในนั้น (ตั้งใจให้ไม่มี)
 *      ถ้าเขียนทับตารางผู้ใช้ ทุกคนในอู่จะเข้าระบบไม่ได้ทันที
 *   2. ไม่แตะการสมัครใช้บริการ — อายุการใช้งานเป็นเรื่องระหว่างอู่กับผู้ให้บริการ
 *      ไม่ใช่ข้อมูลที่อยู่ในไฟล์ของอู่
 *
 * ทั้งหมดอยู่ในทรานแซกชันเดียวของ mutate() ถ้าพังกลางทางข้อมูลเดิมยังอยู่ครบ
 * และอนุญาตแม้การใช้งานหมดอายุ — อู่ต้องเอาข้อมูลตัวเองเข้าออกได้เสมอ
 */
export type { RestoreResult } from './restore-core';

export async function restoreFromBackup(text: string): Promise<RestoreResult> {
  const backup = parseBackupFile(text);

  return mutate('settings', async (c) => {
    const { rows } = await c.query(`select id from tenants where id = current_tenant_id()`);
    const tenantId = rows[0]?.id as string | undefined;
    if (!tenantId) throw new Error('ไม่พบข้อมูลอู่ในระบบ');

    return restoreIntoTenant(c, tenantId, backup);
  }, { allowExpired: true });
}
