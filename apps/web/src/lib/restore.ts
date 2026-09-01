import 'server-only';
import { requirePerm } from './auth';
import { mutate } from './mutate';
import {
  parseBackupFile, previewBackup, restoreIntoTenant,
  type BackupPreview, type RestoreResult,
} from './restore-core';

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
export type { BackupPreview, RestoreResult } from './restore-core';

/** ตรวจไฟล์ให้ผู้ใช้ดูก่อนตัดสินใจ — ไม่แตะข้อมูลเดิมเลย */
export async function inspectBackup(text: string): Promise<BackupPreview> {
  await requirePerm('settings');
  return previewBackup(text);
}

export async function restoreFromBackup(
  text: string,
  opts: { acceptDataLoss?: boolean } = {},
): Promise<RestoreResult> {
  const backup = parseBackupFile(text);

  /* กันการลบข้อมูลเดิมทิ้งไปแล้วเพิ่งมารู้ว่าของใหม่มาไม่ครบ
     ตรวจซ้ำฝั่งเซิร์ฟเวอร์ ไม่เชื่อว่าหน้าเว็บตรวจมาแล้ว */
  const preview = previewBackup(text);
  if (preview.needsAcknowledgement && !opts.acceptDataLoss) {
    throw new Error(
      'ไฟล์นี้มีข้อมูลที่ระบบยังรองรับไม่ได้ — ต้องติ๊กรับทราบก่อนจึงจะกู้คืนได้',
    );
  }

  return mutate('settings', async (c) => {
    const { rows } = await c.query(`select id from tenants where id = current_tenant_id()`);
    const tenantId = rows[0]?.id as string | undefined;
    if (!tenantId) throw new Error('ไม่พบข้อมูลอู่ในระบบ');

    return restoreIntoTenant(c, tenantId, backup);
  }, { allowExpired: true });
}
