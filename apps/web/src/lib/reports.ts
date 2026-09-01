import 'server-only';
import { EXPENSE_CATS, vatChainFromMonths, type VatMonth } from '@drivegolight/core';
import { query } from './auth';

const n = (v: unknown): number => Number(v ?? 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * เอกสารที่นับเป็นยอดขาย
 *
 * ใบส่งมอบนับเสมอ ส่วนใบเสร็จนับเฉพาะที่ไม่ได้ออกต่อจากใบส่งมอบ
 * ไม่งั้นงานเดียวถูกนับสองรอบ — ตรงกับ salesDocs() ใน core
 */
const SALES_DOCS = `
  d.status <> 'void' and d.direction = 'sell' and (
    d.kind in ('IV','IVT')
    or (d.kind = 'RC' and (d.parent_doc_id is null
        or (select p.kind from documents p where p.id = d.parent_doc_id) = 'QT'))
  )`;

/** เงื่อนไขช่วงวันที่ — คืน SQL กับพารามิเตอร์ที่ต่อท้ายได้เลย */
function rangeSql(params: unknown[], from?: string, to?: string): string {
  const parts: string[] = [];
  if (from) { params.push(from); parts.push(`d.doc_date >= $${params.length}`); }
  if (to) { params.push(to); parts.push(`d.doc_date <= $${params.length}`); }
  return parts.length ? ' and ' + parts.join(' and ') : '';
}

/* =====================================================================
   06.1 ยอดขาย
   ===================================================================== */

export interface SalesMonthRow {
  key: string;
  docCount: number;
  net: number;
  vat: number;
  grand: number;
  wht: number;
}

export interface SalesReport {
  months: SalesMonthRow[];
  totalNet: number;
  totalVat: number;
  totalGrand: number;
  totalWht: number;
  docCount: number;
}

export async function getSalesReport(from?: string, to?: string): Promise<SalesReport> {
  return query(async (c) => {
    const params: unknown[] = [];
    const range = rangeSql(params, from, to);

    const { rows } = await c.query(
      `select to_char(d.doc_date, 'YYYY-MM') as key,
              count(*)::int as doc_count,
              sum(d.net_amount) as net,
              sum(d.vat_amount) as vat,
              sum(d.grand_total) as grand,
              sum(d.wht_amount) as wht
       from documents d
       where ${SALES_DOCS}${range}
       group by 1 order by 1`,
      params,
    );

    const months = rows.map((r) => ({
      key: r.key,
      docCount: r.doc_count,
      net: n(r.net), vat: n(r.vat), grand: n(r.grand), wht: n(r.wht),
    }));

    return {
      months,
      totalNet: round2(months.reduce((s, m) => s + m.net, 0)),
      totalVat: round2(months.reduce((s, m) => s + m.vat, 0)),
      totalGrand: round2(months.reduce((s, m) => s + m.grand, 0)),
      totalWht: round2(months.reduce((s, m) => s + m.wht, 0)),
      docCount: months.reduce((s, m) => s + m.docCount, 0),
    };
  });
}

/* =====================================================================
   ภาษีมูลค่าเพิ่มรายงวด
   ===================================================================== */

/**
 * รวมภาษีขายและภาษีซื้อรายเดือนจากฐานข้อมูล แล้วส่งให้ core คิดเครดิตยกยอด
 *
 * ยอดภาษีต่อใบถูกคำนวณด้วย core ตั้งแต่ตอนบันทึกและเก็บไว้ในตารางแล้ว
 * ตรงนี้จึงแค่รวมยอด ส่วนกฎยกยอดยังอยู่ที่เดียวใน core ตามเดิม
 */
export async function getVatChain(): Promise<VatMonth[]> {
  return query(async (c) => {
    const { rows } = await c.query(
      `with months as (
         select to_char(d.doc_date, 'YYYY-MM') as key,
                sum(case when ${SALES_DOCS} then d.vat_amount else 0 end) as vat_out,
                sum(case when d.direction = 'buy' and d.status <> 'void'
                         then d.vat_amount else 0 end) as vat_in
         from documents d
         where d.status <> 'void' and d.kind <> 'QT'
         group by 1
       )
       select key, round(vat_out, 2) as vat_out, round(vat_in, 2) as vat_in
       from months
       where vat_out <> 0 or vat_in <> 0
       order by key`,
    );

    return vatChainFromMonths(
      rows.map((r) => ({ key: r.key, out: n(r.vat_out), in: n(r.vat_in) })),
    );
  });
}

/* =====================================================================
   06.4 งบกำไรขาดทุน
   ===================================================================== */

export interface PLMonth {
  key: string;
  revenue: number;
  cogs: number;
  ops: number;
  netProfit: number;
}

/** ของที่ออกจากคลังโดยไม่ผ่านการขาย — คิดตามต้นทุนจริงที่ตัดไป */
export interface WriteOff {
  /** เคลม — ยังไม่มีโมดูล ค่าเป็นศูนย์จนกว่าจะถึงช่วงที่ 4 */
  claim: number;
  /** ปรับยอด ตรวจนับ และตั้งยอดจากไฟล์ */
  adjust: number;
  /** เบิกใช้ในอู่ */
  use: number;
  total: number;
}

export interface PLReport {
  revenue: number;
  /** ต้นทุนของที่ขายออกไปจริง ไม่ใช่ยอดซื้อในงวด */
  cogs: number;
  /** ยอดซื้อในงวด — แสดงแยกไว้ให้เทียบ ไม่ได้เอาไปหักกำไร */
  purchases: number;
  grossProfit: number;
  opsByCat: { key: string; label: string; amount: number }[];
  opsTotal: number;
  writeOff: WriteOff;
  assetTotal: number;
  netProfit: number;
  months: PLMonth[];
}

/**
 * งบกำไรขาดทุน — ใช้มูลค่าก่อนภาษีทุกรายการ
 *
 * VAT ไม่ใช่รายได้หรือค่าใช้จ่ายของกิจการ อู่เป็นแค่คนเก็บแทนกรมสรรพากร
 * ซื้อสินทรัพย์ไม่หักเป็นค่าใช้จ่ายของงวด (ต้องคิดค่าเสื่อมแทน ซึ่งระบบยังไม่ทำให้)
 * ตัวเลขที่ได้จึงเป็นกำไรก่อนหักค่าเสื่อม — เหมือนโปรแกรมเดิมทุกประการ
 */
export async function getProfitAndLoss(from?: string, to?: string): Promise<PLReport> {
  return query(async (c) => {
    const p1: unknown[] = [];
    const r1 = rangeSql(p1, from, to);
    const revenueRes = await c.query(
      `select coalesce(sum(d.net_amount), 0) as v from documents d where ${SALES_DOCS}${r1}`, p1,
    );

    /* ยอดซื้อในงวด — เดิมใช้ตัวนี้เป็นต้นทุนขาย ตอนนี้แสดงแยกไว้ให้เทียบเฉย ๆ
       อู่ที่ซื้อยกล็อตเดือนหนึ่งแล้วขายไปสามเดือนจะเห็นสองตัวเลขนี้ต่างกันมาก
       ซึ่งเป็นเรื่องปกติ ไม่ใช่ความผิดพลาด */
    const p2: unknown[] = [];
    const r2 = rangeSql(p2, from, to);
    const purchRes = await c.query(
      `select coalesce(sum(d.net_amount), 0) as v
       from documents d where d.kind = 'PO' and d.status <> 'void'${r2}`, p2,
    );

    /* ช่วงวันที่ของบัญชีสต๊อก — คนละคอลัมน์กับเอกสาร จึงต้องประกอบเอง
       ใช้พารามิเตอร์เสมอ ค่ามาจาก query string ของผู้ใช้ */
    const moveRange = (params: unknown[]): string => {
      const parts: string[] = [];
      if (from) { params.push(from); parts.push(`m.moved_on >= $${params.length}`); }
      if (to) { params.push(to); parts.push(`m.moved_on <= $${params.length}`); }
      return parts.length ? ' and ' + parts.join(' and ') : '';
    };

    /* ต้นทุนขายจริง — คิดต่อเอกสาร ไม่ใช่ต่อการเคลื่อนไหวสต๊อก
       เอกสารที่ออกผ่านระบบมีต้นทุนตรึงไว้ในบัญชีสต๊อกแล้ว ใช้ค่านั้น
       เอกสารที่ย้ายเข้ามาจากโปรแกรมเดิมไม่มีการเคลื่อนไหวสต๊อกเลย
       ประมาณด้วยจำนวน × ต้นทุนล่าสุด แบบเดียวกับที่รุ่น 6.4 ทำกับเอกสารก่อนรุ่นคิดต้นทุน
       ไม่งั้นอู่ที่เพิ่งย้ายเข้ามาจะเห็นกำไรขั้นต้น 100% ซึ่งผิดจนใช้ตัดสินใจอะไรไม่ได้ */
    const pc: unknown[] = [];
    const rc = rangeSql(pc, from, to);
    const cogsRes = await c.query(
      `with doc_cost as (
         select d.id,
                sum(sign(-m.qty_delta) * coalesce(m.cost_amount, abs(m.qty_delta) * p.last_cost)) as booked
         from documents d
         join stock_moves m on m.doc_id = d.id and m.reason in ('sale','return')
         join products p on p.id = m.product_id
         group by d.id
       ),
       doc_est as (
         select d.id, sum(i.qty * p.last_cost) as est
         from documents d
         join doc_items i on i.doc_id = d.id and i.product_id is not null
         join products p on p.id = i.product_id
         group by d.id
       )
       select coalesce(sum(coalesce(bc.booked, es.est, 0)), 0) as v
       from documents d
       left join doc_cost bc on bc.id = d.id
       left join doc_est  es on es.id = d.id
       where ${SALES_DOCS}${rc}`, pc,
    );

    /* ของที่ออกจากคลังโดยไม่ผ่านการขาย แยกตามเหตุผล
       ฝั่งรับเข้าคิดติดลบเพื่อหักกลบ เช่น ปรับยอดขึ้นแล้วปรับลงในงวดเดียวกัน */
    const pw: unknown[] = [];
    const woRange = moveRange(pw);
    const writeOffRes = await c.query(
      `select m.reason::text as reason,
              coalesce(sum(
                sign(-m.qty_delta) * coalesce(m.cost_amount, abs(m.qty_delta) * p.last_cost)
              ), 0) as v
       from stock_moves m
       join products p on p.id = m.product_id
       where m.reason in ('use','adjust','count','set')${woRange}
       group by 1`, pw,
    );

    const p3: unknown[] = [];
    const r3 = rangeSql(p3, from, to);
    const opsRes = await c.query(
      `select d.expense_cat::text as cat, coalesce(sum(d.net_amount), 0) as v
       from documents d where d.kind = 'EX' and d.status <> 'void'${r3}
       group by 1`, p3,
    );

    /* คิวรีเดียวสองช่วงวันที่ — ใช้อาเรย์พารามิเตอร์ก้อนเดียวกัน
       ไม่งั้นเลข $n ของสองส่วนชนกัน */
    const p4: unknown[] = [];
    const r4 = rangeSql(p4, from, to);
    const r4b = rangeSql(p4, from, to);
    const mr = moveRange(p4);
    const monthRes = await c.query(
      `with doc_side as (
         select to_char(d.doc_date, 'YYYY-MM') as key,
                coalesce(sum(case when ${SALES_DOCS} then d.net_amount else 0 end), 0) as revenue,
                coalesce(sum(case when d.kind = 'EX' and d.status <> 'void'
                                  and d.expense_cat <> 'asset' then d.net_amount else 0 end), 0) as ops
         from documents d
         where d.status <> 'void' and d.kind <> 'QT'${r4}
         group by 1
       ),
       doc_cost as (
         select d.id,
                sum(sign(-m.qty_delta) * coalesce(m.cost_amount, abs(m.qty_delta) * p.last_cost)) as booked
         from documents d
         join stock_moves m on m.doc_id = d.id and m.reason in ('sale','return')
         join products p on p.id = m.product_id
         group by d.id
       ),
       doc_est as (
         select d.id, sum(i.qty * p.last_cost) as est
         from documents d
         join doc_items i on i.doc_id = d.id and i.product_id is not null
         join products p on p.id = i.product_id
         group by d.id
       ),
       cogs_side as (
         select to_char(d.doc_date, 'YYYY-MM') as key,
                coalesce(sum(coalesce(bc.booked, es.est, 0)), 0) as cogs
         from documents d
         left join doc_cost bc on bc.id = d.id
         left join doc_est  es on es.id = d.id
         where ${SALES_DOCS}${r4b}
         group by 1
       ),
       stock_side as (
         select to_char(m.moved_on, 'YYYY-MM') as key,
                coalesce(sum(
                  sign(-m.qty_delta) * coalesce(m.cost_amount, abs(m.qty_delta) * p.last_cost)
                ), 0) as writeoff
         from stock_moves m
         join products p on p.id = m.product_id
         where m.reason in ('use','adjust','count','set')${mr}
         group by 1
       )
       select k.key,
              coalesce(a.revenue, 0) as revenue,
              coalesce(cg.cogs, 0)   as cogs,
              coalesce(a.ops, 0) + coalesce(b.writeoff, 0) as ops
       from (select key from doc_side
             union select key from cogs_side
             union select key from stock_side) k
       left join doc_side   a  on a.key  = k.key
       left join cogs_side  cg on cg.key = k.key
       left join stock_side b  on b.key  = k.key
       order by 1`, p4,
    );

    const byCat = new Map(opsRes.rows.map((r) => [r.cat as string, n(r.v)]));
    const opsByCat = EXPENSE_CATS
      .filter((c2) => c2.key !== 'asset')
      .map((c2) => ({ key: c2.key, label: c2.label, amount: byCat.get(c2.key) ?? 0 }));

    const revenue = n(revenueRes.rows[0].v);
    const cogs = n(cogsRes.rows[0].v);
    const opsTotal = round2(opsByCat.reduce((s, x) => s + x.amount, 0));
    const assetTotal = byCat.get('asset') ?? 0;

    const byReason = new Map(writeOffRes.rows.map((r) => [r.reason as string, n(r.v)]));
    const woAdjust = round2(
      (byReason.get('adjust') ?? 0) + (byReason.get('count') ?? 0) + (byReason.get('set') ?? 0),
    );
    const woUse = round2(byReason.get('use') ?? 0);
    const writeOff = {
      claim: 0,                       /* รอโมดูลเคลมในช่วงที่ 4 */
      adjust: woAdjust,
      use: woUse,
      total: round2(woAdjust + woUse),
    };

    /* ของที่หายจากคลังเป็นค่าใช้จ่ายดำเนินงาน ไม่ใช่ต้นทุนขาย —
       ต้นทุนขายต้องเป็นของที่ขายออกไปจริงเท่านั้น ไม่งั้นกำไรขั้นต้นไม่มีความหมาย */
    return {
      revenue: round2(revenue),
      cogs: round2(cogs),
      purchases: round2(n(purchRes.rows[0].v)),
      grossProfit: round2(revenue - cogs),
      opsByCat,
      opsTotal,
      writeOff,
      assetTotal: round2(assetTotal),
      netProfit: round2(revenue - cogs - opsTotal - writeOff.total),
      months: monthRes.rows
        .filter((r) => n(r.revenue) !== 0 || n(r.cogs) !== 0 || n(r.ops) !== 0)
        .map((r) => ({
          key: r.key,
          revenue: n(r.revenue),
          cogs: n(r.cogs),
          ops: n(r.ops),
          netProfit: round2(n(r.revenue) - n(r.cogs) - n(r.ops)),
        })),
    };
  });
}

/* =====================================================================
   สรุปภาษีสำหรับหน้าแรก
   ===================================================================== */

export interface TaxSummary {
  /** งวดล่าสุดที่มีเอกสาร */
  latest: VatMonth | null;
  /** เครดิตภาษีที่ยกไปงวดถัดไป */
  carryForward: number;
  /** ภาษีหัก ณ ที่จ่ายที่อู่ต้องนำส่ง (จากค่าใช้จ่าย) ในงวดล่าสุด */
  whtToRemit: number;
  /** ภาษีหัก ณ ที่จ่ายที่ลูกค้าหักไว้ (จากเอกสารขาย) ในงวดล่าสุด */
  whtWithheld: number;
}

export async function getTaxSummary(): Promise<TaxSummary> {
  const chain = await getVatChain();
  const latest = chain.length ? chain[chain.length - 1]! : null;

  return query(async (c) => {
    if (!latest) {
      return { latest: null, carryForward: 0, whtToRemit: 0, whtWithheld: 0 };
    }

    const { rows } = await c.query(
      `select
         coalesce(sum(case when d.kind = 'EX' then d.wht_amount else 0 end), 0) as remit,
         coalesce(sum(case when ${SALES_DOCS} then d.wht_amount else 0 end), 0) as withheld
       from documents d
       where d.status <> 'void' and to_char(d.doc_date, 'YYYY-MM') = $1`,
      [latest.key],
    );

    return {
      latest,
      carryForward: latest.carryOut,
      whtToRemit: n(rows[0].remit),
      whtWithheld: n(rows[0].withheld),
    };
  });
}

/* =====================================================================
   ส่งออกรายรับรายจ่ายเป็น CSV
   ===================================================================== */

export interface FinanceCsvRow {
  group: string;
  docNo: string;
  docDate: string;
  party: string;
  net: number;
  vat: number;
  wht: number;
  payable: number;
  paid: number;
  outstanding: number;
  status: string;
}

/**
 * รายรับและรายจ่ายทุกใบในช่วงที่เลือก ไว้ส่งให้สำนักงานบัญชี
 *
 * ยกคอลัมน์มาจาก exportFinanceCsv() ของรุ่น 3.6 ทั้งชุดและเรียงเหมือนเดิม
 * สำนักงานบัญชีที่เคยรับไฟล์จากโปรแกรมเดิมจะได้ไม่ต้องแก้สูตรใน Excel ที่ทำไว้แล้ว
 *
 * ฝั่งขายใช้เงื่อนไขเดียวกับรายงานยอดขาย ใบเสร็จที่ออกต่อจากใบส่งมอบจึงไม่ถูกนับซ้ำ
 */
export async function getFinanceCsvRows(from?: string, to?: string): Promise<FinanceCsvRow[]> {
  return query(async (c) => {
    const params: unknown[] = [];
    const sellRange = rangeSql(params, from, to);
    const buyRange = rangeSql(params, from, to);

    const { rows } = await c.query(
      `with paid as (select doc_id, sum(amount) as amount from payments group by doc_id)
       select 'ขาย' as grp, d.kind::text as kind, null::text as cat,
              d.doc_no, d.doc_date::text as doc_date, d.party_name,
              d.net_amount, d.vat_amount, d.wht_amount, d.payable,
              coalesce(p.amount, 0) as paid
         from documents d left join paid p on p.doc_id = d.id
        where ${SALES_DOCS}${sellRange}
       union all
       select case when d.kind = 'PO' then 'ซื้อ' else 'ค่าใช้จ่าย' end as grp,
              d.kind::text, d.expense_cat::text,
              d.doc_no, d.doc_date::text, d.party_name,
              d.net_amount, d.vat_amount, d.wht_amount, d.payable,
              coalesce(p.amount, 0)
         from documents d left join paid p on p.doc_id = d.id
        where d.status <> 'void' and d.direction = 'buy'${buyRange}
       order by doc_date, doc_no`,
      params,
    );

    const catLabel = Object.fromEntries(EXPENSE_CATS.map((x) => [x.key, x.label]));

    return rows.map((r) => {
      const payable = n(r.payable);
      const paid = n(r.paid);
      const outstanding = round2(Math.max(0, payable - paid));
      return {
        group: r.cat ? `${r.grp} · ${catLabel[r.cat] ?? r.cat}` : r.grp,
        docNo: r.doc_no,
        docDate: r.doc_date,
        party: r.party_name ?? '',
        net: n(r.net_amount),
        vat: n(r.vat_amount),
        wht: n(r.wht_amount),
        payable,
        paid,
        outstanding,
        status: outstanding <= 0.004 ? 'ชำระครบแล้ว' : paid > 0.004 ? 'ชำระบางส่วน' : 'ยังไม่ชำระ',
      };
    });
  });
}
