import { monthKey } from './date.js';
import { OPS_CATS } from './expense-cats.js';
import { exTotals, poTotals, recTotals } from './totals.js';
import type { ExpenseCatKey, ExpenseDoc, PurchaseDoc, SalesDoc, ShopContext } from './types.js';

export interface PLMonthRow {
  key: string;
  /** รายได้ */
  revenue: number;
  /** ต้นทุนขาย */
  cogs: number;
  /** ค่าใช้จ่ายดำเนินงาน */
  ops: number;
  /** กำไรสุทธิ */
  netProfit: number;
}

export interface ProfitAndLoss {
  revenue: number;
  cogs: number;
  grossProfit: number;
  opsByCat: Record<ExpenseCatKey, number>;
  opsTotal: number;
  /** ซื้อสินทรัพย์ — ไม่ใช่ค่าใช้จ่ายของงวด แสดงแยกไว้ให้เห็น */
  assetTotal: number;
  netProfit: number;
  months: PLMonthRow[];
}

/**
 * งบกำไรขาดทุน
 *
 * ใช้มูลค่าก่อนภาษีมูลค่าเพิ่ม (net) ทุกรายการ เพราะ VAT ไม่ใช่รายได้หรือค่าใช้จ่ายของกิจการ
 * — อู่เป็นแค่คนเก็บแทนกรมสรรพากร
 *
 * ซื้อสินทรัพย์ไม่ถูกหักเป็นค่าใช้จ่ายของงวด (ต้องคิดค่าเสื่อมราคาแทน)
 * ระบบยังไม่ได้คำนวณค่าเสื่อมให้ ตัวเลขจึงเป็นกำไรก่อนหักค่าเสื่อม
 */
export function profitAndLoss(
  db: { sales: SalesDoc[]; purchases: PurchaseDoc[]; expenses: ExpenseDoc[] },
  ctx: ShopContext,
): ProfitAndLoss {
  const revenue = db.sales.reduce((s, r) => s + recTotals(r, ctx).net, 0);
  const cogs = db.purchases.reduce((s, p) => s + poTotals(p, ctx).net, 0);
  const grossProfit = revenue - cogs;

  const opsByCat = Object.fromEntries(OPS_CATS.map((c) => [c.key, 0])) as Record<ExpenseCatKey, number>;
  let assetTotal = 0;

  db.expenses.forEach((e) => {
    const net = exTotals(e, ctx).net;
    if (e.cat === 'asset') assetTotal += net;
    else opsByCat[e.cat] = (opsByCat[e.cat] ?? 0) + net;
  });

  const opsTotal = Object.values(opsByCat).reduce((a, b) => a + b, 0);

  const keys = [
    ...new Set([
      ...db.sales.map((r) => monthKey(r.date)),
      ...db.purchases.map((p) => monthKey(p.date)),
      ...db.expenses.map((e) => monthKey(e.date)),
    ]),
  ].sort();

  const months = keys.map((key) => {
    const rv = db.sales.filter((r) => monthKey(r.date) === key).reduce((s, r) => s + recTotals(r, ctx).net, 0);
    const cg = db.purchases.filter((p) => monthKey(p.date) === key).reduce((s, p) => s + poTotals(p, ctx).net, 0);
    const op = db.expenses
      .filter((e) => monthKey(e.date) === key && e.cat !== 'asset')
      .reduce((s, e) => s + exTotals(e, ctx).net, 0);
    return { key, revenue: rv, cogs: cg, ops: op, netProfit: rv - cg - op };
  });

  return {
    revenue, cogs, grossProfit, opsByCat, opsTotal, assetTotal,
    netProfit: grossProfit - opsTotal,
    months,
  };
}
