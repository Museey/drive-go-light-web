import 'server-only';
import type pg from 'pg';
import { requirePerm, type Perm } from './auth';
import { withTenant } from './db';
import { licenseStatusWith } from './license-window';

export interface MutateOptions {
  /**
   * ให้ทำงานได้แม้การใช้งานหมดอายุ
   *
   * ใช้กับงานที่ต้องทำได้เสมอ — ต่ออายุ ตั้งค่าร้าน และส่งออกข้อมูล
   * อู่ที่ขาดต่ออายุต้องเอาข้อมูลของตัวเองออกไปได้เสมอ ไม่ใช่ถูกจับเป็นตัวประกัน
   */
  allowExpired?: boolean;
}

/**
 * ตัวช่วยสำหรับ Server Action ที่เขียนข้อมูล
 *
 * ทุก action ต้องตรวจสิทธิ์เองเสมอ ไม่ใช่พึ่งว่าหน้าที่เรียกมันตรวจไว้แล้ว
 * — action เรียกจากที่ไหนก็ได้ ไม่ได้ผูกกับหน้าใดหน้าหนึ่ง
 *
 * และตรวจอายุการใช้งานฝั่งเซิร์ฟเวอร์ทุกครั้งที่จะเขียน ต่างจากโปรแกรมเดิม
 * ที่ตรวจในไฟล์ HTML ซึ่งข้ามได้จาก DevTools ตามที่คอมเมนต์ในโค้ดเดิมยอมรับไว้เอง
 */
export async function mutate<T>(
  perm: Perm,
  fn: (client: pg.PoolClient, userId: string) => Promise<T>,
  options: MutateOptions = {},
): Promise<T> {
  const session = await requirePerm(perm);

  return withTenant(session.tenantId, async (c) => {
    if (!options.allowExpired) {
      const license = await licenseStatusWith(c);
      if (license.mode === 'expired') {
        throw new Error(
          license.everPaid
            ? 'การใช้งานหมดอายุแล้ว — ต่ออายุที่เมนูลิขสิทธิ์เพื่อบันทึกรายการใหม่ ' +
              '(ข้อมูลเดิมยังดู พิมพ์ และส่งออกได้ตามปกติ)'
            : 'ช่วงทดลองใช้สิ้นสุดแล้ว — สมัครใช้งานที่เมนูลิขสิทธิ์เพื่อบันทึกรายการใหม่ ' +
              '(ข้อมูลที่บันทึกไว้ยังดู พิมพ์ และส่งออกได้ตามปกติ)',
        );
      }
    }
    return fn(c, session.userId);
  });
}

/** ผลลัพธ์ของฟอร์ม — คืนค่าที่กรอกกลับไปด้วยเพื่อไม่ให้ผู้ใช้ต้องพิมพ์ใหม่ทั้งหมด */
export interface FormResult {
  error?: string;
  /** ชื่อฟิลด์ที่มีปัญหา ใช้ไฮไลต์ช่องที่ผิด */
  field?: string;
  ok?: boolean;
  /** ค่าที่ผู้ใช้กรอกมา ใช้เติมกลับเข้าฟอร์มเมื่อบันทึกไม่ผ่าน */
  values?: Record<string, string>;
}

/**
 * เก็บทุกช่องที่ผู้ใช้กรอกไว้คืนให้ฟอร์ม
 *
 * ถ้าไม่ทำ ผู้ใช้ที่กรอกข้อมูลลูกค้าครบทุกช่องแล้วติดที่รหัสซ้ำ จะต้องพิมพ์ใหม่ทั้งหมด
 * ซึ่งเป็นเหตุผลที่คนเลิกใช้โปรแกรม
 */
export function keepValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/**
 * แปลง error จาก Postgres เป็นข้อความที่ผู้ใช้อ่านรู้เรื่อง
 * ข้อความต้องบอกว่าเกิดอะไรและต้องแก้อย่างไร ไม่ใช่แค่บอกว่าพัง
 */
export function friendlyDbError(err: unknown, labels: Record<string, string> = {}): string {
  const e = err as { code?: string; constraint?: string; message?: string };

  if (e.code === '23505') {
    const c = e.constraint ?? '';
    /* barcode ต้องมาก่อน code เพราะชื่อ constraint ของมันมีคำว่า code อยู่ข้างใน */
    if (c.includes('barcode')) return labels.barcode ?? 'บาร์โค้ดนี้ถูกใช้กับสินค้าตัวอื่นแล้ว';
    if (c.includes('code')) return labels.code ?? 'รหัสนี้มีอยู่แล้ว ใช้รหัสอื่น';
    if (c.includes('email')) return 'อีเมลนี้ถูกใช้ไปแล้ว';
    if (c.includes('name')) return 'ชื่อนี้มีอยู่แล้ว';
    return 'ข้อมูลนี้ซ้ำกับที่มีอยู่แล้ว';
  }

  if (e.code === '23503') {
    return 'ลบไม่ได้เพราะยังมีข้อมูลอื่นอ้างถึงอยู่';
  }

  if (e.code === '23514') {
    const c = e.constraint ?? '';
    if (c.includes('name_present')) return 'ต้องกรอกชื่ออย่างน้อยหนึ่งช่อง';
    if (c.includes('tax_id')) return 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก';
    return 'ข้อมูลไม่ผ่านเงื่อนไขของระบบ ตรวจสอบค่าที่กรอกอีกครั้ง';
  }

  return e.message ?? 'บันทึกไม่สำเร็จ';
}

/* ---------- ตัวช่วยอ่านค่าจากฟอร์ม ---------- */

export const str = (fd: FormData, k: string): string => String(fd.get(k) ?? '').trim();

export const digits = (fd: FormData, k: string): string => str(fd, k).replace(/\D/g, '');

export function money(fd: FormData, k: string): number {
  const n = parseFloat(str(fd, k).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function qty(fd: FormData, k: string): number {
  const n = parseFloat(str(fd, k).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
}

export const flag = (fd: FormData, k: string): boolean => fd.get(k) === 'on' || fd.get(k) === 'true';
