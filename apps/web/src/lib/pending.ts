import 'server-only';
import { query } from './auth';
import { mutate } from './mutate';
import { linkPendingWith, listPendingItemsWith, type PendingItem } from './pending-core';

/**
 * รายการค้างทำ — ชื่อสินค้าที่พนักงานพิมพ์ลงเอกสารเองโดยไม่ได้เลือกจากทะเบียน
 *
 * รายการพวกนี้ไม่มีรหัสสินค้า จึงไม่ถูกตัดสต๊อกและไม่เข้าการคำนวณต้นทุน
 * เมนูนี้มีไว้ให้ตามเก็บทีหลัง — ผูกเข้าทะเบียนที่มีอยู่ หรือสั่งข้ามถ้าเป็นของที่ไม่ต้องมีรหัส
 * (เช่น ค่าส่ง ค่าทำสี ที่ไม่ใช่อะไหล่ในสต๊อก)
 *
 * คำสั่ง SQL อยู่ใน pending-core.ts (รับ client — เทสต์เรียกได้) ตัวนี้ผูก session และสิทธิ์
 */

export type { PendingItem };

export async function listPendingItems(): Promise<PendingItem[]> {
  return query((c) => listPendingItemsWith(c));
}

export async function countIgnoredItems(): Promise<number> {
  return query(async (c) => {
    const { rows } = await c.query(`select count(*)::int as c from ignored_item_names`);
    return rows[0].c;
  });
}

/** ผูกชื่อที่ค้างอยู่เข้ากับสินค้าในทะเบียน — ดู linkPendingWith */
export async function linkPendingToProduct(nameNorm: string, productId: string): Promise<number> {
  return mutate('stock', (c) => linkPendingWith(c, nameNorm, productId), { sub: 'pending' });
}

/** สั่งข้ามชื่อนี้ ไม่ต้องเตือนอีก */
export async function ignorePendingItem(nameNorm: string): Promise<void> {
  return mutate('stock', async (c) => {
    await c.query(
      `insert into ignored_item_names (tenant_id, name_norm)
       values (current_tenant_id(), $1) on conflict do nothing`,
      [nameNorm],
    );
  }, { sub: 'pending' });
}

/** เอารายการที่ข้ามไว้กลับมาแสดงทั้งหมด */
export async function restoreIgnoredItems(): Promise<void> {
  return mutate('stock', async (c) => {
    await c.query(`delete from ignored_item_names`);
  }, { sub: 'pending' });
}

/** สร้างสินค้าใหม่จากชื่อที่ค้างอยู่ แล้วผูกให้เลย */
export async function createProductFromPending(
  nameNorm: string, code: string, name: string, unit: string, cost: number, priceA: number,
): Promise<{ productId: string; linked: number }> {
  return mutate('stock', async (c) => {
    const { rows } = await c.query(
      `insert into products (tenant_id, code, name, unit, last_cost, price_a, price_b, price_c)
       values (current_tenant_id(), $1, $2, $3, $4, $5, $5, $5)
       returning id`,
      [code, name, unit, cost, priceA],
    );
    const productId = rows[0].id;
    const linked = await linkPendingWith(c, nameNorm, productId);
    return { productId, linked };
  }, { sub: 'pending' });
}
