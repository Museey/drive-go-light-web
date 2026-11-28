import type pg from 'pg';

/**
 * แยกรายได้ — งานซ่อม กับ ขายหน้าร้าน · ค่าแรง กับ ค่าอะไหล่ (24 พ.ย. 2569 — ผู้ใช้ขอ)
 *
 * ใช้ข้อมูลที่มีอยู่แล้วทั้งหมด พนักงานไม่ต้องกรอกอะไรเพิ่ม
 *
 *   ช่องทาง   ขายหน้าร้าน = ใบเสร็จที่ไม่มีใบต้นทาง (เมนู 03.6)
 *             งานซ่อม     = เอกสารขายที่เหลือ: ใบส่งมอบ/ใบกำกับภาษี และใบเสร็จที่ออกต่อจากใบเสนอราคา
 *   ประเภท   ค่าแรง       = บรรทัดที่ติ๊ก "ค่าแรง" (ฐานหัก ณ ที่จ่าย)
 *             ค่าอะไหล่    = บรรทัดที่เหลือ
 *
 * **ยอดทุกช่องเป็นมูลค่าก่อนภาษี และรวมกันเท่ากับ "ยอดขายก่อนภาษี" ของรายงานเดียวกันพอดี**
 * จึงไม่คิดจากผลรวมบรรทัดตรง ๆ — บรรทัดยังไม่หักส่วนลดท้ายบิล และใบแบบราคารวม VAT ยังมีภาษีปนอยู่
 * แต่แบ่ง `net_amount` ของใบตาม**สัดส่วน**ของบรรทัดค่าแรงต่อบรรทัดทั้งใบ
 * ส่วนลดท้ายบิลกับ VAT จึงถูกกระจายให้ค่าแรงและค่าอะไหล่ตามส่วนเท่ากัน
 * ใบที่ไม่มีบรรทัดเลย (นำเข้ามาแต่หัว) นับเป็นค่าอะไหล่ทั้งใบ
 *
 * ข้อจำกัดที่ต้องรู้: งานซ่อมที่พนักงานเปิดผ่านเมนูขายหน้าร้านจะนับเป็นขายหน้าร้าน
 * เพราะระบบดูจากการมีใบต้นทาง — มุมค่าแรง/ค่าอะไหล่ไม่ได้รับผลจากเรื่องนี้
 *
 * ไม่มี server-only — รับ client ที่ตั้ง tenant แล้ว ชุดทดสอบเรียกได้ตรง ๆ
 */

type Client = pg.PoolClient | pg.Client;

/** เอกสารที่นับเป็นยอดขาย — ต้องตรงกับ SALES_DOCS ใน reports.ts ทุกตัวอักษรของเงื่อนไข (มีเทสต์เทียบยอดรวม) */
const SALES_DOCS = `
  d.status <> 'void' and d.direction = 'sell' and (
    d.kind in ('IV','IVT')
    or (d.kind = 'RC' and (d.parent_doc_id is null
        or (select p.kind from documents p where p.id = d.parent_doc_id) = 'QT'))
  )`;

export interface SplitRow {
  count: number;
  labour: number;
  parts: number;
  /** ค่าแรง + ค่าอะไหล่ = มูลค่าก่อนภาษีของช่องทางนี้ */
  net: number;
}

export interface SalesSplit {
  job: SplitRow;
  walkin: SplitRow;
  total: SplitRow;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const ZERO: SplitRow = { count: 0, labour: 0, parts: 0, net: 0 };

export async function salesSplitWith(c: Client, from?: string, to?: string): Promise<SalesSplit> {
  const params: unknown[] = [];
  let range = '';
  if (from) { params.push(from); range += ` and d.doc_date >= $${params.length}`; }
  if (to) { params.push(to); range += ` and d.doc_date <= $${params.length}`; }

  const { rows } = await c.query(
    `with s as (
       select d.net_amount,
              (d.kind = 'RC' and d.parent_doc_id is null) as walkin,
              coalesce(l.svc, 0) as svc, coalesce(l.tot, 0) as tot
         from documents d
         left join (
           select i.doc_id,
                  sum(i.line_total) filter (where i.is_service) as svc,
                  sum(i.line_total) as tot
             from doc_items i group by i.doc_id
         ) l on l.doc_id = d.id
        where ${SALES_DOCS}${range}
     )
     select walkin, count(*)::int as c,
            coalesce(sum(net_amount), 0) as net,
            coalesce(sum(case when tot > 0 then net_amount * svc / tot else 0 end), 0) as labour
       from s group by walkin`, params);

  const pick = (walkin: boolean): SplitRow => {
    const r = rows.find((x) => x.walkin === walkin);
    if (!r) return { ...ZERO };
    /* ปัดค่าแรงก่อน แล้วให้ค่าอะไหล่เป็นส่วนที่เหลือ — สองช่องบวกกันจึงเท่ายอดรวมเสมอ ไม่เพี้ยนสตางค์ */
    const net = round2(Number(r.net));
    const labour = round2(Number(r.labour));
    return { count: Number(r.c), labour, parts: round2(net - labour), net };
  };

  const job = pick(false);
  const walkin = pick(true);
  return {
    job, walkin,
    total: {
      count: job.count + walkin.count,
      labour: round2(job.labour + walkin.labour),
      parts: round2(job.parts + walkin.parts),
      net: round2(job.net + walkin.net),
    },
  };
}
