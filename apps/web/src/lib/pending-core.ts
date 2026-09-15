/**
 * รายการค้างทำ — ตัวที่รับ client ที่ตั้ง tenant แล้ว (เทสต์เรียกได้ตรง ๆ)
 * ตัวที่ผูกกับ session และสิทธิ์อยู่ใน pending.ts
 *
 * "ค้างทำ" = บรรทัดเอกสารที่ไม่ผูกทะเบียนสินค้า — ยกเว้นบรรทัดชุดอะไหล่ (029)
 * ซึ่งไม่มี product_id โดยตั้งใจ ถ้าไม่กันไว้ ขายชุดทุกครั้งจะขึ้นเป็นรายการค้างทำ
 * และผูกชื่อชุดเข้าสินค้าจะเขียน product_id ทับบรรทัดชุด (ตัดสต๊อกผิดตัวตอนยกเลิก/กู้คืน)
 */
import type pg from 'pg';

type Client = pg.PoolClient | pg.Client;

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
   * ใช้ตอนตั้งราคาขายให้สินค้าตัวนี้ตอนลงทะเบียนจริง — ไม่มีคอลัมน์
   * ต้องเปิดเอกสารย้อนไปดูเองว่าครั้งก่อนขายไปเท่าไหร่
   */
  lastPrice: number;
}

export async function listPendingItemsWith(c: Client): Promise<PendingItem[]> {
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
         and i.kit_id is null
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
}

/**
 * ผูกชื่อที่ค้างอยู่เข้ากับสินค้าในทะเบียน — คืนจำนวนบรรทัดที่ผูก
 *
 * แก้เฉพาะ product_id ของบรรทัด ไม่แตะชื่อหรือราคาที่พิมพ์ไว้บนเอกสาร
 * เอกสารที่ออกไปแล้วต้องหน้าตาเหมือนเดิมเสมอ
 *
 * ไม่ย้อนไปตัดสต๊อกให้ด้วย เพราะยอดคงเหลือปัจจุบันนับจากของที่มีอยู่จริงอยู่แล้ว
 * การตัดย้อนหลังจะทำให้ยอดติดลบโดยไม่มีเหตุผล
 */
export async function linkPendingWith(c: Client, nameNorm: string, productId: string): Promise<number> {
  const { rowCount } = await c.query(
    `update doc_items i
        set product_id = $2
       from documents d
      where d.id = i.doc_id
        and i.product_id is null
        and i.kit_id is null
        and d.status <> 'void'
        and lower(regexp_replace(btrim(i.name), '\\s+', ' ', 'g')) = $1`,
    [nameNorm, productId],
  );
  return rowCount ?? 0;
}
