import 'server-only';
import { stockFlags, today, type StockFlag } from '@drivegolight/core';
import { query } from './auth';
import { mutate } from './mutate';

const n = (v: unknown): number => Number(v ?? 0);

export interface Category {
  id: string;
  name: string;
  productCount: number;
}

export interface ProductRow {
  id: string;
  code: string;
  oem: string;
  name: string;
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
  lastCost: number;
  priceA: number;
  priceB: number;
  priceC: number;
  qtyMin: number;
  qtyMax: number;
  qtyOnHand: number;
  lastMoveOn: string | null;
  active: boolean;
  /** ป้ายสถานะ — ถึงจุดสั่งซื้อ เกินระดับสูงสุด ไม่เคลื่อนไหว */
  flags: StockFlag[];
  /** ถึงจุดสั่งซื้อแล้ว — ย่อจาก flags ไว้ใช้ที่เดิมที่เคยเรียก */
  needReorder: boolean;
}

export async function listCategories(): Promise<Category[]> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select g.id, g.name, count(p.id)::int as cnt
       from product_categories g
       left join products p on p.category_id = g.id
       group by g.id, g.name, g.sort_order
       order by g.sort_order, g.name`,
    );
    return rows.map((r) => ({ id: r.id, name: r.name, productCount: r.cnt }));
  });
}

const PAGE_SIZE = 40;

/** เงื่อนไข SQL ของแต่ละป้าย — ต้องตรงกับ stockFlags() ใน core ทุกตัวอักษร */
const FLAG_SQL: Record<StockFlag, string> = {
  min: 'p.qty_min > 0 and s.qty_on_hand <= p.qty_min',
  max: 'p.qty_max > 0 and s.qty_on_hand > p.qty_max',
  dead: `(s.last_move_on is null or s.last_move_on <= current_date - interval '6 months')`,
};

export interface ProductListResult {
  rows: ProductRow[];
  total: number;
  /** มูลค่าสต๊อกตามต้นทุนของ "ทุกแถวที่ตรงเงื่อนไข" ไม่ใช่เฉพาะหน้านี้ */
  stockValue: number;
}

export async function listProducts(opts: {
  search?: string;
  categoryId?: string;
  onlyReorder?: boolean;
  flag?: StockFlag;
  includeInactive?: boolean;
  page?: number;
  /** ขอทุกแถวโดยไม่แบ่งหน้า — ใช้ตอนสั่งพิมพ์รายการ */
  all?: boolean;
  pageSize?: number;
}): Promise<ProductListResult> {
  const page = Math.max(1, opts.page ?? 1);
  const search = (opts.search ?? '').trim();

  return query(async (c) => {
    const where: string[] = [];
    const params: unknown[] = [];

    if (!opts.includeInactive) where.push('p.active');

    if (opts.categoryId) {
      params.push(opts.categoryId);
      where.push(`p.category_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      where.push(`(p.code ilike $${i} or p.name ilike $${i} or p.oem ilike $${i})`);
    }
    if (opts.onlyReorder) where.push(`(${FLAG_SQL.min})`);
    if (opts.flag) where.push(`(${FLAG_SQL[opts.flag]})`);

    const whereSql = where.length ? `where ${where.join(' and ')}` : '';

    const totalRes = await c.query(
      `select count(*)::int as c,
              coalesce(sum(s.qty_on_hand * p.last_cost), 0) as value
       from products p
       join product_stock s on s.product_id = p.id ${whereSql}`,
      params,
    );

    const size = opts.pageSize ?? PAGE_SIZE;
    const limitSql = opts.all
      ? ''
      : `limit $${params.length + 1} offset $${params.length + 2}`;
    if (!opts.all) params.push(size, (page - 1) * size);

    const { rows } = await c.query(
      `select p.*, g.name as category_name, s.qty_on_hand, s.last_move_on
       from products p
       join product_stock s on s.product_id = p.id
       left join product_categories g on g.id = p.category_id
       ${whereSql}
       order by p.code
       ${limitSql}`,
      params,
    );

    return {
      total: totalRes.rows[0].c,
      stockValue: n(totalRes.rows[0].value),
      rows: rows.map(toProductRow),
    };
  });
}

function toProductRow(r: any): ProductRow {
  const onHand = n(r.qty_on_hand);
  const min = n(r.qty_min);
  const flags = stockFlags(
    { qtyOnHand: onHand, qtyMin: min, qtyMax: n(r.qty_max), lastMoveOn: r.last_move_on },
    today(),
  );
  return {
    id: r.id,
    code: r.code,
    oem: r.oem,
    name: r.name,
    unit: r.unit,
    categoryId: r.category_id,
    categoryName: r.category_name,
    lastCost: n(r.last_cost),
    priceA: n(r.price_a),
    priceB: n(r.price_b),
    priceC: n(r.price_c),
    qtyMin: min,
    qtyMax: n(r.qty_max),
    qtyOnHand: onHand,
    lastMoveOn: r.last_move_on,
    active: r.active,
    flags,
    needReorder: flags.includes('min'),
  };
}

export async function getProduct(id: string): Promise<ProductRow | null> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select p.*, g.name as category_name, s.qty_on_hand, s.last_move_on
       from products p
       join product_stock s on s.product_id = p.id
       left join product_categories g on g.id = p.category_id
       where p.id = $1`,
      [id],
    );
    return rows[0] ? toProductRow(rows[0]) : null;
  });
}

/** ประวัติการเคลื่อนไหวสต๊อกของสินค้าหนึ่งตัว */
export interface StockMoveRow {
  movedOn: string;
  qtyDelta: number;
  reason: string;
  note: string;
  docNo: string | null;
  docId: string | null;
}

export async function listStockMoves(productId: string, limit = 30): Promise<StockMoveRow[]> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select m.moved_on, m.qty_delta, m.reason::text as reason, m.note,
              d.id as doc_id, d.doc_no
       from stock_moves m
       left join documents d on d.id = m.doc_id
       where m.product_id = $1
       order by m.moved_on desc, m.created_at desc
       limit $2`,
      [productId, limit],
    );
    return rows.map((r) => ({
      movedOn: r.moved_on,
      qtyDelta: n(r.qty_delta),
      reason: r.reason,
      note: r.note,
      docNo: r.doc_no,
      docId: r.doc_id,
    }));
  });
}

/* =====================================================================
   การเขียนข้อมูล
   ===================================================================== */

export interface ProductInput {
  id?: string;
  code: string;
  oem: string;
  name: string;
  unit: string;
  categoryId: string | null;
  lastCost: number;
  priceA: number;
  priceB: number;
  priceC: number;
  qtyMin: number;
  qtyMax: number;
  active: boolean;
  /** ยอดยกมา ใช้เฉพาะตอนสร้างสินค้าใหม่ */
  openingQty?: number;
}

export async function saveProduct(input: ProductInput): Promise<string> {
  return mutate('stock', async (c, userId) => {
    if (input.id) {
      await c.query(
        `update products set code=$2, oem=$3, name=$4, unit=$5, category_id=$6,
                last_cost=$7, price_a=$8, price_b=$9, price_c=$10,
                qty_min=$11, qty_max=$12, active=$13
         where id=$1`,
        [input.id, input.code, input.oem, input.name, input.unit, input.categoryId,
         input.lastCost, input.priceA, input.priceB, input.priceC,
         input.qtyMin, input.qtyMax, input.active],
      );
      return input.id;
    }

    const { rows } = await c.query(
      `insert into products (tenant_id, code, oem, name, unit, category_id,
                             last_cost, price_a, price_b, price_c, qty_min, qty_max, active)
       values (current_tenant_id(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       returning id`,
      [input.code, input.oem, input.name, input.unit, input.categoryId,
       input.lastCost, input.priceA, input.priceB, input.priceC,
       input.qtyMin, input.qtyMax, input.active],
    );
    const id = rows[0].id;

    /* ยอดยกมาลงเป็นรายการเคลื่อนไหว ไม่ใช่คอลัมน์ — สต๊อกทั้งระบบเป็นบัญชีเดินสะพัด */
    if (input.openingQty && input.openingQty !== 0) {
      await c.query(
        `insert into stock_moves (tenant_id, product_id, qty_delta, unit_cost, reason, note, created_by)
         values (current_tenant_id(), $1, $2, $3, 'opening', 'ยอดยกมาตอนสร้างสินค้า', $4)`,
        [id, input.openingQty, input.lastCost, userId],
      );
    }
    return id;
  });
}

/**
 * ปรับยอดสต๊อกให้ตรงกับที่นับได้จริง
 * บันทึกเป็นส่วนต่าง ไม่ใช่เขียนทับยอด เพื่อให้ตรวจย้อนได้ว่าใครปรับเมื่อไหร่เท่าไร
 */
export async function adjustStock(productId: string, countedQty: number, note: string): Promise<void> {
  return mutate('stock', async (c, userId) => {
    const { rows } = await c.query(
      `select qty_on_hand from product_stock where product_id = $1`, [productId],
    );
    const current = n(rows[0]?.qty_on_hand);
    const delta = Math.round((countedQty - current) * 1000) / 1000;
    if (delta === 0) return;

    await c.query(
      `insert into stock_moves (tenant_id, product_id, qty_delta, reason, note, created_by)
       values (current_tenant_id(), $1, $2, 'adjust', $3, $4)`,
      [productId, delta, note || 'ปรับยอดตามที่นับได้', userId],
    );
  });
}

/**
 * รับสินค้าเข้าหรือตัดออกจากสต๊อกด้วยมือ พร้อมระบุวันที่
 *
 * ยกมาจาก moveModal() ของรุ่น 3.6 — ต่างจากการปรับยอดตรงที่ตรงนี้บอกว่า
 * "เข้ามาเท่าไร" หรือ "ออกไปเท่าไร" ไม่ใช่ "ตอนนี้เหลือเท่าไร"
 * ใช้ตอนรับของที่ไม่ได้เปิดใบซื้อ หรือเบิกของไปใช้ในอู่เอง และย้อนวันที่ได้
 *
 * ลงเป็น reason = 'adjust' เพราะไม่มีเอกสารอ้าง — ชนิดอื่นในฐานข้อมูลบังคับให้ต้องมี doc_id
 */
export async function recordStockMove(input: {
  productId: string;
  direction: 'in' | 'out';
  qty: number;
  movedOn: string;
  note: string;
}): Promise<void> {
  return mutate('stock', async (c, userId) => {
    const qty = Math.abs(Math.round(input.qty * 1000) / 1000);
    if (qty === 0) throw new Error('ระบุจำนวนมากกว่า 0');

    const delta = input.direction === 'in' ? qty : -qty;
    const fallback = input.direction === 'in' ? 'รับเข้าด้วยมือ' : 'ตัดออกด้วยมือ';

    await c.query(
      `insert into stock_moves (tenant_id, product_id, moved_on, qty_delta, reason, note, created_by)
       values (current_tenant_id(), $1, $2, $3, 'adjust', $4, $5)`,
      [input.productId, input.movedOn, delta, input.note || fallback, userId],
    );
  });
}

export async function createCategory(name: string): Promise<string> {
  return mutate('stock', async (c) => {
    const { rows } = await c.query(
      `insert into product_categories (tenant_id, name, sort_order)
       values (current_tenant_id(), $1,
               coalesce((select max(sort_order) + 1 from product_categories), 0))
       returning id`,
      [name],
    );
    return rows[0].id;
  });
}

export async function renameCategory(id: string, name: string): Promise<void> {
  return mutate('stock', async (c) => {
    await c.query(`update product_categories set name = $2 where id = $1`, [id, name]);
  });
}

/** ลบหมวดหมู่ — สินค้าที่อยู่ในหมวดนั้นจะกลายเป็นไม่ระบุหมวด ไม่หายไปไหน */
export async function deleteCategory(id: string): Promise<void> {
  return mutate('stock', async (c) => {
    await c.query(`delete from product_categories where id = $1`, [id]);
  });
}
