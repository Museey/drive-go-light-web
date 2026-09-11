import type pg from 'pg';

/**
 * วันหมดอายุของล็อตที่ยังเหลือของอยู่
 *
 * อยู่ไฟล์นี้เพราะไม่มี `server-only` จึงเรียกจากชุดทดสอบได้โดยส่ง client เข้ามาเอง
 *
 * **ไม่ทำเป็นวิว** ทั้งที่เขียนเป็นวิวได้ เพราะวิวในฐานนี้ไม่ได้ตั้ง `security_invoker`
 * จึงถูกประเมินด้วยสิทธิ์ของเจ้าของวิว ไม่ใช่ของคนเรียก ซึ่งเป็นกับดัก RLS
 * แบบเดียวกับที่เคยทำให้ db-census อ่านไม่เห็นอะไรเลยบนเครื่องจริง
 * ใช้ CTE ที่แชร์กันแทน — โค้ดยาวขึ้นนิดเดียว แต่ไม่เพิ่มพื้นผิวให้พลาด
 */

type Client = pg.PoolClient | pg.Client;

/**
 * ล็อตที่ยังเหลือของ พร้อมวันหมดอายุ
 *
 * ไล่ยอดสะสมของล็อตตามลำดับที่ **หมดอายุก่อนออกก่อน** แล้วเทียบกับยอดที่ตัดออกไปแล้ว
 * ล็อตที่ยอดสะสมเกินยอดตัดออก คือล็อตที่ยังมีของเหลือ
 *
 * `(expires_on is null)` มาก่อนใน order by — Postgres เรียง false ก่อน true
 * ล็อตที่มีวันหมดอายุจึงอยู่หน้าล็อตที่ไม่มี ตรงกับที่ fifoAdd() แทรกไว้
 *
 * **ข้อจำกัดที่รู้ตัว** — ไม่ได้จำลองกติกา "ของคืนเข้าหน้าแถว" ของ fifoReturn()
 * อู่ที่เพิ่งยกเลิกใบเสร็จแล้วของคืนเข้าคลัง ตัวเลขอาจต่างจากคิวจริงหนึ่งล็อต
 * ยอมรับได้เพราะตัวนี้ใช้**เตือน** ไม่ได้ใช้คิดต้นทุน ส่วนต้นทุนยังเล่นบัญชีเต็มเหมือนเดิม
 */
export const REMAINING_LOTS_SQL = `
  with recv as (
    select m.product_id, m.expires_on,
           sum(m.qty_delta) over (
             partition by m.product_id
             order by (m.expires_on is null), m.expires_on, m.moved_on, m.created_at
             rows between unbounded preceding and current row
           ) as cum
      from stock_moves m
     where m.qty_delta > 0
  ),
  used as (
    select product_id, -sum(qty_delta) as out_qty
      from stock_moves where qty_delta < 0 group by product_id
  ),
  remaining as (
    select r.product_id, r.expires_on
      from recv r
      left join used u on u.product_id = r.product_id
     where r.expires_on is not null
       and r.cum > coalesce(u.out_qty, 0)
  )`;

/** วันหมดอายุที่ใกล้ที่สุดของแต่ละสินค้า — เฉพาะที่ยังมีของเหลือ */
export async function nearestExpiryWith(c: Client): Promise<Map<string, string>> {
  const { rows } = await c.query(
    `${REMAINING_LOTS_SQL}
     select product_id, min(expires_on)::text as nearest
       from remaining group by product_id`,
  );
  return new Map(rows.map((r) => [r.product_id as string, r.nearest as string]));
}

export interface ExpiringLot {
  productId: string;
  code: string;
  name: string;
  unit: string;
  expiresOn: string;
  /** เหลืออีกกี่วัน ติดลบคือเลยมาแล้ว */
  daysLeft: number;
  qtyOnHand: number;
  lastCost: number;
}

/**
 * ของที่ใกล้หมดอายุหรือหมดอายุแล้ว เรียงจากด่วนที่สุด
 *
 * นับเฉพาะสินค้าที่ยังเปิดใช้งาน — ของที่ปิดไปแล้วไม่ต้องมาเตือนให้รก
 */
export async function listExpiringWith(
  c: Client,
  warnDays: number,
): Promise<ExpiringLot[]> {
  const { rows } = await c.query(
    `${REMAINING_LOTS_SQL}
     select r.product_id, p.code, p.name, p.unit, p.last_cost,
            min(r.expires_on)::text as expires_on,
            (min(r.expires_on) - current_date)::int as days_left,
            max(s.qty_on_hand) as qty_on_hand
       from remaining r
       join products p on p.id = r.product_id
       join product_stock s on s.product_id = p.id
      where p.active
      group by r.product_id, p.code, p.name, p.unit, p.last_cost
     having min(r.expires_on) <= current_date + ($1::int * interval '1 day')
      order by 6, p.code`,
    [warnDays],
  );

  return rows.map((r) => ({
    productId: r.product_id,
    code: r.code,
    name: r.name,
    unit: r.unit ?? '',
    expiresOn: r.expires_on,
    daysLeft: Number(r.days_left),
    qtyOnHand: Number(r.qty_on_hand ?? 0),
    lastCost: Number(r.last_cost ?? 0),
  }));
}
