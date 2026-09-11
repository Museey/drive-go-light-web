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
    select m.product_id, m.expires_on, m.qty_delta, m.unit_cost,
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
    /*
     * qty คือของที่ยังเหลือในล็อตนั้น ไม่ใช่ทั้งล็อต —
     * ล็อตที่คร่อมเส้นแบ่งถูกตัดไปแล้วบางส่วน ยอดสะสมลบยอดที่ตัดออกไปแล้ว
     * จึงได้เศษที่เหลือจริง ส่วนล็อตที่ยังไม่ถูกแตะเลยได้เต็มจำนวน
     */
    select r.product_id, r.expires_on, r.unit_cost,
           least(r.qty_delta, r.cum - coalesce(u.out_qty, 0)) as qty
      from recv r
      left join used u on u.product_id = r.product_id
     where r.expires_on is not null
       and r.cum > coalesce(u.out_qty, 0)
  )`;

/**
 * วันหมดอายุที่ใกล้ที่สุดของแต่ละสินค้า — เฉพาะที่ยังมีของเหลือ
 *
 * ส่ง ids มาด้วยได้ถ้าสนใจแค่ไม่กี่ตัว เช่นตอนเปิดเอกสารที่มีอะไหล่อยู่สิบบรรทัด
 * ไม่งั้นต้องเล่นประวัติสต๊อกทั้งร้านเพื่อตอบเรื่องของสิบตัว
 */
export async function nearestExpiryWith(
  c: Client,
  ids?: string[],
): Promise<Map<string, string>> {
  const { rows } = await c.query(
    `${REMAINING_LOTS_SQL}
     select product_id, min(expires_on)::text as nearest
       from remaining
      where $1::uuid[] is null or product_id = any($1::uuid[])
      group by product_id`,
    /* รายการว่างแปลว่า "ไม่ถามถึงสินค้าตัวไหนเลย" ต้องได้ผลว่าง
       ไม่ใช่กลายเป็นถามทั้งร้าน — ส่ง null เฉพาะตอนไม่ได้ส่ง ids มาจริง ๆ */
    [ids ?? null],
  );
  return new Map(rows.map((r) => [r.product_id as string, r.nearest as string]));
}

export interface ExpiringLotRow {
  productId: string;
  code: string;
  name: string;
  unit: string;
  categoryName: string | null;
  expiresOn: string;
  /** เหลืออีกกี่วัน ติดลบคือเลยมาแล้ว */
  daysLeft: number;
  /** ของที่เหลือในล็อตนั้น ไม่ใช่ยอดคงเหลือทั้งสินค้า */
  qty: number;
  unitCost: number;
  value: number;
}

/**
 * ของใกล้หมดอายุและหมดอายุแล้ว **แยกรายล็อต** เรียงจากด่วนที่สุด
 *
 * ตอบรายล็อต ไม่ใช่รายสินค้า — หน้า 05.1.1 ต้องบอกได้ว่าของที่ต้องจัดการมีกี่ชิ้น
 * ไม่ใช่แค่ว่าสินค้าตัวนี้มีปัญหา
 * น้ำมันเครื่อง 40 ขวดที่หมดอายุ 3 ขวด กับที่หมดอายุทั้ง 40 ขวด ต้องอ่านออกว่าต่างกัน
 *
 * ล็อตที่รับเข้าคนละครั้งแต่หมดอายุวันเดียวกันถูกรวมเป็นบรรทัดเดียว —
 * คนไปหยิบของบนชั้นดูวันบนกล่อง ไม่ได้ดูว่ารับเข้ามาตอนไหน
 */
export async function listExpiringLotsWith(
  c: Client,
  warnDays: number,
): Promise<ExpiringLotRow[]> {
  const { rows } = await c.query(
    `${REMAINING_LOTS_SQL}
     select r.product_id, p.code, p.name, p.unit,
            g.name as category_name,
            r.expires_on::text as expires_on,
            (r.expires_on - current_date)::int as days_left,
            sum(r.qty) as qty,
            sum(r.qty * r.unit_cost) as value
       from remaining r
       join products p on p.id = r.product_id
       left join product_categories g on g.id = p.category_id
      where p.active
        and r.expires_on <= current_date + ($1::int * interval '1 day')
      group by r.product_id, p.code, p.name, p.unit, g.name, r.expires_on
      order by r.expires_on, p.code`,
    [warnDays],
  );

  return rows.map((r) => {
    const qty = Number(r.qty ?? 0);
    const value = Math.round(Number(r.value ?? 0) * 100) / 100;
    return {
      productId: r.product_id,
      code: r.code,
      name: r.name,
      unit: r.unit ?? '',
      categoryName: r.category_name ?? null,
      expiresOn: r.expires_on,
      daysLeft: Number(r.days_left),
      qty,
      /* ต้นทุนของล็อตนั้นเอง ไม่ใช่ทุนล่าสุดของสินค้า — ของที่ซื้อมาแพงขึ้นทีหลัง
         ไม่ควรทำให้ล็อตเก่าที่กำลังจะหมดอายุดูมีมูลค่ามากกว่าที่จ่ายไปจริง */
      unitCost: qty === 0 ? 0 : Math.round((value / qty) * 100) / 100,
      value,
    };
  });
}

export interface ExpirySummary {
  /** ล็อตที่ใกล้หมดอายุหรือหมดอายุแล้ว นับรายล็อตเหมือนหน้ารายการ */
  count: number;
  /** ในจำนวนนั้น เลยวันหมดอายุไปแล้วกี่ล็อต */
  expired: number;
  /** มูลค่าตามต้นทุนล่าสุดของของที่เหลือในล็อตเหล่านั้น */
  value: number;
}

/**
 * ตัวเลขสำหรับการ์ดหน้าแรก
 *
 * **นับรายล็อตและคิดมูลค่าเฉพาะของที่เหลือในล็อตนั้น** ให้ตรงกับหน้าที่การ์ดพาไป —
 * ตอนแรกนับรายสินค้าและคิดมูลค่าจากยอดคงเหลือทั้งตัว ผลคือการ์ดขึ้น 63,685 บาท
 * แล้วกดเข้าไปเห็น 15,040 บาท โดยไม่มีอะไรบนหน้าจออธิบายว่าทำไมต่างกัน
 *
 * (ป้ายในทะเบียนสินค้ายังนับรายสินค้าอยู่ ซึ่งถูกแล้ว เพราะตารางนั้นหนึ่งแถวคือหนึ่งสินค้า)
 *
 * เกณฑ์วันอ่านจากข้อมูลร้านใน SQL เอง ไม่ได้รับมาจากผู้เรียก
 */
export async function expiringSummaryWith(c: Client): Promise<ExpirySummary> {
  const { rows } = await c.query(
    `${REMAINING_LOTS_SQL}
     select count(*)::int as n,
            count(*) filter (where r.expires_on < current_date)::int as past,
            coalesce(sum(r.qty * r.unit_cost), 0) as value
       from remaining r
       join products p on p.id = r.product_id
       join tenants t on t.id = current_tenant_id()
      where p.active
        and r.expires_on <= current_date + (t.expiry_warn_days * interval '1 day')`,
  );
  return {
    count: Number(rows[0].n),
    expired: Number(rows[0].past),
    value: Math.round(Number(rows[0].value ?? 0) * 100) / 100,
  };
}
