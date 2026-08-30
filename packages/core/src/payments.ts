import { EPS, num, round2 } from './num.js';
import { addDays } from './date.js';
import { exTotals, poTotals, recTotals } from './totals.js';
import type {
  ExpenseDoc, PayableDoc, PayStatus, PurchaseDoc, SalesDoc, ShopContext,
} from './types.js';

/** เอกสารนี้เป็นใบส่งมอบ/ใบแจ้งหนี้หรือไม่ */
export const isInvoice = (d: SalesDoc): boolean => d.kind === 'IV' || d.kind === 'IVT';

/** ยอดที่ชำระไปแล้วทั้งหมด */
export function paidOf(doc: PayableDoc): number {
  return round2((doc.payments ?? []).reduce((s, x) => s + num(x.amount), 0));
}

/** ยอดที่ชำระหลังออกเอกสาร (ไม่นับที่ชำระตอนออกเอกสาร) */
export function laterPaidOf(doc: PayableDoc): number {
  return round2((doc.payments ?? []).filter((x) => !x.atIssue).reduce((s, x) => s + num(x.amount), 0));
}

/** สถานะการชำระเงิน — ใช้ค่าความคลาดเคลื่อนครึ่งสตางค์แบบเดิม */
export function payState(total: number, paid: number): PayStatus {
  if (paid <= EPS) return 'unpaid';
  return paid + EPS < total ? 'partial' : 'paid';
}

/* ---------- ฝั่งลูกหนี้ (เอกสารขาย) ---------- */

export const arTotal = (r: SalesDoc, ctx: ShopContext): number => recTotals(r, ctx).payable;

export const arDue = (r: SalesDoc, ctx: ShopContext): number => round2(arTotal(r, ctx) - paidOf(r));

/** วันครบกำหนดชำระของเอกสารขาย */
export function arDueDate(r: SalesDoc): string {
  if (isInvoice(r)) return addDays(r.date, num(r.creditDays) || 0);
  return r.pay?.credit ? addDays(r.date, r.pay.days) : r.date;
}

/* ---------- ฝั่งเจ้าหนี้ (ใบซื้อ / ค่าใช้จ่าย) ---------- */

export const poDue = (p: PurchaseDoc): string =>
  p.terms === 'credit' ? addDays(p.date, p.creditDays) : p.date;

export const exDue = (e: ExpenseDoc): string =>
  e.terms === 'credit' ? addDays(e.date, e.creditDays) : e.date;

export const apTotalOf = (x: PurchaseDoc | ExpenseDoc, ctx: ShopContext): number =>
  isExpenseDoc(x) ? exTotals(x, ctx).payable : poTotals(x, ctx).payable;

export const apDueOf = (x: PurchaseDoc | ExpenseDoc, ctx: ShopContext): number =>
  round2(apTotalOf(x, ctx) - paidOf(x));

export const apDueDate = (x: PurchaseDoc | ExpenseDoc): string =>
  isExpenseDoc(x) ? exDue(x) : poDue(x);

/**
 * แยกใบซื้อออกจากบันทึกค่าใช้จ่าย
 *
 * ของเดิมดูจากเลขที่เอกสารที่ขึ้นต้นด้วย 'EX-' ซึ่งเปราะ — ในระบบใหม่มีคอลัมน์ kind
 * ให้ใช้อยู่แล้ว ตรงนี้จึงดูจากการมี cat เป็นหลัก
 */
export function isExpenseDoc(x: PurchaseDoc | ExpenseDoc): x is ExpenseDoc {
  return typeof (x as ExpenseDoc).cat === 'string' && (x as ExpenseDoc).cat !== undefined;
}
