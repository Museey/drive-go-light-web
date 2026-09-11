import type pg from 'pg';
import { BOOK_UNIT_COST_SQL, BOOK_VALUE_SQL, consumeStock, receiveStock } from './stock-cost';

/**
 * ใบตรวจนับสต๊อก — เดินนับของจริงในชั้นวางแล้วปรับยอดในระบบให้ตรง
 *
 * กติกาสำคัญสามข้อที่ยกมาจากรุ่น 6.4
 *
 * 1. **"ระบบว่ามี" คิดสดตอนเป็นร่าง** เผื่อมีการขายหรือรับของระหว่างที่นับค้างไว้
 *    ตรึงลง system_qty ตอนกดปรับยอดเท่านั้น หลังจากนั้นใบกลายเป็นหลักฐาน
 * 2. **ช่องว่างไม่ใช่ศูนย์** — null = ยังไม่ได้กรอก · 0 = นับแล้วไม่เจอเลย
 *    ถ้าตีค่าว่างเป็นศูนย์ ใบที่นับไปครึ่งเดียวจะตัดสต๊อกอีกครึ่งเป็นศูนย์ทั้งหมด
 * 3. **รายการที่นับได้ตรงกับระบบไม่ถูกแตะเลย** ไม่มีแถวในบัญชีสต๊อก
 *    ใบหนึ่งมีหลายร้อยรายการแต่ที่ต่างจริงมักมีไม่กี่สิบ
 *
 * ไม่มี server-only เพราะทุกฟังก์ชันรับ client เข้ามา ชุดทดสอบจึงเรียกได้ตรง ๆ
 */

const n = (v: unknown): number => Number(v ?? 0);
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** ต่ำกว่านี้ถือว่าตรงกัน — ค่าเดียวกับ ctOff() ของรุ่น 6.4 */
export const COUNT_EPS = 0.0005;

type Client = pg.PoolClient | pg.Client;

export interface CountItem {
  id: string;
  productId: string;
  code: string;
  name: string;
  unit: string;
  /** null = ยังไม่ได้กรอก */
  countedQty: number | null;
  /**
   * ร่าง = ยอดสด · ปรับแล้ว = ยอดที่ตรึงไว้ตอนปรับ
   * null ได้เฉพาะบรรทัดที่ไม่เคยกรอกบนใบที่ปรับยอดไปแล้ว — บรรทัดนั้นไม่ถูกแตะเลย
   * จึงไม่มียอดที่ตรึงไว้ และการแสดงศูนย์จะทำให้เข้าใจผิดว่าเคยนับได้ศูนย์
   */
  systemQty: number | null;
  unitCost: number;
  note: string;
  /** null เมื่อยังไม่ได้กรอก — ต่างจาก 0 ที่แปลว่านับได้เท่าระบบพอดี */
  diff: number | null;
  diffValue: number | null;
}

export interface CountRow {
  id: string;
  no: string;
  countDate: string;
  note: string;
  status: 'draft' | 'applied';
  applied: boolean;
  /** จำนวนรายการทั้งใบ */
  lines: number;
  /** กรอกแล้วกี่รายการ */
  done: number;
  /** นับได้ต่างจากระบบกี่รายการ */
  offCount: number;
  /**
   * มูลค่าส่วนต่างรวม — ลบคือของหาย
   *
   * **ต้องซ่อนจากคนที่ไม่มีสิทธิ์เห็นต้นทุน** ตัวเลขนี้หารด้วยจำนวนที่ต่างกัน
   * แล้วได้ต้นทุนต่อหน่วยกลับมา ซึ่งเป็นสิ่งที่อู่ตั้งใจไม่ให้พนักงานบางคนเห็น
   */
  offValue: number;
}

export interface StockCount extends CountRow {
  items: CountItem[];
}

/**
 * มูลค่าส่วนต่างของบรรทัดหนึ่ง — **เป็นเงินที่ตัดจริง ไม่ใช่ส่วนต่าง × ต้นทุนต่อหน่วย**
 *
 * ของที่หายไปถูกตัดตามล็อตแบบเข้าก่อนออกก่อน หาย 15 ชิ้นอาจเป็น 10 ที่ 100
 * บวก 5 ที่ 150 การคูณด้วยราคาต่อหน่วยราคาเดียวจึงไม่มีวันตรงกับที่ลงงบ
 *
 * ใบที่ยังเป็นร่างยังไม่มีอะไรถูกตัด และใบเก่าที่ปรับยอดไปก่อนมีคอลัมน์นี้
 * ก็ไม่มีค่าเก็บไว้ — สองกรณีนั้นถอยไปประมาณจากต้นทุนต่อหน่วยเหมือนเดิม
 * ดีกว่าแสดงศูนย์ซึ่งอ่านว่า "ตรวจแล้วไม่มีส่วนต่าง"
 */
const DIFF_VALUE_SQL = `
  case when i.cost_amount is not null
       then sign(i.counted_qty - i.system_qty) * i.cost_amount
       else (i.counted_qty - i.system_qty) * i.unit_cost end`;

/*
 * `off_lines` กับ `off_value` คิดเฉพาะบรรทัดที่กรอกแล้วและต่างจากระบบเกินค่าคลาดเคลื่อน
 * — เงื่อนไขชุดเดียวกับที่หน้ารายละเอียดใช้ ตัวเลขสองหน้าจึงตรงกันเสมอ
 */
const HEAD = `
  select c.id, c.no, c.count_date::text as count_date, c.note, c.status::text as status,
         count(i.id)::int as lines,
         count(i.counted_qty)::int as done,
         count(*) filter (
           where i.counted_qty is not null
             and abs(i.counted_qty - i.system_qty) > ${COUNT_EPS}
         )::int as off_count,
         coalesce(sum(
           case when i.counted_qty is not null
                 and abs(i.counted_qty - i.system_qty) > ${COUNT_EPS}
                then ${DIFF_VALUE_SQL} else 0 end
         ), 0) as off_value
  from stock_counts c
  left join stock_count_items i on i.count_id = c.id`;

const toRow = (r: Record<string, unknown>): CountRow => ({
  id: r.id as string,
  no: r.no as string,
  countDate: r.count_date as string,
  note: (r.note as string) ?? '',
  status: r.status as 'draft' | 'applied',
  applied: r.status === 'applied',
  lines: n(r.lines),
  done: n(r.done),
  offCount: n(r.off_count),
  offValue: round2(n(r.off_value)),
});

export interface CountListResult {
  rows: CountRow[];
  drafts: number;
  /** จำนวนรายการที่ปรับยอดไปแล้วทั้งหมด */
  adjusted: number;
  /** มูลค่าส่วนต่างสะสมจากใบที่ปรับแล้ว */
  adjustedValue: number;
}

export async function listCounts(
  c: Client,
  opts: { search?: string; from?: string; to?: string; limit?: number } = {},
): Promise<CountListResult> {
  const params: unknown[] = [];
  const where: string[] = [];

  const term = (opts.search ?? '').trim();
  if (term) {
    params.push(`%${term}%`);
    where.push(`(c.no ilike $${params.length} or c.note ilike $${params.length})`);
  }
  if (opts.from) { params.push(opts.from); where.push(`c.count_date >= $${params.length}`); }
  if (opts.to) { params.push(opts.to); where.push(`c.count_date <= $${params.length}`); }
  const filter = where.length ? `where ${where.join(' and ')}` : '';

  const { rows } = await c.query(
    `${HEAD} ${filter}
     group by c.id
     order by c.count_date desc, c.no desc
     limit ${Math.min(opts.limit ?? 200, 500)}`,
    params,
  );

  /* ยอดสรุปคิดจากใบที่ปรับยอดแล้วเท่านั้น — ร่างยังไม่เกิดอะไรขึ้นกับสต๊อก
     และใช้ค่าที่ตรึงไว้ ไม่ใช่ยอดสด เพราะเป็นประวัติว่าเคยพบส่วนต่างเท่าไร */
  const sum = await c.query(
    `select
       count(*) filter (where c.status = 'draft')::int as drafts,
       coalesce(sum(x.off_lines), 0)::int as adjusted,
       coalesce(sum(x.off_value), 0) as adjusted_value
     from stock_counts c
     left join lateral (
       select count(*)::int as off_lines,
              coalesce(sum(${DIFF_VALUE_SQL}), 0) as off_value
       from stock_count_items i
       where i.count_id = c.id and c.status = 'applied'
         and i.counted_qty is not null
         and abs(i.counted_qty - i.system_qty) > ${COUNT_EPS}
     ) x on true`,
  );

  return {
    rows: rows.map(toRow),
    drafts: n(sum.rows[0].drafts),
    adjusted: n(sum.rows[0].adjusted),
    adjustedValue: round2(n(sum.rows[0].adjusted_value)),
  };
}

/**
 * ใบเดียวพร้อมรายการ
 *
 * ร่างอ่าน "ระบบว่ามี" สดจาก product_stock ทุกครั้ง — ค่าที่เก็บไว้แล้วต้องคอยเขียนทับ
 * คือค่าที่วันหนึ่งจะลืมเขียนทับ ส่วนใบที่ปรับแล้วใช้ค่าที่ตรึงไว้เพราะเป็นหลักฐาน
 */
export async function getCount(c: Client, id: string): Promise<StockCount | null> {
  const { rows } = await c.query(
    `${HEAD} where c.id = $1 group by c.id`, [id],
  );
  const head = rows[0];
  if (!head) return null;
  const applied = head.status === 'applied';

  const items = await c.query(
    `select i.id, i.product_id, i.counted_qty, i.note, i.cost_amount,
            p.code, p.name, p.unit,
            case when $2 then i.system_qty else coalesce(s.qty_on_hand, 0) end as system_qty,
            case when $2 then i.unit_cost  else ${BOOK_UNIT_COST_SQL} end as unit_cost
     from stock_count_items i
     join products p on p.id = i.product_id
     left join product_stock s on s.product_id = i.product_id
     left join ${BOOK_VALUE_SQL} bv on bv.product_id = i.product_id
     where i.count_id = $1
     order by i.line_no`,
    [id, applied],
  );

  const list: CountItem[] = items.rows.map((r) => {
    const counted = r.counted_qty === null ? null : n(r.counted_qty);
    const system = r.system_qty === null ? null : n(r.system_qty);
    const cost = n(r.unit_cost);
    const diff = (counted === null || system === null) ? null : round3(counted - system);
    /* เป็นเงินที่ตัดจริงถ้ามี ไม่งั้นประมาณจากต้นทุนต่อหน่วย — ดู DIFF_VALUE_SQL */
    const booked = r.cost_amount === null || r.cost_amount === undefined
      ? null : n(r.cost_amount);
    return {
      id: r.id,
      productId: r.product_id,
      code: r.code ?? '',
      name: r.name ?? '',
      unit: r.unit ?? '',
      countedQty: counted,
      systemQty: system,
      unitCost: cost,
      note: r.note ?? '',
      diff,
      diffValue: diff === null ? null
        : booked === null ? round2(diff * cost)
        : round2(Math.sign(diff) * booked),
    };
  });

  const off = list.filter((i) => i.diff !== null && Math.abs(i.diff) > COUNT_EPS);

  return {
    ...toRow(head),
    items: list,
    offCount: off.length,
    offValue: round2(off.reduce((s, i) => s + (i.diffValue ?? 0), 0)),
  };
}

/** เปิดใบร่างใหม่ */
export async function createCount(
  c: Client,
  input: { countDate: string; note?: string },
  userId: string | null,
): Promise<{ id: string; no: string }> {
  const seq = await c.query(`select next_count_no(current_tenant_id(), '') as no`);
  const ym = input.countDate.slice(0, 4) + input.countDate.slice(5, 7);
  const no = `CT-${ym}-${String(n(seq.rows[0].no)).padStart(3, '0')}`;

  const { rows } = await c.query(
    `insert into stock_counts (tenant_id, no, count_date, note, created_by)
     values (current_tenant_id(),$1,$2,$3,$4) returning id`,
    [no, input.countDate, input.note ?? '', userId],
  );
  return { id: rows[0].id, no };
}

/** ใบที่ปรับยอดแล้วห้ามแก้ — เรียกก่อนทุกการเขียน */
async function requireDraft(c: Client, id: string): Promise<void> {
  const { rows } = await c.query(
    `select status::text as status, no from stock_counts where id = $1`, [id],
  );
  if (!rows[0]) throw new Error('ไม่พบใบตรวจนับ');
  if (rows[0].status === 'applied') {
    throw new Error(`${rows[0].no} ปรับยอดไปแล้ว แก้ไขไม่ได้ — ถ้านับผิดให้เปิดใบใหม่นับใหม่`);
  }
}

export async function saveCountHead(
  c: Client, id: string, input: { countDate: string; note: string },
): Promise<void> {
  await requireDraft(c, id);
  await c.query(
    `update stock_counts set count_date = $2, note = $3, updated_at = now() where id = $1`,
    [id, input.countDate, input.note],
  );
}

/** ดึงสินค้ามาตรวจนับ — ตัวที่อยู่ในใบแล้วถูกข้าม คืนจำนวนที่เพิ่มจริง */
export async function addCountItems(
  c: Client, id: string, productIds: string[],
): Promise<number> {
  await requireDraft(c, id);
  if (productIds.length === 0) return 0;

  const { rows } = await c.query(
    `insert into stock_count_items (tenant_id, count_id, line_no, product_id)
     select current_tenant_id(), $1,
            coalesce((select max(line_no) from stock_count_items where count_id = $1), 0)
              + row_number() over (order by p.code),
            p.id
     from products p
     where p.id = any($2::uuid[])
       and not exists (select 1 from stock_count_items x
                       where x.count_id = $1 and x.product_id = p.id)
     returning id`,
    [id, productIds],
  );
  return rows.length;
}

export type ScanResult =
  | { kind: 'added'; item: CountItem }
  | { kind: 'increased'; item: CountItem }
  | { kind: 'many'; term: string; count: number }
  | { kind: 'none'; term: string };

/**
 * ยิงบาร์โค้ดเข้าใบตรวจนับ — ตรรกะเดียวกับ countScan() ของรุ่น 6.4
 *
 * ลำดับการค้นหา: barcode → code → oem แบบตรงตัว
 * แล้วค่อยค้นแบบมีบางส่วนตรงกัน ถ้าเจอตัวเดียวก็ใช้เลย
 *
 * ยิงซ้ำตัวเดิม = นับเพิ่มทีละ 1 ไม่ใช่เพิ่มแถวใหม่
 * (ฐานบังคับด้วย unique (count_id, product_id) อีกชั้น)
 */
export async function scanIntoCount(
  c: Client, id: string, term: string,
): Promise<ScanResult> {
  await requireDraft(c, id);
  const v = term.trim();
  if (!v) return { kind: 'none', term: v };

  const exact = await c.query(
    `select id from products
     where active and (upper(barcode) = upper($1)
                    or upper(code) = upper($1)
                    or upper(oem) = upper($1))
     order by case when upper(barcode) = upper($1) then 0
                   when upper(code) = upper($1) then 1 else 2 end
     limit 1`,
    [v],
  );

  let productId: string | undefined = exact.rows[0]?.id;

  if (!productId) {
    const fuzzy = await c.query(
      `select id from products
       where active and (barcode ilike $1 or code ilike $1
                      or name ilike $1 or oem ilike $1)
       limit 2`,
      [`%${v}%`],
    );
    if (fuzzy.rows.length === 1) productId = fuzzy.rows[0].id;
    else if (fuzzy.rows.length > 1) {
      const all = await c.query(
        `select count(*)::int as c from products
         where active and (barcode ilike $1 or code ilike $1
                        or name ilike $1 or oem ilike $1)`,
        [`%${v}%`],
      );
      return { kind: 'many', term: v, count: n(all.rows[0].c) };
    }
  }

  if (!productId) return { kind: 'none', term: v };

  const existing = await c.query(
    `select id, counted_qty from stock_count_items
     where count_id = $1 and product_id = $2 for update`,
    [id, productId],
  );

  let itemId: string;
  let kind: 'added' | 'increased';

  if (existing.rows[0]) {
    itemId = existing.rows[0].id;
    kind = 'increased';
    const next = round3(n(existing.rows[0].counted_qty) + 1);
    await c.query(
      `update stock_count_items set counted_qty = $2 where id = $1`,
      [itemId, next.toFixed(3)],
    );
  } else {
    kind = 'added';
    const ins = await c.query(
      `insert into stock_count_items (tenant_id, count_id, line_no, product_id, counted_qty)
       values (current_tenant_id(), $1,
               coalesce((select max(line_no) from stock_count_items where count_id = $1), 0) + 1,
               $2, 1)
       returning id`,
      [id, productId],
    );
    itemId = ins.rows[0].id;
  }

  const full = await getCount(c, id);
  const item = full!.items.find((i) => i.id === itemId)!;
  return { kind, item };
}

/** กรอกจำนวนที่นับได้ — null คือล้างช่องกลับเป็น "ยังไม่ได้กรอก" */
export async function setCountedQty(
  c: Client, itemId: string, qty: number | null,
): Promise<void> {
  const { rows } = await c.query(
    `select count_id from stock_count_items where id = $1`, [itemId],
  );
  if (!rows[0]) throw new Error('ไม่พบรายการในใบตรวจนับ');
  await requireDraft(c, rows[0].count_id);

  if (qty !== null && (!Number.isFinite(qty) || qty < 0)) {
    throw new Error('จำนวนที่นับได้ต้องไม่ติดลบ');
  }
  await c.query(
    `update stock_count_items set counted_qty = $2 where id = $1`,
    [itemId, qty === null ? null : round3(qty).toFixed(3)],
  );
}

export async function removeCountItem(c: Client, itemId: string): Promise<void> {
  const { rows } = await c.query(
    `select count_id from stock_count_items where id = $1`, [itemId],
  );
  if (!rows[0]) return;
  await requireDraft(c, rows[0].count_id);
  await c.query(`delete from stock_count_items where id = $1`, [itemId]);
}

/** ลบใบร่าง — ยังไม่แตะสต๊อกเลย ใบที่เปิดผิดจึงไม่ควรค้างอยู่ในรายการตลอดไป */
export async function deleteCount(c: Client, id: string): Promise<{ no: string }> {
  const { rows } = await c.query(
    `select no, status::text as status from stock_counts where id = $1 for update`, [id],
  );
  if (!rows[0]) throw new Error('ไม่พบใบตรวจนับ');
  if (rows[0].status === 'applied') {
    throw new Error(
      `${rows[0].no} ปรับยอดไปแล้ว ลบไม่ได้ — เอกสารที่แก้สต๊อกไปแล้วต้องอยู่เป็นหลักฐาน`,
    );
  }
  await c.query(`delete from stock_counts where id = $1`, [id]);
  return { no: rows[0].no };
}

export interface ApplyResult {
  no: string;
  /** จำนวนรายการที่ปรับจริง */
  adjusted: number;
  /** จำนวนที่รับเข้าเพิ่ม */
  up: number;
  /** มูลค่าส่วนต่างรวม ลบคือของหาย */
  value: number;
}

/**
 * ปรับยอดตามผลตรวจนับ — หัวใจของโมดูลนี้
 *
 * ทั้งใบอยู่ในทรานแซกชันเดียว ปรับ 300 รายการแล้วพังกลางทาง
 * ต้องไม่เหลือสภาพที่ปรับไปครึ่งใบโดยที่ไม่มีใครรู้ว่าถึงไหน
 *
 * ส่วนต่างคิดจากยอด ณ ตอนกดปรับ ไม่ใช่ตอนเปิดใบ — ระหว่างที่นับค้างไว้
 * อาจมีการขายหรือรับของเข้ามา ถ้าใช้ยอดเก่าจะปรับผิดไปเท่ากับที่ขายไประหว่างนั้น
 *
 * ย้อนกลับไม่ได้ ตามรุ่น 6.4 — ของที่หายไปจากชั้นวางไม่ได้กลับมาเพราะกดยกเลิกเอกสาร
 */
export async function applyCount(
  c: Client, id: string, userId: string | null,
): Promise<ApplyResult> {
  const head = await c.query(
    `select no, status::text as status, count_date::text as count_date, note
     from stock_counts where id = $1 for update`,
    [id],
  );
  if (!head.rows[0]) throw new Error('ไม่พบใบตรวจนับ');
  if (head.rows[0].status === 'applied') {
    throw new Error(`${head.rows[0].no} ปรับยอดไปแล้ว กดซ้ำไม่ได้`);
  }
  const no = head.rows[0].no as string;
  const movedOn = head.rows[0].count_date as string;
  const label = `ใบตรวจนับ ${no}`
    + (String(head.rows[0].note ?? '').trim() ? ` — ${String(head.rows[0].note).trim()}` : '');

  /* ยอดสด ณ ตอนนี้ ไม่ใช่ตอนเปิดใบ · เฉพาะบรรทัดที่กรอกแล้วเท่านั้น */
  const { rows } = await c.query(
    `select i.id, i.product_id, i.counted_qty,
            coalesce(s.qty_on_hand, 0) as system_qty,
            ${BOOK_UNIT_COST_SQL} as unit_cost
     from stock_count_items i
     join products p on p.id = i.product_id
     left join product_stock s on s.product_id = i.product_id
     left join ${BOOK_VALUE_SQL} bv on bv.product_id = i.product_id
     where i.count_id = $1 and i.counted_qty is not null
     order by i.line_no
     for update of i`,
    [id],
  );

  let adjusted = 0;
  let up = 0;
  let value = 0;

  for (const r of rows) {
    const counted = n(r.counted_qty);
    const system = n(r.system_qty);
    const cost = n(r.unit_cost);
    const diff = round3(counted - system);

    /* ตรึงยอดระบบและต้นทุนลงทุกบรรทัดที่กรอกแล้ว แม้บรรทัดที่ตรงกันพอดี
       ใบกลายเป็นหลักฐานว่า ณ วันนั้นระบบว่ามีเท่าไรและนับได้เท่าไร */
    await c.query(
      `update stock_count_items set system_qty = $2, unit_cost = $3 where id = $1`,
      [r.id, system.toFixed(3), cost.toFixed(2)],
    );

    if (Math.abs(diff) <= COUNT_EPS) continue;   /* ตรงกับระบบ ไม่แตะเลย */

    /* เป็นเงินที่ตัดหรือรับเข้าจริงของบรรทัดนี้ เป็นบวกเสมอ
       เครื่องหมายอยู่ที่ส่วนต่าง เหมือน stock_moves.cost_amount */
    let booked: number;

    if (diff > 0) {
      /* ของโผล่มา ไม่รู้ว่ามาจากล็อตไหน ตีมูลค่าเท่ากับของที่มีอยู่ในคลังตอนนี้
         (มูลค่าตามบัญชีหารจำนวน) ไม่ใช่ทุนล่าสุด ซึ่งอาจเป็นราคาที่ไม่เคยจ่ายจริง
         กับของกองนี้เลย และจะทำให้มูลค่าสต๊อกพองขึ้นจากการตรวจนับ */
      booked = round2(diff * cost);
      await receiveStock(c, {
        productId: r.product_id, qty: diff, costAmount: booked,
        movedOn, reason: 'count', note: label, userId,
      });
      up++;
      value += booked;
    } else {
      /* ของหาย ตัดตามล็อตจริงเพื่อให้รู้ว่าเสียเงินไปเท่าไร */
      booked = await consumeStock(c, {
        productId: r.product_id, qty: -diff, movedOn,
        reason: 'count', note: label, userId,
      });
      value -= booked;
    }

    /* เก็บเป็นเงินที่เกิดขึ้นจริงลงบรรทัดด้วย — หน้ารายการจะได้ไม่ต้องเดา
       จากส่วนต่าง × ต้นทุนต่อหน่วย ซึ่งไม่ตรงกับงบเมื่อของมาจากหลายล็อต */
    await c.query(
      `update stock_count_items set cost_amount = $2 where id = $1`,
      [r.id, round2(booked).toFixed(2)],
    );
    adjusted++;
  }

  if (adjusted === 0) {
    throw new Error('ยังไม่มีรายการที่นับได้ต่างจากระบบ');
  }

  await c.query(
    `update stock_counts
     set status = 'applied', applied_at = now(), applied_by = $2, updated_at = now()
     where id = $1`,
    [id, userId],
  );

  return { no, adjusted, up, value: round2(value) };
}
