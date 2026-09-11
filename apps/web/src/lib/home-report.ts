import type pg from 'pg';
import { payablesWith, receivablesWith } from './ar-ap';

/**
 * ตัวเลขชุดที่หน้าแรกของรุ่น 6.4 มีแต่ของเรายังไม่มี
 *
 * อยู่ไฟล์นี้เพราะไม่มี `server-only` ชุดทดสอบจึงเรียกได้โดยส่ง client เข้ามาเอง
 * เหมือน contact-totals.ts และ ar-ap.ts
 */

type Client = pg.PoolClient | pg.Client;

const n = (v: unknown): number => Number(v ?? 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * เอกสารที่นับเป็นยอดขาย — ใบส่งมอบทุกใบ บวกใบเสร็จที่ไม่ได้ออกต่อจากใบส่งมอบ
 *
 * เงื่อนไขชุดเดียวกับที่ใช้ทั้งระบบ ลืมข้อนี้แล้วยอดขายจะเป็นสองเท่า
 * โดยที่ตัวเลขยังดูสมเหตุสมผล
 */
const SALES_DOCS = `
  d.status <> 'void'
  and (d.kind in ('IV','IVT')
       or (d.kind = 'RC' and (d.parent_doc_id is null
           or (select kind from documents p where p.id = d.parent_doc_id) = 'QT')))`;

export interface SalesMonthBar {
  /** 'YYYY-MM' */
  key: string;
  amount: number;
}

/**
 * ยอดขายรายเดือนย้อนหลัง N เดือน นับรวมเดือนปัจจุบัน
 *
 * **เดือนที่ไม่มีใบต้องได้ศูนย์ ไม่ใช่หายไปจากแถว** — แท่งที่หายไปทำให้กราฟโกหก
 * เพราะเดือนที่เหลือจะเลื่อนมาชิดกันเหมือนขายได้ทุกเดือน จึงไล่เดือนจากฐานข้อมูล
 * (`generate_series`) แล้ว left join ยอดเข้าไป ไม่ใช่ group by สิ่งที่มีอยู่
 *
 * เดือนคิดตาม current_date ของฐาน ซึ่งตั้งเขตเวลาไทยไว้ ไม่ใช่นาฬิกาของเครื่องที่รัน
 */
export async function salesByMonthWith(c: Client, months = 6): Promise<SalesMonthBar[]> {
  const { rows } = await c.query(
    `with span as (
       select generate_series(
         date_trunc('month', current_date) - make_interval(months => $1::int - 1),
         date_trunc('month', current_date),
         interval '1 month')::date as m
     )
     select to_char(span.m, 'YYYY-MM') as key,
            coalesce(sum(d.payable), 0) as amount
       from span
       left join documents d
              on date_trunc('month', d.doc_date) = span.m and ${SALES_DOCS}
      group by span.m
      order by span.m`,
    [months],
  );
  return rows.map((r) => ({ key: r.key as string, amount: round2(n(r.amount)) }));
}

export interface PartyOwing {
  partyId: string | null;
  name: string;
  /** จำนวนใบที่ยังค้าง */
  count: number;
  amount: number;
}

/**
 * รวมยอดค้างเป็นรายคู่ค้า เรียงจากมากไปน้อย
 *
 * **จัดกลุ่มด้วย party_id ก่อน** แล้วค่อยถอยไปใช้ชื่อเมื่อใบนั้นไม่ได้ผูกทะเบียน —
 * ถ้าจัดกลุ่มด้วยชื่ออย่างเดียว ลูกค้าที่พิมพ์ชื่อไว้ต่างกันนิดเดียวจะกลายเป็นคนละคน
 * และใบที่ไม่มีชื่อเลยจะถูกยุบรวมกันเป็นก้อนเดียวที่ไม่มีความหมาย
 */
export function topOwing(
  rows: { partyId: string | null; partyName: string; outstanding: number }[],
  limit = 5,
): PartyOwing[] {
  const byKey = new Map<string, PartyOwing>();

  for (const r of rows) {
    const key = r.partyId ?? `name:${r.partyName}`;
    const cur = byKey.get(key) ?? {
      partyId: r.partyId,
      name: r.partyName || 'ไม่ระบุชื่อ',
      count: 0,
      amount: 0,
    };
    cur.count += 1;
    cur.amount = round2(cur.amount + r.outstanding);
    byKey.set(key, cur);
  }

  return [...byKey.values()]
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'th'))
    .slice(0, limit);
}

export interface WhtByRate {
  rate: number;
  count: number;
  /** ฐานภาษีที่ถูกหัก */
  base: number;
  amount: number;
}

/**
 * ภาษีหัก ณ ที่จ่ายที่ลูกค้าหักจากอู่ แยกตามอัตรา
 *
 * เป็นรูปที่ตรงกับตอนกรอกแบบยื่นจริง ซึ่งแยกช่องตามอัตรา ไม่ใช่ยอดรวมก้อนเดียว
 * นับเฉพาะงวดที่ให้มา ให้ตรงกับการ์ดภาษีในหน้าเดียวกันที่แสดงงวดล่าสุด
 */
export async function whtByRateWith(c: Client, monthKey: string): Promise<WhtByRate[]> {
  const { rows } = await c.query(
    `select d.wht_rate as rate, count(*)::int as n,
            coalesce(sum(d.net_amount), 0) as base,
            coalesce(sum(d.wht_amount), 0) as amount
       from documents d
      where ${SALES_DOCS}
        and d.wht_amount > 0.004
        and to_char(d.doc_date, 'YYYY-MM') = $1
      group by d.wht_rate
      order by d.wht_rate`,
    [monthKey],
  );
  return rows.map((r) => ({
    rate: n(r.rate),
    count: r.n as number,
    base: round2(n(r.base)),
    amount: round2(n(r.amount)),
  }));
}

export interface OwingSide {
  total: number;
  count: number;
  overdueTotal: number;
  overdueCount: number;
  top: PartyOwing[];
}

/**
 * สรุปลูกหนี้และเจ้าหนี้สำหรับหน้าแรก
 *
 * **เรียกตัวคิดตัวเดียวกับหน้า 06.2 / 06.3** ไม่ได้เขียนเงื่อนไขเกินกำหนดขึ้นใหม่
 * ตัวเลขสองหน้าจึงตรงกันเสมอโดยไม่ต้องอาศัยว่าใครจำได้ว่าต้องแก้ทั้งสองที่
 */
export async function owingSidesWith(
  c: Client,
  limit = 5,
): Promise<{ ar: OwingSide; ap: OwingSide }> {
  /* **ทีละคิวรี ห้ามใช้ Promise.all บน client ตัวเดียว** — ตัวเชื่อมต่อของ pg
     ทำได้ทีละคำสั่ง การยิงพร้อมกันเข้าคิวให้เองในรุ่นนี้แต่ถูกประกาศเลิกใช้แล้ว
     และไม่ได้เร็วขึ้นจริงเพราะปลายทางเป็นสายเดียวกันอยู่ดี */
  const ar = await receivablesWith(c);
  const ap = await payablesWith(c);

  const side = (s: typeof ar | typeof ap): OwingSide => ({
    total: s.total,
    count: s.count,
    overdueTotal: s.overdueTotal,
    overdueCount: s.overdueCount,
    top: topOwing(s.rows, limit),
  });

  return { ar: side(ar), ap: side(ap) };
}

export interface SalesDocRow {
  id: string;
  kind: string;
  docNo: string;
  docDate: string;
  partyName: string;
  refDocNo: string;
  net: number;
  vat: number;
  wht: number;
  payable: number;
  paid: number;
  outstanding: number;
  /**
   * ต้นทุนขายของใบนั้น — **null คือยังไม่เคยตัดสต๊อก ไม่ใช่ศูนย์**
   *
   * ศูนย์แปลว่าขายได้กำไรเต็มจำนวน ซึ่งเป็นคนละเรื่องกับ "ยังไม่ได้ตัดสต๊อก"
   * (ใบส่งมอบที่ยังไม่ออกใบเสร็จ หรือใบที่ย้ายมาจากรุ่น HTML) หน้าจอต้องแยกสองอย่างนี้ออก
   */
  cost: number | null;
}

export interface SalesDocList {
  rows: SalesDocRow[];
  total: number;
}

/**
 * เอกสารขายรายใบ — ตารางใต้สรุปในหน้ายอดขาย
 *
 * ใช้เงื่อนไข SALES_DOCS ชุดเดียวกับสรุปด้านบน ยอดรวมของทุกหน้าจึงเท่ากับสรุปเสมอ
 * ต้นทุนอ่านจาก `stock_moves.cost_amount` ที่ตรึงไว้ตอนตัด ไม่ได้คิดใหม่ตอนเปิดรายงาน
 */
export async function salesDocsWith(
  c: Client,
  opts: { from?: string; to?: string; page?: number; pageSize?: number } = {},
): Promise<SalesDocList> {
  const params: unknown[] = [];
  let range = '';
  if (opts.from) { params.push(opts.from); range += ` and d.doc_date >= $${params.length}`; }
  if (opts.to) { params.push(opts.to); range += ` and d.doc_date <= $${params.length}`; }

  const totalRes = await c.query(
    `select count(*)::int as c from documents d where ${SALES_DOCS}${range}`, params);

  const size = Math.max(1, opts.pageSize ?? 20);
  const page = Math.max(1, opts.page ?? 1);
  params.push(size, (page - 1) * size);

  const { rows } = await c.query(
    `select d.id, d.kind::text as kind, d.doc_no, d.doc_date::text as doc_date,
            d.party_name, d.ref_doc_no,
            d.net_amount, d.vat_amount, d.wht_amount, d.payable,
            coalesce(pay.paid, 0) as paid,
            cost.amount as cost
       from documents d
       left join (select doc_id, sum(amount) as paid from payments group by doc_id) pay
              on pay.doc_id = d.id
       /* ต้นทุนที่ตรึงไว้ตอนตัด — แถวคืนของหักกลบให้เองด้วยเครื่องหมายของ qty_delta */
       left join (select m.doc_id,
                         sum(sign(-m.qty_delta) * coalesce(m.cost_amount,
                             abs(m.qty_delta) * m.unit_cost)) as amount
                    from stock_moves m
                   where m.reason in ('sale','return') and m.doc_id is not null
                   group by m.doc_id) cost on cost.doc_id = d.id
      where ${SALES_DOCS}${range}
      order by d.doc_date desc, d.doc_no desc
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );

  return {
    total: totalRes.rows[0].c as number,
    rows: rows.map((r) => {
      const payable = round2(n(r.payable));
      const paid = round2(n(r.paid));
      return {
        id: r.id as string,
        kind: r.kind as string,
        docNo: r.doc_no as string,
        docDate: r.doc_date as string,
        partyName: (r.party_name as string) ?? '',
        refDocNo: (r.ref_doc_no as string) ?? '',
        net: round2(n(r.net_amount)),
        vat: round2(n(r.vat_amount)),
        wht: round2(n(r.wht_amount)),
        payable,
        paid,
        outstanding: round2(payable - paid),
        cost: r.cost === null || r.cost === undefined ? null : round2(n(r.cost)),
      };
    }),
  };
}
