import { num, round2 } from './num.js';
import type {
  BuyTotals, DocItem, ExpenseDoc, PurchaseDoc, SalesDoc,
  SalesTotals, ShopContext, Totals, TotalsInput,
} from './types.js';

/**
 * บรรทัดนี้เป็นค่าแรง/ค่าบริการหรือไม่ — ใช้เป็นฐานภาษีหัก ณ ที่จ่าย
 * เอกสารรุ่นก่อนไม่มีฟิลด์ svc ใช้รหัส 'LAB' แทน ต้องรองรับทั้งสองแบบ
 */
export function isServiceItem(it: DocItem): boolean {
  if (it.svc !== undefined) return !!it.svc;
  return it.code === 'LAB';
}

/**
 * ยอดรวมของเอกสาร
 *
 * vatMode: 'ex' ราคายังไม่รวม VAT · 'in' ราคารวม VAT แล้ว · 'none' ไม่คิด VAT
 *
 * หมายเหตุ: sub / disc / base จงใจไม่ปัดทศนิยม เพื่อให้ผลตรงกับโปรแกรมเดิมทุกบาท
 * ค่าที่ปัดแล้วมีเฉพาะ net / vat / grand
 */
export function totalsOf(doc: TotalsInput, ctx: ShopContext): Totals {
  const sub = doc.items.reduce((s, it) => s + num(it.qty) * num(it.price), 0);
  const disc = num(doc.discount);
  const base = Math.max(0, sub - disc);
  const rate = num(ctx.vatRate) / 100;

  let net = base;
  let vat = 0;
  let grand = base;

  if (doc.vatMode === 'ex') {
    vat = base * rate;
    grand = base + vat;
  } else if (doc.vatMode === 'in') {
    net = base / (1 + rate);
    vat = base - net;
    grand = base;
  }

  return { sub, disc, base, net: round2(net), vat: round2(vat), grand: round2(grand) };
}

/**
 * ฐานภาษีหัก ณ ที่จ่าย = มูลค่าค่าแรงก่อน VAT หลังเฉลี่ยส่วนลดตามสัดส่วนแล้ว
 */
export function whtBaseOf(doc: TotalsInput, ctx: ShopContext): number {
  const sub = doc.items.reduce((s, it) => s + num(it.qty) * num(it.price), 0);
  const svc = doc.items.filter(isServiceItem).reduce((s, it) => s + num(it.qty) * num(it.price), 0);
  if (svc <= 0 || sub <= 0) return 0;

  const share = svc / sub;
  let base = Math.max(0, svc - num(doc.discount) * share);
  if (doc.vatMode === 'in') base = base / (1 + num(ctx.vatRate) / 100);
  return round2(base);
}

/**
 * ยอดของเอกสารขาย — หักภาษี ณ ที่จ่ายจากฝั่งลูกค้า
 *
 * ลำดับการปัดของ wht สำคัญ: ปัด `whtBase * rate` เป็นจำนวนเต็มก่อน แล้วค่อยหาร 100
 * (ไม่ใช่ `round2(whtBase * rate / 100)`) — เป็นพฤติกรรมของโปรแกรมเดิม ห้ามเปลี่ยน
 */
export function recTotals(doc: SalesDoc, ctx: ShopContext): SalesTotals {
  const t = totalsOf(doc, ctx);
  const whtBase = whtBaseOf(doc, ctx);
  const wht = Math.round(whtBase * num(doc.whtRate)) / 100;
  return { ...t, whtBase, wht, payable: round2(t.grand - wht) };
}

/** ยอดของใบซื้อ — ฝั่งซื้อไม่มีการหักภาษี ณ ที่จ่าย ยอดที่ต้องจ่าย = ยอดรวมทั้งสิ้น */
export function poTotals(doc: PurchaseDoc, ctx: ShopContext): BuyTotals {
  const t = totalsOf(doc, ctx);
  return { ...t, wht: 0, payable: t.grand };
}

/**
 * ยอดของค่าใช้จ่าย — อู่เป็นผู้จ่ายเงิน จึงมีหน้าที่หักภาษี ณ ที่จ่ายและนำส่ง
 * ฐานที่ใช้คือ net (มูลค่าก่อน VAT) ต่างจากฝั่งขายที่ใช้เฉพาะค่าแรง
 */
export function exTotals(doc: ExpenseDoc, ctx: ShopContext): BuyTotals {
  const t = totalsOf(doc, ctx);
  const wht = Math.round(t.net * num(doc.whtRate)) / 100;
  return { ...t, wht, payable: round2(t.grand - wht) };
}
