/**
 * ชุดอะไหล่ซ่อมบำรุง (05.7) — รวมวัสดุสิ้นเปลืองหลายรายการเป็นหนึ่งชุด ตั้งราคาขายชุดเดียว
 *
 * รายการในชุดมาจากทะเบียนสินค้า (ผูก product_id → ใบเสร็จตัดสต๊อกชิ้นส่วน) หรือพิมพ์ชื่อเอง
 * ต้นทุนรวม = Σ qty × unit_cost ให้ผู้ใช้ดูก่อนตั้งราคา · บนเอกสารแสดง
 * "ชุดอะไหล่ซ่อมบำรุง <ชื่อชุด> (รายการ, รายการ, …)" ราคาตามที่ตั้ง
 *
 * สูตรและการตรวจข้อมูลอยู่ใน kit-calc.ts (ใช้ร่วมกับฟอร์มฝั่ง client)
 */
import { query } from './auth';
import { mutate } from './mutate';
import type pg from 'pg';
import { filledItems, kitCost, type KitInput } from './kit-calc';

export { kitCost, kitLineName, type KitInput, type KitItemInput } from './kit-calc';
export interface KitRow extends KitInput { id: string; active: boolean; cost: number }

const money = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

async function readKits(c: pg.PoolClient | pg.Client, where: string, params: unknown[]): Promise<KitRow[]> {
  const { rows } = await c.query(
    `select k.id, k.code, k.name, k.price, k.price_b, k.price_c, k.note, k.active,
            coalesce(json_agg(json_build_object('productId', i.product_id, 'name', i.name, 'unit', i.unit, 'qty', i.qty, 'unitCost', i.unit_cost)
                              order by i.sort_order) filter (where i.id is not null), '[]') as items
       from kits k left join kit_items i on i.kit_id = k.id
      ${where}
      group by k.id order by k.code`,
    params,
  );
  return rows.map((r) => {
    const items = (r.items as { productId: string | null; name: string; unit: string; qty: string; unitCost: string }[])
      .map((i) => ({ productId: i.productId, name: i.name, unit: i.unit, qty: Number(i.qty), unitCost: Number(i.unitCost) }));
    return { id: r.id, code: r.code, name: r.name, price: Number(r.price), priceB: Number(r.price_b), priceC: Number(r.price_c), note: r.note, active: r.active, items, cost: kitCost(items) };
  });
}

export async function listKits(q = ''): Promise<KitRow[]> {
  const term = `%${q.trim()}%`;
  return query((c) => readKits(c, `where k.active and ($1 = '%%' or k.code ilike $1 or k.name ilike $1)`, [term]));
}

export async function getKit(id: string): Promise<KitRow | null> {
  return query(async (c) => (await readKits(c, 'where k.id = $1', [id]))[0] ?? null);
}

/** ค้นชุดเพื่อใส่ในเอกสาร (ใช้ร่วมกับผลค้นหาสินค้า) */
export async function searchKits(q: string, limit = 5): Promise<KitRow[]> {
  if (!q.trim()) return [];
  const rows = await listKits(q);
  return rows.slice(0, limit);
}

/**
 * รหัสถัดไป KIT-001, KIT-002 …
 *
 * ต้นฉบับนับจำนวนแถว — ถ้าผู้ใช้ตั้งรหัสเองข้ามลำดับ (เช่น KIT-005 ตอนมีสองชุด) รหัสที่เสนอจะชนกับของเดิม
 * แล้วบันทึกไม่ผ่านด้วยข้อความจากฐานข้อมูล · ใช้เลขสูงสุดที่มีอยู่ + 1 แทน
 */
export async function nextKitCode(): Promise<string> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select coalesce(max((substring(code from '^KIT-([0-9]+)$'))::int), 0) + 1 as n from kits`);
    return `KIT-${String(rows[0]?.n ?? 1).padStart(3, '0')}`;
  });
}

/** สินค้าที่ใส่ในชุดได้ — พร้อมทุนล่าสุดไว้เติมช่องทุนต่อหน่วย (ซ่อนเมื่อผู้ใช้ไม่มีสิทธิ์เห็นต้นทุน) */
export interface KitPart { id: string; code: string; name: string; unit: string; lastCost: number | null; qtyOnHand: number }

export async function searchKitParts(q: string, showCost: boolean, limit = 8): Promise<KitPart[]> {
  const term = q.trim();
  if (!term) return [];
  return query(async (c) => {
    const { rows } = await c.query(
      `select p.id, p.code, p.name, p.unit, p.last_cost, coalesce(s.qty_on_hand, 0) as qty
         from products p left join product_stock s on s.product_id = p.id
        where p.active and (p.code ilike $1 or p.name ilike $1 or p.oem ilike $1 or p.barcode ilike $1)
        order by case when upper(p.code) = upper($2) or upper(p.barcode) = upper($2) then 0 else 1 end, p.code
        limit $3`,
      [`%${term}%`, term, limit],
    );
    return rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, unit: r.unit ?? '',
      lastCost: showCost ? Number(r.last_cost ?? 0) : null, qtyOnHand: Number(r.qty),
    }));
  });
}

/**
 * สิทธิ์ผูกกับเมนูย่อย stock.kits ตัวเดียวกับหน้า — ต้นฉบับใช้ 'product' ซึ่งไม่มีในผังเมนู
 * พนักงานที่ถูกตั้งสิทธิ์รายเมนูย่อยไว้แล้วจึงไม่มีทางได้สิทธิ์นั้น และบันทึกชุดไม่ได้เลย
 */
export async function saveKit(input: KitInput): Promise<{ id: string }> {
  return mutate('stock', async (c) => {
    let id = input.id ?? null;
    if (id) {
      const res = await c.query(
        `update kits set code=$2, name=$3, price=$4, price_b=$5, price_c=$6, note=$7, updated_at=now() where id=$1`,
        [id, input.code.trim(), input.name.trim(), money(input.price), money(input.priceB), money(input.priceC), input.note]);
      if (!res.rowCount) throw new Error('ไม่พบชุดอะไหล่นี้ — อาจถูกลบไปแล้ว');
      await c.query(`delete from kit_items where kit_id = $1`, [id]);
    } else {
      const { rows } = await c.query(
        `insert into kits (tenant_id, code, name, price, price_b, price_c, note) values (current_tenant_id(), $1, $2, $3, $4, $5, $6) returning id`,
        [input.code.trim(), input.name.trim(), money(input.price), money(input.priceB), money(input.priceC), input.note]);
      id = rows[0].id as string;
    }
    let i = 0;
    for (const it of filledItems(input.items)) {
      await c.query(
        `insert into kit_items (tenant_id, kit_id, product_id, name, unit, qty, unit_cost, sort_order)
         values (current_tenant_id(), $1, $2, $3, $4, $5, $6, $7)`,
        [id, it.productId, it.name.trim(), it.unit, it.qty, money(it.unitCost), i++]);
    }
    return { id: id! };
  }, { sub: 'kits' });
}

export async function deactivateKit(id: string): Promise<void> {
  return mutate('stock', async (c) => {
    await c.query(`update kits set active = false, updated_at = now() where id = $1`, [id]);
  }, { sub: 'kits' });
}

/** ชิ้นส่วนของชุดที่ผูกทะเบียน — ใช้ตัดสต๊อกตอนออกใบเสร็จ */
export async function kitComponents(c: pg.PoolClient | pg.Client, kitId: string): Promise<{ productId: string; qty: number }[]> {
  const { rows } = await c.query(`select product_id, qty from kit_items where kit_id = $1 and product_id is not null`, [kitId]);
  return rows.map((r) => ({ productId: r.product_id, qty: Number(r.qty) }));
}
