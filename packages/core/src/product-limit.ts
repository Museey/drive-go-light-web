/**
 * จำกัดสินค้าที่ใช้งานไม่เกิน 3,000 รายการต่ออู่ (ผู้ใช้กำหนด 16 ก.ย. 2569)
 *
 * **นับเฉพาะที่เปิดใช้งาน** — ระบบไม่มีทางลบสินค้า มีแค่ปิดใช้งาน ถ้านับรวม อู่ที่ครบจะเพิ่มไม่ได้อีกเลย
 * ฐานข้อมูลบังคับเลขเดียวกันนี้ใน `db/032_product_limit.sql` (และ `001_init.sql`)
 * — เทสต์ `apps/web/test/product-limit-db.test.ts` ตรวจว่าสองที่ตรงกัน
 *
 * ที่นี่เป็นแค่ข้อความและการนับล่วงหน้าให้ผู้ใช้อ่านรู้เรื่อง ตัวบังคับจริงคือฐานข้อมูล
 */

export const PRODUCT_LIMIT = 3000;

/** ชื่อ constraint ที่ทริกเกอร์ใส่มากับข้อผิดพลาด (errcode 53400) — ใช้แยกจากข้อผิดพลาดอื่นรหัสเดียวกัน */
export const PRODUCT_LIMIT_CONSTRAINT = 'products_active_limit';

const fmt = (n: number) => n.toLocaleString('en-US');

/** ใช้งานอยู่ `active` แล้วจะเพิ่มอีก `adding` — รวมเป็นเท่าไร เกินเท่าไร (ไม่เกิน = 0) */
export function productRoomAfter(active: number, adding: number): { total: number; over: number } {
  const total = active + adding;
  /* อู่ที่เกินอยู่แล้วตั้งแต่ก่อนมีกติกา — ไม่เพิ่มก็ไม่ถือว่าทำให้เกิน (แก้ราคา/ชื่อได้ตามปกติ) */
  return { total, over: adding > 0 ? Math.max(0, total - PRODUCT_LIMIT) : 0 };
}

/** สินค้าที่ใช้งานในไฟล์สำรอง — ไม่มีฟิลด์ active = ใช้งาน (ไฟล์รุ่นเก่าไม่มีฟิลด์นี้) */
export function activeProductsOf(products: unknown): number {
  if (!Array.isArray(products)) return 0;
  return products.filter((p) => !(p && typeof p === 'object' && (p as { active?: unknown }).active === false)).length;
}

/** รหัสสินค้าใหม่จากแถว CSV — แถวที่ขาดรหัสหรือชื่อข้ามไป (ตัวนำเข้าข้ามเหมือนกัน) · รหัสซ้ำในไฟล์นับครั้งเดียว */
export function csvNewProducts(rows: { code: string; name: string }[], existing: ReadonlySet<string>): number {
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.code || !r.name || existing.has(r.code)) continue;
    seen.add(r.code);
  }
  return seen.size;
}

export type ProductLimitCase =
  | { kind: 'form' }
  | { kind: 'csv'; total: number; over: number }
  | { kind: 'restore'; total: number; over: number };

export function productLimitMessage(c: ProductLimitCase): string {
  switch (c.kind) {
    case 'form':
      return `สินค้าที่ใช้งานครบ ${fmt(PRODUCT_LIMIT)} รายการแล้ว — ปิดใช้งานสินค้าที่เลิกขายก่อนจึงจะเพิ่มได้`;
    case 'csv':
      return `ไฟล์นี้จะทำให้มีสินค้าใช้งาน ${fmt(c.total)} รายการ เกิน ${fmt(c.over)} รายการ — ไม่ได้นำเข้าเลย`;
    case 'restore':
      return `ไฟล์นี้มีสินค้าใช้งาน ${fmt(c.total)} รายการ เกินกำหนด ${fmt(PRODUCT_LIMIT)} — ไม่ได้กู้คืน ข้อมูลเดิมยังอยู่ครบ`;
  }
}

/**
 * ข้อความบอกที่ว่างก่อนนำเข้าสินค้า — ใช้บนหัวการ์ดนำเข้า (07.3)
 *
 * **ไม่มีเพดานต่อไฟล์** ไฟล์ทั้งไฟล์ถูกนับรวมกับของที่มีอยู่แล้วเทียบขีดจำกัดของทั้งอู่
 * ข้อความเดิมเขียนว่า "ครั้งละไม่เกิน 3,000 รายการต่อไฟล์" ซึ่งทำให้ร้านที่มีของอยู่แล้ว
 * เตรียมไฟล์มาผิดขนาดแล้วโดนปฏิเสธทั้งไฟล์ตอนกดนำเข้า (ผู้ใช้แจ้ง 18 ก.ย. 2569)
 */
export function productLimitHint(active: number): string {
  const room = PRODUCT_LIMIT - active;
  if (room <= 0) {
    return `ใช้งานอยู่ ${fmt(active)} / ${fmt(PRODUCT_LIMIT)} รายการ — ` +
      'ปิดใช้งานสินค้าที่เลิกขายก่อนจึงจะนำเข้าเพิ่มได้';
  }
  return `ใช้งานอยู่ ${fmt(active)} / ${fmt(PRODUCT_LIMIT)} รายการ — ไฟล์นี้เพิ่มได้อีกไม่เกิน ${fmt(room)} รายการ`;
}
