import 'server-only';
import { query } from './auth';
import { mutate } from './mutate';

/**
 * รายการค้างทำ — ชื่อสินค้าที่พนักงานพิมพ์ลงเอกสารเองโดยไม่ได้เลือกจากทะเบียน
 *
 * รายการพวกนี้ไม่มีรหัสสินค้า จึงไม่ถูกตัดสต๊อกและไม่เข้าการคำนวณต้นทุน
 * เมนูนี้มีไว้ให้ตามเก็บทีหลัง — ผูกเข้าทะเบียนที่มีอยู่ หรือสั่งข้ามถ้าเป็นของที่ไม่ต้องมีรหัส
 * (เช่น ค่าส่ง ค่าทำสี ที่ไม่ใช่อะไหล่ในสต๊อก)
 */

const normName = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();

export interface PendingItem {
  nameNorm: string;
  /** ชื่อที่พบล่าสุด ใช้แสดงผล */
  name: string;
  lineCount: number;
  totalQty: number;
  lastUsedOn: string;
  lastDocNo: string;
  /**
   * ราคาต่อหน่วยของบรรทัดล่าสุดที่พูดถึงชื่อนี้
   *
   * ใช้ตอนตั้งราคาขายให้สินค้าตัวนี้ตอนลงทะเบียนจริง — ไม่มีคอลัมน์นี้
   * ต้องเปิดเอกสารย้อนไปดูเองว่าครั้งก่อนขายไปเท่าไหร่
   */
  lastPrice: number;
}

export async function listPendingItems(): Promise<PendingItem[]> {
  return query(async (c) => {
    const { rows } = await c.query(
      `with lines as (
         select i.name,
                lower(regexp_replace(btrim(i.name), '\\s+', ' ', 'g')) as name_norm,
                i.qty, i.unit_price, d.doc_date, d.doc_no,
                row_number() over (
                  partition by lower(regexp_replace(btrim(i.name), '\\s+', ' ', 'g'))
                  order by d.doc_date desc, d.doc_no desc
                ) as rn
         from doc_items i
         join documents d on d.id = i.doc_id
         where i.product_id is null
           and d.status <> 'void'
           and btrim(i.name) <> ''
           and i.code <> 'LAB'
           and not i.is_service
       )
       select name_norm,
              max(name) filter (where rn = 1) as name,
              count(*)::int as line_count,
              sum(qty) as total_qty,
              max(doc_date) filter (where rn = 1) as last_used_on,
              max(doc_no) filter (where rn = 1) as last_doc_no,
              max(unit_price) filter (where rn = 1) as last_price
       from lines
       where name_norm not in (select name_norm from ignored_item_names)
       group by name_norm
       order by count(*) desc, name_norm`,
    );

    return rows.map((r) => ({
      nameNorm: r.name_norm,
      name: r.name,
      lineCount: r.line_count,
      totalQty: Number(r.total_qty),
      lastUsedOn: r.last_used_on,
      lastDocNo: r.last_doc_no,
      lastPrice: Number(r.last_price ?? 0),
    }));
  });
}

export async function countIgnoredItems(): Promise<number> {
  return query(async (c) => {
    const { rows } = await c.query(`select count(*)::int as c from ignored_item_names`);
    return rows[0].c;
  });
}

/**
 * ผูกชื่อที่ค้างอยู่เข้ากับสินค้าในทะเบียน
 *
 * แก้เฉพาะ product_id ของบรรทัด ไม่แตะชื่อหรือราคาที่พิมพ์ไว้บนเอกสาร
 * เอกสารที่ออกไปแล้วต้องหน้าตาเหมือนเดิมเสมอ
 *
 * ไม่ย้อนไปตัดสต๊อกให้ด้วย เพราะยอดคงเหลือปัจจุบันนับจากของที่มีอยู่จริงอยู่แล้ว
 * การตัดย้อนหลังจะทำให้ยอดติดลบโดยไม่มีเหตุผล
 */
export async function linkPendingToProduct(nameNorm: string, productId: string): Promise<number> {
  return mutate('stock', async (c) => {
    const { rowCount } = await c.query(
      `update doc_items i
          set product_id = $2
         from documents d
        where d.id = i.doc_id
          and i.product_id is null
          and d.status <> 'void'
          and lower(regexp_replace(btrim(i.name), '\\s+', ' ', 'g')) = $1`,
      [nameNorm, productId],
    );
    return rowCount ?? 0;
  }, { sub: 'pending' });
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

    const { rowCount } = await c.query(
      `update doc_items i
          set product_id = $2
         from documents d
        where d.id = i.doc_id
          and i.product_id is null
          and d.status <> 'void'
          and lower(regexp_replace(btrim(i.name), '\\s+', ' ', 'g')) = $1`,
      [nameNorm, productId],
    );

    return { productId, linked: rowCount ?? 0 };
  }, { sub: 'pending' });
}
