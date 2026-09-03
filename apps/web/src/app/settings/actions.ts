'use server';

import { revalidatePath } from 'next/cache';
import { requirePerm } from '@/lib/auth';
import { issueSetupToken } from '@/lib/auth';
import { saveShopSettings, saveStaff, promoteToOwner, nextUserCode } from '@/lib/settings';
import { PERM_KEYS, type Perms } from '@/lib/perms';
import { SUB_KEYS } from '@/components/menu-map';
import { importProductsCsv, type CsvImportResult } from '@/lib/products-csv';
import {
  inspectBackup, restoreFromBackup, type BackupPreview, type RestoreResult,
} from '@/lib/restore';
import { friendlyDbError, money, str, type FormResult } from '@/lib/mutate';

function describe(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'code' in err) return friendlyDbError(err);
  return err instanceof Error ? err.message : fallback;
}

/** โลโก้เก็บเป็น data URI ในคอลัมน์ logo_url — ดูเหตุผลที่หน้าตั้งค่า */
const MAX_LOGO_BYTES = 200 * 1024;

export async function saveShopAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  await requirePerm('settings');

  const name = str(fd, 'name');
  if (!name) return { error: 'ต้องกรอกชื่อร้าน', field: 'name' };

  const taxId = str(fd, 'taxId').replace(/\D/g, '');
  if (taxId && taxId.length !== 13) {
    return { error: 'เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก — เว้นว่างได้ถ้ายังไม่มี', field: 'taxId' };
  }

  const vatRate = money(fd, 'vatRate');
  if (vatRate < 0 || vatRate > 30) return { error: 'อัตราภาษีมูลค่าเพิ่มไม่สมเหตุสมผล', field: 'vatRate' };

  const logoUrl = str(fd, 'logoUrl');
  if (logoUrl && logoUrl.length > MAX_LOGO_BYTES) {
    return {
      error: `ไฟล์โลโก้ใหญ่เกินไป (จำกัด ${Math.round(MAX_LOGO_BYTES / 1024)} KB) — ย่อรูปก่อนอัปโหลด`,
      field: 'logo',
    };
  }
  if (logoUrl && !/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(logoUrl)) {
    return { error: 'รองรับเฉพาะไฟล์ภาพ PNG, JPG, WebP หรือ SVG', field: 'logo' };
  }

  try {
    await saveShopSettings({
      name, taxId,
      addrText: str(fd, 'addrText'),
      tel: str(fd, 'tel'), tel2: str(fd, 'tel2'),
      vatRate, whtRate: money(fd, 'whtRate'),
      priceTier: (['A', 'B', 'C'].includes(str(fd, 'priceTier')) ? str(fd, 'priceTier') : 'A') as 'A',
      proposerName: str(fd, 'proposerName'),
      warrantyText: str(fd, 'warrantyText'),
      logoUrl,
    });
  } catch (err) {
    return { error: describe(err, 'บันทึกไม่สำเร็จ') };
  }

  revalidatePath('/settings');
  revalidatePath('/');
  return { ok: true };
}

export async function saveStaffAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const session = await requirePerm('settings');

  const name = str(fd, 'name');
  if (!name) return { error: 'ต้องกรอกชื่อพนักงาน', field: 'name' };

  const email = str(fd, 'email').toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'รูปแบบอีเมลไม่ถูกต้อง', field: 'email' };
  }

  /**
   * อ่านสิทธิ์จากฟอร์ม — เขียนครบทุกแท็บเสมอ ไม่ใช่เขียนเฉพาะที่ติ๊ก
   *
   * ค่าที่ "ไม่มีคีย์" มีความหมายพิเศษ (ดู canTab) และควรเกิดเฉพาะกับข้อมูล
   * ที่ย้ายเข้ามาจากไฟล์เก่า ไม่ใช่ข้อมูลที่ระบบเราสร้างเอง
   */
  const perms: Perms = { menus: {}, tabs: {}, edit: {}, export: {} };
  for (const k of PERM_KEYS) {
    const menuOn = fd.get(`perm_${k}`) === 'on';
    if (menuOn) perms.menus![k] = true;
    for (const sub of SUB_KEYS[k]) {
      const key = `${k}.${sub}`;
      const canOpen = menuOn && fd.get(`tab_${key}`) === 'on';
      perms.tabs![key] = canOpen;
      perms.edit![key] = canOpen && fd.get(`edit_${key}`) === 'on';
      perms.export![key] = canOpen && fd.get(`export_${key}`) === 'on';
    }
  }
  perms.cost = fd.get('perm_cost') === 'on';
  perms.homeReport = fd.get('perm_homeReport') === 'on';

  try {
    await saveStaff({
      id: str(fd, 'id') || undefined,
      code: str(fd, 'code') || (await nextUserCode()),
      name, email, perms,
      active: fd.get('active') === 'on',
    }, session.userId);
  } catch (err) {
    return { error: describe(err, 'บันทึกไม่สำเร็จ'), field: 'email' };
  }

  revalidatePath('/settings/users');
  return { ok: true };
}

/**
 * ออกลิงก์ตั้งรหัสผ่านให้พนักงาน
 * คืนลิงก์กลับมาให้เจ้าของกิจการส่งต่อเอง เพราะระบบยังไม่ส่งอีเมล
 */
export async function issueSetupLinkAction(userId: string, purpose: 'initial' | 'reset'): Promise<FormResult> {
  await requirePerm('settings');
  try {
    const token = await issueSetupToken(userId, purpose);
    revalidatePath('/settings/users');
    return { ok: true, values: { token } };
  } catch (err) {
    return { error: describe(err, 'ออกลิงก์ไม่สำเร็จ') };
  }
}

export async function promoteAction(userId: string): Promise<FormResult> {
  await requirePerm('settings');
  try {
    await promoteToOwner(userId);
  } catch (err) {
    return { error: describe(err, 'เปลี่ยนสิทธิ์ไม่สำเร็จ') };
  }
  revalidatePath('/settings/users');
  return { ok: true };
}

/**
 * ตรวจไฟล์สำรองให้ดูก่อน — ยังไม่แตะข้อมูลเดิม
 * แยกจากการกู้คืนเพื่อให้ผู้ใช้เห็นว่าจะได้อะไรและเสียอะไรก่อนตัดสินใจ
 */
export async function inspectBackupAction(
  _prev: FormResult & { preview?: BackupPreview },
  fd: FormData,
): Promise<FormResult & { preview?: BackupPreview }> {
  await requirePerm('settings');

  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'เลือกไฟล์สำรองก่อน', field: 'file' };
  if (file.size > 40 * 1024 * 1024) return { error: 'ไฟล์ใหญ่เกิน 40 MB', field: 'file' };

  try {
    return { ok: true, preview: await inspectBackup(await file.text()) };
  } catch (err) {
    return { error: describe(err, 'อ่านไฟล์ไม่สำเร็จ'), field: 'file' };
  }
}

/**
 * กู้คืนข้อมูลทั้งอู่จากไฟล์สำรอง
 *
 * ทับของเดิมทั้งหมด จึงบังคับให้พิมพ์คำยืนยันก่อน แบบเดียวกับตอนขอลบข้อมูล
 * เพราะกดพลาดแล้วข้อมูลที่ทับไปไม่มีทางกลับ นอกจากมีไฟล์สำรองอีกไฟล์
 */
export async function restoreBackupAction(
  _prev: FormResult & { result?: RestoreResult },
  fd: FormData,
): Promise<FormResult & { result?: RestoreResult }> {
  await requirePerm('settings');

  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'เลือกไฟล์สำรองก่อน', field: 'file' };
  if (file.size > 40 * 1024 * 1024) return { error: 'ไฟล์ใหญ่เกิน 40 MB', field: 'file' };

  if (str(fd, 'confirm') !== 'ทับข้อมูลเดิม') {
    return { error: 'พิมพ์คำว่า "ทับข้อมูลเดิม" ให้ตรงเพื่อยืนยัน', field: 'confirm' };
  }

  try {
    const result = await restoreFromBackup(await file.text(), {
      acceptDataLoss: fd.get('acceptDataLoss') === 'on',
    });
    revalidatePath('/', 'layout');
    return { ok: true, result };
  } catch (err) {
    return { error: describe(err, 'กู้คืนข้อมูลไม่สำเร็จ — ข้อมูลเดิมยังอยู่ครบ') };
  }
}

export async function importCsvAction(_prev: FormResult, fd: FormData): Promise<FormResult & { result?: CsvImportResult }> {
  await requirePerm('stock');
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'เลือกไฟล์ CSV ก่อน' };
  if (file.size > 5 * 1024 * 1024) return { error: 'ไฟล์ใหญ่เกิน 5 MB' };

  try {
    const result = await importProductsCsv(await file.text());
    revalidatePath('/stock');
    return { ok: true, result };
  } catch (err) {
    return { error: describe(err, 'นำเข้าไม่สำเร็จ') };
  }
}
