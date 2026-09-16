import type pg from 'pg';
import {
  csvNewProducts, PRODUCT_LIMIT_CONSTRAINT, productLimitMessage, productRoomAfter,
} from '@drivegolight/core';

/**
 * จำกัดสินค้าที่ใช้งานไม่เกิน 3,000 รายการต่ออู่ — ฝั่งแอป
 *
 * ตัวบังคับจริงคือทริกเกอร์ในฐานข้อมูล (db/032_product_limit.sql) ที่นี่แค่นับล่วงหน้า
 * ให้ผู้ใช้ได้ข้อความที่อ่านรู้เรื่อง และให้ CSV ถูกปฏิเสธ "ก่อน" เริ่มเขียนแถวแรก
 *
 * ไม่มี server-only — รับ client ที่ตั้ง app.tenant_id ไว้แล้ว เทสต์เรียกได้ตรง ๆ
 * การนับพึ่ง Row Level Security ให้เห็นเฉพาะสินค้าของอู่ตัวเอง
 */

type Db = Pick<pg.ClientBase, 'query'>;

/** ข้อความสำหรับผู้ใช้อยู่ใน message แล้ว — ไม่มี code จึงไม่ถูกแปลงซ้ำใน friendlyDbError */
export class ProductLimitError extends Error {}

/** ข้อผิดพลาดจากทริกเกอร์ของเรา — errcode 53400 ใช้กับเรื่องอื่นได้ จึงดูชื่อ constraint ด้วย */
export function isProductLimitError(err: unknown): boolean {
  const e = err as { code?: unknown; constraint?: unknown } | null;
  return !!e && e.code === '53400' && e.constraint === PRODUCT_LIMIT_CONSTRAINT;
}

export async function activeProductCountWith(c: Db): Promise<number> {
  const { rows } = await c.query(`select count(*)::int as n from products where active`);
  return rows[0].n;
}

/** จะเพิ่มสินค้าที่ใช้งาน `adding` รายการ — เกินแล้วโยน ProductLimitError */
export async function ensureProductRoomWith(c: Db, adding = 1): Promise<void> {
  if (productRoomAfter(await activeProductCountWith(c), adding).over > 0) {
    throw new ProductLimitError(productLimitMessage({ kind: 'form' }));
  }
}

/** ฟอร์มแก้ไข — นับเฉพาะตอนสินค้าที่ปิดอยู่จะถูกเปิดใช้งาน แก้ราคา/ชื่อไม่นับ */
export async function ensureActivationRoomWith(c: Db, productId: string, nextActive: boolean): Promise<void> {
  if (!nextActive) return;
  const { rows } = await c.query(`select active from products where id = $1`, [productId]);
  if (!rows[0] || rows[0].active) return;
  await ensureProductRoomWith(c, 1);
}

/**
 * CSV ทั้งไฟล์ — นับรหัสใหม่ที่จะถูกสร้าง (ของใหม่เปิดใช้งานเสมอ)
 * รหัสที่มีอยู่แล้วแม้ปิดใช้งานไว้ ตัวนำเข้าแค่แก้ราคา/ชื่อ ไม่แตะสถานะ จึงไม่นับ
 */
export async function ensureCsvRoomWith(c: Db, rows: { code: string; name: string }[]): Promise<void> {
  const { rows: codes } = await c.query(`select code from products`);
  const adding = csvNewProducts(rows, new Set(codes.map((r) => String(r.code))));
  const room = productRoomAfter(await activeProductCountWith(c), adding);
  if (room.over > 0) {
    throw new ProductLimitError(productLimitMessage({ kind: 'csv', ...room }));
  }
}
