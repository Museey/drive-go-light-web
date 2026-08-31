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

export interface PLReport {
  revenue: number;
  cogs: number;
  grossProfit: number;
  opsByCat: { key: string; label: string; amount: number }[];
  opsTotal: number;
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

    const p2: unknown[] = [];
    const r2 = rangeSql(p2, from, to);
    const cogsRes = await c.query(
      `select coalesce(sum(d.net_amount), 0) as v
       from documents d where d.kind = 'PO' and d.status <> 'void'${r2}`, p2,
    );

    const p3: unknown[] = [];
    const r3 = rangeSql(p3, from, to);
    const opsRes = await c.query(
      `select d.expense_cat::text as cat, coalesce(sum(d.net_amount), 0) as v
       from documents d where d.kind = 'EX' and d.status <> 'void'${r3}
       group by 1`, p3,
    );

    const p4: unknown[] = [];
    const r4 = rangeSql(p4, from, to);
    const monthRes = await c.query(
      `select to_char(d.doc_date, 'YYYY-MM') as key,
              coalesce(sum(case when ${SALES_DOCS} then d.net_amount else 0 end), 0) as revenue,
              coalesce(sum(case when d.kind = 'PO' and d.status <> 'void'
                                then d.net_amount else 0 end), 0) as cogs,
              coalesce(sum(case when d.kind = 'EX' and d.status <> 'void'
                                and d.expense_cat <> 'asset' then d.net_amount else 0 end), 0) as ops
       from documents d
       where d.status <> 'void' and d.kind <> 'QT'${r4}
       group by 1 order by 1`, p4,
    );

    const byCat = new Map(opsRes.rows.map((r) => [r.cat as string, n(r.v)]));
    const opsByCat = EXPENSE_CATS
      .filter((c2) => c2.key !== 'asset')
      .map((c2) => ({ key: c2.key, label: c2.label, amount: byCat.get(c2.key) ?? 0 }));

    const revenue = n(revenueRes.rows[0].v);
    const cogs = n(cogsRes.rows[0].v);
    const opsTotal = round2(opsByCat.reduce((s, x) => s + x.amount, 0));
    const assetTotal = byCat.get('asset') ?? 0;

    return {
      revenue: round2(revenue),
      cogs: round2(cogs),
      grossProfit: round2(revenue - cogs),
      opsByCat,
      opsTotal,
      assetTotal: round2(assetTotal),
      netProfit: round2(revenue - cogs - opsTotal),
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
