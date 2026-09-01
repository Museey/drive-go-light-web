import 'server-only';
import { EXPENSE_CATS, vatChainFromMonths, type VatMonth } from '@drivegolight/core';
import { query } from './auth';
import { profitAndLossWith } from './reports-pl';

import type { PLReport } from './reports-pl';

export { profitAndLossWith };
export type { PLMonth, PLReport, WriteOff } from './reports-pl';

export async function getProfitAndLoss(from?: string, to?: string): Promise<PLReport> {
  return query((c) => profitAndLossWith(c, from, to));
}

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
function rangeSql(params: unknown[], from?: string, to?: string, col = 'd.doc_date'): string {
  const parts: string[] = [];
  if (from) { params.push(from); parts.push(`${col} >= $${params.length}`); }
  if (to) { params.push(to); parts.push(`${col} <= $${params.length}`); }
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
