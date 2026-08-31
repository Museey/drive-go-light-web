import { round2 } from './num.js';
import { monthKey } from './date.js';
import { exTotals, poTotals, recTotals } from './totals.js';
import type { ExpenseDoc, PurchaseDoc, SalesDoc, ShopContext, VatMonth } from './types.js';

/** ชุดเอกสารทั้งหมดที่เข้าการคำนวณภาษีมูลค่าเพิ่ม */
export interface VatDataset {
  /** เอกสารขายที่นับเป็นยอดขาย — ใช้ salesDocs() สร้าง อย่าส่ง invoices+receipts ดิบ */
  sales: SalesDoc[];
  purchases: PurchaseDoc[];
  expenses: ExpenseDoc[];
}

/**
 * เอกสารขายที่นับเป็นยอดขาย
 *
 * ใบเสร็จที่ออกต่อจากใบส่งมอบ (มี invId) ไม่นับซ้ำ เพราะใบส่งมอบนับไปแล้ว
 * มิฉะนั้นยอดขายและภาษีขายจะถูกนับสองรอบ
 */
export function salesDocs(invoices: SalesDoc[], receipts: SalesDoc[]): SalesDoc[] {
  return invoices.concat(receipts.filter((r) => !r.invId));
}

/** งวดภาษีทั้งหมดที่มีเอกสาร เรียงจากเก่าไปใหม่ */
export function vatMonthKeys(db: VatDataset): string[] {
  const ks = new Set<string>();
  db.sales.forEach((r) => ks.add(monthKey(r.date)));
  db.purchases.forEach((p) => ks.add(monthKey(p.date)));
  db.expenses.forEach((e) => ks.add(monthKey(e.date)));
  return [...ks].sort();
}

/** ภาษีขายและภาษีซื้อของงวดหนึ่ง */
export function vatOfMonth(db: VatDataset, key: string, ctx: ShopContext): { out: number; in: number } {
  const out = db.sales
    .filter((r) => monthKey(r.date) === key)
    .reduce((s, r) => s + recTotals(r, ctx).vat, 0);

  const inn =
    db.purchases.filter((p) => monthKey(p.date) === key).reduce((s, p) => s + poTotals(p, ctx).vat, 0) +
    db.expenses.filter((e) => monthKey(e.date) === key).reduce((s, e) => s + exTotals(e, ctx).vat, 0);

  return { out: round2(out), in: round2(inn) };
}

/** ยอดภาษีขายและภาษีซื้อของงวดหนึ่ง ก่อนคิดเครดิตยกยอด */
export interface VatMonthInput {
  /** 'YYYY-MM' */
  key: string;
  out: number;
  in: number;
}

/**
 * กฎเครดิตภาษียกยอด — งวดใดภาษีซื้อมากกว่าภาษีขาย ส่วนเกินยกไปหักงวดถัดไป
 *
 * แยกออกมาจาก vatChain() เพื่อให้ป้อนยอดสรุปรายเดือนที่มาจากที่อื่นได้ด้วย
 * (เช่น รวมมาจากฐานข้อมูลแล้ว ไม่ต้องโหลดเอกสารทุกใบมาคำนวณใหม่)
 * กฎยกยอดจึงมีอยู่ที่เดียว ไม่ว่าตัวเลขจะมาจากทางไหน
 *
 * ต้องเรียงงวดจากเก่าไปใหม่มาก่อน มิฉะนั้นเครดิตจะยกผิดทาง
 */
export function vatChainFromMonths(months: VatMonthInput[]): VatMonth[] {
  let carry = 0;
  return months.map((m) => {
    const carryIn = carry;
    const net = round2(m.out - m.in - carryIn);
    const payable = net > 0 ? net : 0;
    const carryOut = net < 0 ? -net : 0;
    carry = carryOut;
    return { key: m.key, out: m.out, in: m.in, carryIn, payable, carryOut };
  });
}

/**
 * ไล่คำนวณภาษีทีละงวดตามลำดับเวลาจากเอกสารทั้งหมด
 * งวดใดภาษีซื้อมากกว่าภาษีขาย ส่วนเกินกลายเป็นเครดิตยกไปหักงวดถัดไป
 */
export function vatChain(db: VatDataset, ctx: ShopContext): VatMonth[] {
  return vatChainFromMonths(
    vatMonthKeys(db).map((key) => ({ key, ...vatOfMonth(db, key, ctx) })),
  );
}

/** เครดิตภาษีที่ยกมา ณ ต้นงวดที่ระบุ */
export function vatCarryInto(db: VatDataset, fromKey: string, ctx: ShopContext): number {
  if (!fromKey) return 0;
  let carry = 0;
  vatChain(db, ctx).forEach((m) => {
    if (m.key < fromKey) carry = m.carryOut;
  });
  return carry;
}
