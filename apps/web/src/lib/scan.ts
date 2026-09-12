import type pg from 'pg';

/**
 * หาสินค้าจากสิ่งที่ยิงหรือพิมพ์เข้ามา
 *
 * แยกออกมาจาก stock-counts.ts เพราะตอนนี้ใช้สองที่ — ใบตรวจนับกับหน้าออกเอกสาร
 * **กติกาการค้นต้องเป็นชุดเดียวกัน** ไม่งั้นยิงบาร์โค้ดเดียวกันสองหน้าแล้วได้คนละตัว
 * ซึ่งเป็นความผิดพลาดที่ไม่มีใครสงสัยจนกว่าจะเจอของผิดในใบเสร็จ
 *
 * ไม่มี `server-only` — ชุดทดสอบเรียกได้โดยส่ง client เข้ามาเอง
 */

type Client = pg.PoolClient | pg.Client;

export type ScanHit =
  | { kind: 'one'; productId: string }
  /** เจอแต่ปิดใช้งานอยู่ — ต่างจากไม่พบ และต้องบอกคนละแบบ */
  | { kind: 'inactive'; code: string; name: string }
  | { kind: 'many'; count: number }
  | { kind: 'none' };

/**
 * ลำดับการค้นหา — **บาร์โค้ดตรงเป๊ะมาก่อนเสมอ**
 *
 * บาร์โค้ด → รหัสร้าน → รหัส OEM แบบตรงตัว แล้วค่อยค้นแบบมีบางส่วนตรงกัน
 * ลำดับนี้สำคัญเพราะรหัสร้านของสินค้าตัวหนึ่งอาจไปตรงกับส่วนหนึ่งของชื่อสินค้าอีกตัว
 * ถ้าไม่เรียงให้ตรงเป๊ะชนะก่อน การยิงจะได้ของผิดเป็นครั้งคราวโดยไม่มีรูปแบบ
 */
export async function findByScanWith(c: Client, term: string): Promise<ScanHit> {
  const v = term.trim();
  if (!v) return { kind: 'none' };

  const exact = await c.query(
    `select id, active, code, name from products
      where upper(barcode) = upper($1)
         or upper(code) = upper($1)
         or upper(oem) = upper($1)
      /* **ตัวที่ยังเปิดใช้งานมาก่อนเสมอ** แล้วค่อยเรียงตามชนิดที่ตรง —
         ของที่ปิดใช้งานขายไม่ได้อยู่แล้ว การคืนมันมาแทนตัวที่ใช้ได้คือทางตัน
         ผลคือจะตอบว่า "ปิดใช้งานอยู่" ก็ต่อเมื่อไม่มีตัวที่เปิดใช้งานตรงเลย
         ซึ่งเป็นตอนที่คนยิงต้องรู้จริง ๆ */
      order by active desc,
               case when upper(barcode) = upper($1) then 0
                    when upper(code) = upper($1) then 1 else 2 end
      limit 1`,
    [v],
  );

  if (exact.rows[0]) {
    const r = exact.rows[0];
    return r.active
      ? { kind: 'one', productId: r.id as string }
      : { kind: 'inactive', code: r.code as string, name: r.name as string };
  }

  const fuzzy = await c.query(
    `select id from products
      where active and (barcode ilike $1 or code ilike $1
                     or name ilike $1 or oem ilike $1)
      limit 2`,
    [`%${v}%`],
  );
  if (fuzzy.rows.length === 1) return { kind: 'one', productId: fuzzy.rows[0].id as string };
  if (fuzzy.rows.length === 0) return { kind: 'none' };

  const all = await c.query(
    `select count(*)::int as c from products
      where active and (barcode ilike $1 or code ilike $1
                     or name ilike $1 or oem ilike $1)`,
    [`%${v}%`],
  );
  return { kind: 'many', count: Number(all.rows[0].c) };
}

export interface ScanInput {
  /** จำนวนที่ขอ — ไม่ได้ระบุมาคือ 1 */
  qty: number;
  /** สิ่งที่เอาไปค้นจริง */
  term: string;
}

/**
 * แยก "จำนวน" ออกจาก "รหัส" ที่ยิงหรือพิมพ์มาในช่องเดียวกัน
 *
 * ขายสี่สิบตัวแล้วต้องยิงสี่สิบครั้งคือของที่ใช้จริงไม่ได้ เครื่องขายหน้าร้านทั่วไป
 * จึงให้พิมพ์จำนวนนำหน้าแล้วคั่นด้วยเครื่องหมาย — `40*ABC123`
 *
 * **ต้องมีตัวคั่นเสมอ** ห้ามเดาจากตัวเลขนำหน้าเฉย ๆ เพราะบาร์โค้ดจำนวนมาก
 * ขึ้นต้นด้วยตัวเลข (EAN/UPC เป็นตัวเลขล้วนทั้งอัน) ถ้าเดา การยิงของที่ขึ้นต้น
 * ด้วยเลขจะกลายเป็นจำนวนมหาศาลเงียบ ๆ
 *
 * รับทั้ง `*` และ `x`/`X` เพราะ `*` ต้องกด Shift ส่วน `x` อยู่บนแป้นเดียวกัน
 * ทั้งผังไทยและอังกฤษ — คนกรอกไม่ต้องสลับภาษาก่อนพิมพ์จำนวน
 */
export function parseScan(raw: string): ScanInput {
  const v = raw.trim();
  const m = /^(\d+(?:\.\d+)?)\s*[*xX]\s*(.+)$/.exec(v);
  if (!m) return { qty: 1, term: v };

  const qty = Number(m[1]);
  if (!Number.isFinite(qty) || qty <= 0) return { qty: 1, term: v };
  return { qty, term: m[2]!.trim() };
}
