import type pg from 'pg';
import { isPeriod, ssoWageOf } from './payroll-calc';

/**
 * เอกสารภาษี (Light Plus · 06.7) — รายงานรายเดือนสำหรับยื่นแบบ อ่านจากเอกสารที่บันทึกไว้แล้ว
 *
 *   vat-out  รายงานภาษีขาย      เอกสารขายที่มี VAT
 *   vat-in   รายงานภาษีซื้อ      ใบซื้อและค่าใช้จ่ายที่มี VAT
 *   pnd3     ใบแนบ ภ.ง.ด.3      ค่าใช้จ่ายที่อู่หักภาษี ณ ที่จ่าย — ผู้รับเป็นบุคคลธรรมดา
 *   pnd53    ใบแนบ ภ.ง.ด.53     เหมือนกัน — ผู้รับเป็นนิติบุคคล
 *   pnd1     ใบแนบ ภ.ง.ด.1      เงินเดือนของงวด
 *   sso      สปส.1-10 ส่วนที่ 2  เงินสมทบประกันสังคมของงวด
 *
 * **ไม่มีการคำนวณภาษีใหม่** ยอดทุกตัวถูกคิดด้วย core ตอนบันทึกเอกสารและเก็บไว้แล้ว
 * ที่นี่แค่คัดแถวและรวมยอด ตัวเลขจึงตรงกับเอกสารต้นทางทุกสตางค์
 *
 * **งวดดูจากวันที่เอกสาร** — ภาษีหัก ณ ที่จ่ายตามกฎหมายถือวันที่จ่ายเงิน
 * อู่ที่บันทึกค่าใช้จ่ายเดือนหนึ่งแต่จ่ายอีกเดือนต้องตรวจงวดเอง (บอกไว้บนหน้าจอด้วย)
 *
 * รับ client ที่ตั้ง app.tenant_id แล้ว ไม่มี server-only (tax-db.test.ts)
 */

type Db = Pick<pg.ClientBase, 'query'>;

const n = (v: unknown): number => Number(v ?? 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * เอกสารที่นับเป็นยอดขาย — **ต้องตรงกับ SALES_DOCS ใน reports.ts ทุกตัวอักษร**
 * ไม่งั้นภาษีขายในหน้านี้จะไม่เท่ากับการ์ด "ภาษีมูลค่าเพิ่มรายงวด" ของ 06.1 (tax-db.test.ts เทียบให้)
 */
export const SALES_DOCS = `
  d.status <> 'void' and d.direction = 'sell' and (
    d.kind in ('IV','IVT')
    or (d.kind = 'RC' and (d.parent_doc_id is null
        or (select p.kind from documents p where p.id = d.parent_doc_id) = 'QT'))
  )`;

export const TAX_DOCS = [
  { key: 'vat-out', label: 'รายงานภาษีขาย', short: 'ภาษีขาย' },
  { key: 'vat-in', label: 'รายงานภาษีซื้อ', short: 'ภาษีซื้อ' },
  { key: 'pnd3', label: 'ใบแนบ ภ.ง.ด.3', short: 'ภ.ง.ด.3' },
  { key: 'pnd53', label: 'ใบแนบ ภ.ง.ด.53', short: 'ภ.ง.ด.53' },
  { key: 'pnd1', label: 'ใบแนบ ภ.ง.ด.1', short: 'ภ.ง.ด.1' },
  { key: 'sso', label: 'เงินสมทบประกันสังคม (สปส.1-10)', short: 'ประกันสังคม' },
] as const;

export type TaxDocKey = (typeof TAX_DOCS)[number]['key'];

export const taxDocOf = (v: unknown): TaxDocKey =>
  TAX_DOCS.some((d) => d.key === v) ? (v as TaxDocKey) : 'vat-out';

export const taxDocLabel = (k: TaxDocKey): string => TAX_DOCS.find((d) => d.key === k)!.label;

/**
 * แบบที่อ่านจากงวดเงินเดือน — แสดงเงินได้ของพนักงานรายคน
 *
 * ต้องมีสิทธิ์แท็บเงินเดือน (finance.payroll) ด้วย ไม่ใช่แค่แท็บเอกสารภาษี
 * ไม่งั้นพนักงานบัญชีที่เจ้าของตั้งใจไม่ให้เห็นเงินเดือน จะเปิด ภ.ง.ด.1 ดูเงินเดือนของทุกคนได้
 * ทุกทางเข้า (หน้าจอ · CSV · 50 ทวิ ของพนักงาน) ต้องถามตัวนี้
 */
export const taxDocNeedsPayroll = (k: TaxDocKey): boolean => k === 'pnd1' || k === 'sso';

/** งวดที่ขอ ถ้าไม่ถูกรูปแบบใช้เดือนของวันนี้ */
export function taxMonthOf(v: unknown, today: string): string {
  return typeof v === 'string' && isPeriod(v) ? v : today.slice(0, 7);
}

/** เดือนล่าสุดย้อนหลังนับจากเดือนของวันนี้ — ตัวเลือกงวดบนหน้าจอ */
export function recentMonths(today: string, count = 18): string[] {
  const [y, m] = today.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(y!, m! - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/* =====================================================================
   ภาษีมูลค่าเพิ่ม
   ===================================================================== */

export interface VatRow {
  id: string;
  /** sell หรือ buy — ใช้เลือกลิงก์กลับไปหาเอกสาร */
  direction: 'sell' | 'buy';
  docNo: string;
  /** เลขที่ใบกำกับภาษีของผู้ขาย (ฝั่งซื้อ) */
  refDocNo: string;
  docDate: string;
  partyName: string;
  partyTaxId: string;
  net: number;
  vat: number;
  total: number;
}

export interface VatReport {
  rows: VatRow[];
  net: number;
  vat: number;
  total: number;
}

function vatReport(rows: Record<string, unknown>[], direction: 'sell' | 'buy'): VatReport {
  const out = rows.map((r) => ({
    id: String(r.id), direction, docNo: String(r.doc_no), refDocNo: String(r.ref_doc_no ?? ''),
    docDate: String(r.doc_date), partyName: String(r.party_name ?? ''), partyTaxId: String(r.party_tax_id ?? ''),
    net: n(r.net_amount), vat: n(r.vat_amount), total: n(r.grand_total),
  }));
  return {
    rows: out,
    net: round2(out.reduce((s, r) => s + r.net, 0)),
    vat: round2(out.reduce((s, r) => s + r.vat, 0)),
    total: round2(out.reduce((s, r) => s + r.total, 0)),
  };
}

const VAT_COLS = `d.id, d.doc_no, d.ref_doc_no, d.doc_date::text as doc_date, d.party_name, d.party_tax_id,
  d.net_amount, d.vat_amount, d.grand_total`;

/** รายงานภาษีขาย — เอกสารขายที่มีภาษีขายในงวด เรียงตามวันที่และเลขที่ */
export async function vatOutWith(c: Db, month: string): Promise<VatReport> {
  const { rows } = await c.query(
    `select ${VAT_COLS} from documents d
      where ${SALES_DOCS} and d.vat_amount > 0.004 and to_char(d.doc_date, 'YYYY-MM') = $1
      order by d.doc_date, d.doc_no`, [month]);
  return vatReport(rows, 'sell');
}

/** รายงานภาษีซื้อ — ใบซื้อและค่าใช้จ่ายที่มีภาษีซื้อในงวด */
export async function vatInWith(c: Db, month: string): Promise<VatReport> {
  const { rows } = await c.query(
    `select ${VAT_COLS} from documents d
      where d.status <> 'void' and d.direction = 'buy' and d.vat_amount > 0.004
        and to_char(d.doc_date, 'YYYY-MM') = $1
      order by d.doc_date, d.doc_no`, [month]);
  return vatReport(rows, 'buy');
}

/* =====================================================================
   ภาษีหัก ณ ที่จ่ายที่อู่เป็นผู้หัก (ภ.ง.ด.3 / ภ.ง.ด.53)
   ===================================================================== */

export interface WhtRow {
  id: string;
  docNo: string;
  docDate: string;
  partyName: string;
  partyTaxId: string;
  partyAddr: string;
  /** ประเภทเงินได้ — หมวดค่าใช้จ่ายของเอกสาร */
  cat: string;
  base: number;
  rate: number;
  wht: number;
}

export interface WhtReport {
  rows: WhtRow[];
  base: number;
  wht: number;
}

/**
 * ค่าใช้จ่ายที่อู่หักภาษี ณ ที่จ่ายไว้ — แยกแบบตามชนิดผู้รับเงิน
 * ฐานคือ net_amount เพราะค่าใช้จ่ายคิดภาษีหักจากยอดก่อน VAT ทั้งใบ (exTotals ใน core)
 */
export async function whtPaidWith(c: Db, month: string, form: 'pnd3' | 'pnd53'): Promise<WhtReport> {
  const { rows } = await c.query(
    `select d.id, d.doc_no, d.doc_date::text as doc_date, d.party_name, d.party_tax_id,
            d.party_addr_text, d.expense_cat::text as cat, d.net_amount, d.wht_rate, d.wht_amount
       from documents d
      where d.status <> 'void' and d.kind = 'EX' and d.wht_amount > 0.004
        and d.party_type = $2 and to_char(d.doc_date, 'YYYY-MM') = $1
      order by d.doc_date, d.doc_no`, [month, form === 'pnd3' ? 'person' : 'company']);
  const out = rows.map((r) => ({
    id: String(r.id), docNo: String(r.doc_no), docDate: String(r.doc_date),
    partyName: String(r.party_name ?? ''), partyTaxId: String(r.party_tax_id ?? ''),
    partyAddr: String(r.party_addr_text ?? ''), cat: String(r.cat ?? ''),
    base: n(r.net_amount), rate: n(r.wht_rate), wht: n(r.wht_amount),
  }));
  return {
    rows: out,
    base: round2(out.reduce((s, r) => s + r.base, 0)),
    wht: round2(out.reduce((s, r) => s + r.wht, 0)),
  };
}

/* =====================================================================
   เงินเดือน — ภ.ง.ด.1 และ สปส.1-10
   ===================================================================== */

export interface PayTaxRow {
  employeeId: string;
  name: string;
  taxId: string;
  /** เงินได้ทั้งงวด (เงินเดือน + ล่วงเวลา + อื่น ๆ) */
  income: number;
  wht: number;
  /** ค่าจ้างที่ใช้เป็นฐานเงินสมทบ — อยู่ในช่วงขั้นต่ำถึงเพดาน */
  ssoWage: number;
  /** เงินสมทบส่วนลูกจ้าง — นายจ้างสมทบเท่ากัน */
  sso: number;
}

export interface PayTaxReport {
  payDate: string | null;
  rows: PayTaxRow[];
  income: number;
  wht: number;
  ssoWage: number;
  sso: number;
}

/**
 * บรรทัดเงินเดือนของงวด — ใช้ทั้ง ภ.ง.ด.1 (ทุกคนที่ได้รับเงิน) และ สปส.1-10 (เฉพาะคนที่หักสมทบ)
 * ผู้เรียกกรองเองว่าแบบไหนแสดงใคร
 */
export async function payTaxWith(
  c: Db, month: string, by: 'period' | 'payDate' = 'period',
): Promise<PayTaxReport> {
  /*
   * สองแบบนี้นับคนละเดือน (ตรวจ 24 พ.ย. 2569)
   *   สปส.1-10  ตาม**งวดค่าจ้าง** (period)
   *   ภ.ง.ด.1    ตาม**วันที่จ่ายเงิน** (pay_date) — งวด ธ.ค. ที่จ่าย 5 ม.ค. ต้องอยู่ในแบบของเดือน ม.ค.
   * เดือนหนึ่งจึงมีได้หลายงวดในแบบ ภ.ง.ด.1 (งวดก่อนจ่ายต้นเดือน งวดนี้จ่ายปลายเดือน) — แสดงทุกบรรทัดเรียงตามวันที่จ่าย
   */
  const head = await c.query(
    by === 'payDate'
      ? `select id, period, pay_date::text as pay_date from payroll_runs
          where to_char(pay_date, 'YYYY-MM') = $1 order by pay_date, period`
      : `select id, period, pay_date::text as pay_date from payroll_runs where period = $1`, [month]);
  if (!head.rows[0]) return { payDate: null, rows: [], income: 0, wht: 0, ssoWage: 0, sso: 0 };
  const { rows } = await c.query(
    `select i.employee_id, i.name, i.tax_id, i.base, i.base + i.overtime + i.other_income as income,
            i.wht, i.sso, r.period
       from payroll_items i join payroll_runs r on r.id = i.run_id
      where i.run_id = any($1::uuid[]) order by r.pay_date, r.period, i.line_no`,
    [head.rows.map((h) => h.id)]);
  const out = rows.map((r) => {
    const sso = n(r.sso);
    return {
      employeeId: String(r.employee_id), name: String(r.name), taxId: String(r.tax_id ?? ''),
      income: n(r.income), wht: n(r.wht), sso,
      ssoWage: sso > 0 ? ssoWageOf(n(r.base), String(r.period)) : 0,
    };
  });
  return {
    /* หลายงวดในเดือนเดียว (เฉพาะ ภ.ง.ด.1) — แสดงวันที่จ่ายล่าสุด */
    payDate: head.rows[head.rows.length - 1].pay_date,
    rows: out,
    income: round2(out.reduce((s, r) => s + r.income, 0)),
    wht: round2(out.reduce((s, r) => s + r.wht, 0)),
    ssoWage: round2(out.reduce((s, r) => s + r.ssoWage, 0)),
    sso: round2(out.reduce((s, r) => s + r.sso, 0)),
  };
}

/* =====================================================================
   หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)
   ===================================================================== */

export interface WhtCert {
  /** แบบที่ยื่น — ติ๊กช่องบนหนังสือรับรอง */
  form: 'pnd1' | 'pnd3' | 'pnd53';
  payeeName: string;
  payeeTaxId: string;
  payeeAddr: string;
  /** คำอธิบายเงินได้ */
  incomeLabel: string;
  /** วันที่จ่าย (ใบเดียว) หรือปีภาษี (เงินเดือนทั้งปี) */
  paidOn: string;
  income: number;
  wht: number;
  /** เงินสมทบประกันสังคมที่หักไว้ทั้งปี — เฉพาะเงินเดือน */
  sso: number;
  /** เลขที่อ้างอิงของหนังสือรับรอง */
  refNo: string;
}

/** 50 ทวิ ของค่าใช้จ่ายหนึ่งใบ — คืน null ถ้าไม่พบหรือใบนั้นไม่ได้หักภาษี */
export async function whtCertForDocWith(c: Db, docId: string): Promise<WhtCert | null> {
  const { rows } = await c.query(
    `select d.doc_no, d.doc_date::text as doc_date, d.party_type::text as party_type, d.party_name,
            d.party_tax_id, d.party_addr_text, d.net_amount, d.wht_amount, d.wht_rate, d.note,
            (select string_agg(i.name, ', ' order by i.line_no) from doc_items i where i.doc_id = d.id) as items
       from documents d
      where d.id = $1 and d.status <> 'void' and d.kind = 'EX' and d.wht_amount > 0.004`, [docId]);
  const r = rows[0];
  if (!r) return null;
  const items = String(r.items ?? '').slice(0, 120);
  return {
    form: r.party_type === 'company' ? 'pnd53' : 'pnd3',
    payeeName: String(r.party_name ?? ''), payeeTaxId: String(r.party_tax_id ?? ''),
    payeeAddr: String(r.party_addr_text ?? ''),
    incomeLabel: `${items || 'ค่าบริการ'} (หัก ${n(r.wht_rate)}%)`,
    paidOn: String(r.doc_date), income: n(r.net_amount), wht: n(r.wht_amount), sso: 0,
    refNo: String(r.doc_no),
  };
}

/** 50 ทวิ ของพนักงานหนึ่งคนทั้งปีภาษี (ค.ศ.) — รวมทุกงวดที่**จ่ายเงิน**ในปีนั้น (ปีภาษีนับตามวันที่จ่าย ไม่ใช่งวดค่าจ้าง) */
export async function whtCertForEmployeeWith(c: Db, employeeId: string, year: number): Promise<WhtCert | null> {
  const emp = await c.query(
    `select code, name, coalesce(tax_id, '') as tax_id, addr_text from employees where id = $1`, [employeeId]);
  if (!emp.rows[0]) return null;
  const { rows } = await c.query(
    `select coalesce(sum(i.base + i.overtime + i.other_income), 0) as income,
            coalesce(sum(i.wht), 0) as wht, coalesce(sum(i.sso), 0) as sso, count(*)::int as n
       from payroll_items i join payroll_runs r on r.id = i.run_id
      where i.employee_id = $1 and extract(year from r.pay_date) = $2`, [employeeId, year]);
  if (!rows[0] || rows[0].n === 0) return null;
  return {
    form: 'pnd1',
    payeeName: String(emp.rows[0].name), payeeTaxId: String(emp.rows[0].tax_id),
    payeeAddr: String(emp.rows[0].addr_text ?? ''),
    incomeLabel: 'เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)',
    paidOn: `ปีภาษี ${year + 543}`, income: n(rows[0].income), wht: n(rows[0].wht), sso: n(rows[0].sso),
    refNo: `${emp.rows[0].code}/${year + 543}`,
  };
}
