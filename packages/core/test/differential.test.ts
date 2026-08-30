/**
 * เทียบผลของ @drivegolight/core กับโค้ดของโปรแกรมเดิมที่ดึงออกมาจาก drivegolight.html
 *
 * นี่คือเทสต์ที่สำคัญที่สุดในแพ็กเกจนี้ ถ้าอันนี้ผ่าน แปลว่าลูกค้าที่ย้ายจากไฟล์ HTML
 * มาขึ้นเว็บจะเห็นยอดเงินและยอดภาษีเท่าเดิมทุกบาททุกสตางค์
 *
 * ถ้าอันนี้แดง อย่าไปแก้ค่าที่คาดหวัง — ให้กลับไปดูว่าพอร์ตสูตรผิดตรงไหน
 */
import { describe, expect, it } from 'vitest';
import { makeLegacy } from './legacy.generated.mjs';
import {
  addDays, apDueOf, apTotalOf, arDue, arTotal, bahttext, daysBetween,
  exTotals, laterPaidOf, paidOf, payState, poTotals, recTotals,
  salesDocs, totalsOf, vatChain, whtBaseOf,
} from '../src/index.js';
import type { ExpenseCatKey, ExpenseDoc, PurchaseDoc, SalesDoc, VatMode } from '../src/index.js';

/** สุ่มแบบมี seed เพื่อให้เทสต์ล้มซ้ำได้เหมือนเดิมทุกครั้ง */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const VAT_MODES: VatMode[] = ['none', 'ex', 'in'];
const WHT_RATES = [0, 1, 1.5, 2, 3, 5, 10];
const CATS: ExpenseCatKey[] = ['rent', 'utility', 'salary', 'telecom', 'asset', 'other'];

function makeItems(rand: () => number) {
  const n = 1 + Math.floor(rand() * 6);
  return Array.from({ length: n }, (_, i) => {
    const r = rand();
    const asLabor = r < 0.2;
    const legacyLabor = r >= 0.2 && r < 0.3; // เอกสารรุ่นเก่า: ไม่มี svc ใช้ code 'LAB'
    return {
      pid: legacyLabor || asLabor ? null : `p${i}`,
      code: legacyLabor ? 'LAB' : `SKU-${i}`,
      name: `รายการ ${i}`,
      unit: 'ชิ้น',
      // จำนวนมีทศนิยมได้ (เช่น น้ำมันเครื่อง 3.5 ลิตร)
      qty: rand() < 0.25 ? Math.round(rand() * 900) / 100 : 1 + Math.floor(rand() * 9),
      // ราคามีเศษสตางค์ได้ เพื่อไล่จับปัญหาการปัดเศษ
      price: rand() < 0.3 ? Math.round(rand() * 2000000) / 100 : Math.round(rand() * 9000),
      ...(asLabor ? { svc: true } : {}),
    };
  });
}

function makePayments(rand: () => number, ceiling: number) {
  const n = Math.floor(rand() * 4);
  return Array.from({ length: n }, () => ({
    id: 'x',
    date: '2026-01-01',
    amount: Math.round(rand() * ceiling * 100) / 100,
    method: 'เงินโอน',
    ref: '',
    atIssue: rand() < 0.4,
  }));
}

function randomDate(rand: () => number) {
  const y = 2024 + Math.floor(rand() * 3);
  const m = 1 + Math.floor(rand() * 12);
  const d = 1 + Math.floor(rand() * 28);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function makeSalesDoc(rand: () => number, i: number): SalesDoc & { no: string; id: string } {
  const items = makeItems(rand);
  const sub = items.reduce((s, it) => s + it.qty * it.price, 0);
  const kindRoll = rand();
  const kind = kindRoll < 0.4 ? 'RC' : kindRoll < 0.7 ? 'IVT' : 'IV';
  return {
    id: `s${i}`,
    no: `${kind}-202601-${i}`,
    kind,
    date: randomDate(rand),
    items,
    discount: rand() < 0.4 ? Math.round(rand() * sub * 100) / 100 : 0,
    vatMode: VAT_MODES[Math.floor(rand() * VAT_MODES.length)]!,
    whtRate: WHT_RATES[Math.floor(rand() * WHT_RATES.length)]!,
    creditDays: Math.floor(rand() * 60),
    invId: null,
    pay: { cash: rand() < 0.5, credit: rand() < 0.5, days: 30 },
    payments: makePayments(rand, sub),
  };
}

function makePurchase(rand: () => number, i: number): PurchaseDoc & { no: string; id: string } {
  const items = makeItems(rand);
  const sub = items.reduce((s, it) => s + it.qty * it.price, 0);
  return {
    id: `p${i}`,
    no: `PO-202601-${i}`,
    date: randomDate(rand),
    items,
    discount: rand() < 0.3 ? Math.round(rand() * sub * 100) / 100 : 0,
    vatMode: VAT_MODES[Math.floor(rand() * VAT_MODES.length)]!,
    terms: rand() < 0.5 ? 'cash' : 'credit',
    creditDays: Math.floor(rand() * 60),
    payments: makePayments(rand, sub),
  };
}

function makeExpense(rand: () => number, i: number): ExpenseDoc & { no: string; id: string } {
  const items = makeItems(rand);
  const sub = items.reduce((s, it) => s + it.qty * it.price, 0);
  return {
    id: `e${i}`,
    // เลขที่ต้องขึ้นต้นด้วย EX- เพราะ isExpenseDoc() ของเดิมดูจากตรงนี้
    no: `EX-202601-${i}`,
    date: randomDate(rand),
    cat: CATS[Math.floor(rand() * CATS.length)]!,
    items,
    discount: rand() < 0.3 ? Math.round(rand() * sub * 100) / 100 : 0,
    vatMode: VAT_MODES[Math.floor(rand() * VAT_MODES.length)]!,
    whtRate: WHT_RATES[Math.floor(rand() * WHT_RATES.length)]!,
    terms: rand() < 0.5 ? 'cash' : 'credit',
    creditDays: Math.floor(rand() * 60),
    payments: makePayments(rand, sub),
  };
}

const VAT_RATES = [7, 0, 10, 7.5];

describe('เทียบยอดเอกสารกับโปรแกรมเดิม (สุ่ม 4,000 ใบ)', () => {
  for (const vatRate of VAT_RATES) {
    it(`vatRate = ${vatRate}%`, () => {
      const rand = rng(20260828 + vatRate * 1000);
      const legacy = makeLegacy({
        shop: { vatRate },
        invoices: [], receipts: [], purchases: [], expenses: [],
      });
      const ctx = { vatRate };

      for (let i = 0; i < 1000; i++) {
        const sale = makeSalesDoc(rand, i);
        expect(totalsOf(sale, ctx), `totalsOf ใบที่ ${i}`).toEqual(legacy.totalsOf(sale));
        expect(whtBaseOf(sale, ctx), `whtBaseOf ใบที่ ${i}`).toBe(legacy.whtBaseOf(sale));
        expect(recTotals(sale, ctx), `recTotals ใบที่ ${i}`).toEqual(legacy.recTotals(sale));
        expect(paidOf(sale)).toBe(legacy.paidOf(sale));
        expect(laterPaidOf(sale)).toBe(legacy.laterPaidOf(sale));
        expect(arTotal(sale, ctx)).toBe(legacy.arTotal(sale));
        expect(arDue(sale, ctx)).toBe(legacy.arDue(sale));

        const po = makePurchase(rand, i);
        expect(poTotals(po, ctx), `poTotals ใบที่ ${i}`).toEqual(legacy.poTotals(po));
        expect(apTotalOf(po, ctx)).toBe(legacy.apTotalOf(po));
        expect(apDueOf(po, ctx)).toBe(legacy.apDueOf(po));

        const ex = makeExpense(rand, i);
        expect(exTotals(ex, ctx), `exTotals ใบที่ ${i}`).toEqual(legacy.exTotals(ex));
        expect(apTotalOf(ex, ctx)).toBe(legacy.apTotalOf(ex));
        expect(apDueOf(ex, ctx)).toBe(legacy.apDueOf(ex));

        const total = recTotals(sale, ctx).payable;
        expect(payState(total, paidOf(sale))).toBe(legacy.payState(total, legacy.paidOf(sale)));
      }
    });
  }
});

describe('เทียบเครดิตภาษีมูลค่าเพิ่มยกยอดข้ามเดือน', () => {
  it('vatChain ตรงกับของเดิมทุกงวด', () => {
    const rand = rng(777);
    const vatRate = 7;

    const invoices = Array.from({ length: 60 }, (_, i) => makeSalesDoc(rand, i));
    // ใบเสร็จบางใบออกต่อจากใบส่งมอบ ต้องไม่ถูกนับซ้ำ
    const receipts = Array.from({ length: 60 }, (_, i) => {
      const r = makeSalesDoc(rand, 100 + i);
      r.kind = 'RC';
      if (i % 3 === 0) r.invId = invoices[i % invoices.length]!.id;
      return r;
    });
    const purchases = Array.from({ length: 40 }, (_, i) => makePurchase(rand, i));
    const expenses = Array.from({ length: 40 }, (_, i) => makeExpense(rand, i));

    const legacy = makeLegacy({ shop: { vatRate }, invoices, receipts, purchases, expenses });

    const mine = vatChain(
      { sales: salesDocs(invoices, receipts), purchases, expenses },
      { vatRate },
    );

    expect(mine).toEqual(legacy.vatChain());
    expect(mine.length).toBeGreaterThan(10);   // กันเทสต์ผ่านเพราะไม่มีข้อมูล
  });

  it('salesDocs ไม่นับใบเสร็จที่ออกต่อจากใบส่งมอบซ้ำ', () => {
    const rand = rng(9);
    const invoices = [makeSalesDoc(rand, 1)];
    const linked = makeSalesDoc(rand, 2);
    linked.invId = invoices[0]!.id;
    const standalone = makeSalesDoc(rand, 3);

    const legacy = makeLegacy({
      shop: { vatRate: 7 }, invoices, receipts: [linked, standalone], purchases: [], expenses: [],
    });

    expect(salesDocs(invoices, [linked, standalone])).toEqual(legacy.salesDocs());
    expect(salesDocs(invoices, [linked, standalone])).toHaveLength(2);
  });
});

describe('เทียบวันที่และตัวหนังสือจำนวนเงิน', () => {
  it('addDays / daysBetween ตรงกับของเดิม', () => {
    const rand = rng(31);
    const legacy = makeLegacy({ shop: { vatRate: 7 } });
    for (let i = 0; i < 500; i++) {
      const a = randomDate(rand);
      const b = randomDate(rand);
      const n = Math.floor(rand() * 400) - 100;
      expect(addDays(a, n)).toBe(legacy.addDays(a, n));
      expect(daysBetween(a, b)).toBe(legacy.daysBetween(a, b));
    }
  });

  it('bahttext ตรงกับของเดิม', () => {
    const rand = rng(42);
    const legacy = makeLegacy({ shop: { vatRate: 7 } });
    for (let i = 0; i < 3000; i++) {
      const v = Math.round(rand() * 99999999 * 100) / 100;
      expect(bahttext(v), `จำนวน ${v}`).toBe(legacy.bahttext(v));
    }
  });
});
