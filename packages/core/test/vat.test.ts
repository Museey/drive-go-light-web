/**
 * เครดิตภาษีมูลค่าเพิ่มยกยอดข้ามงวด — ส่วนที่ผิดแล้วลูกค้าเสียหายจริงกับสรรพากร
 */
import { describe, expect, it } from 'vitest';
import { salesDocs, vatCarryInto, vatChain, vatMonthKeys } from '../src/index.js';
import type { ExpenseDoc, PurchaseDoc, SalesDoc } from '../src/index.js';

const VAT7 = { vatRate: 7 };

const sale = (date: string, amount: number): SalesDoc => ({
  date, items: [{ qty: 1, price: amount }], vatMode: 'ex', whtRate: 0, payments: [],
});
const purchase = (date: string, amount: number): PurchaseDoc => ({
  date, items: [{ qty: 1, price: amount }], vatMode: 'ex', payments: [],
});
const expense = (date: string, amount: number): ExpenseDoc => ({
  date, cat: 'other', items: [{ qty: 1, price: amount }], vatMode: 'ex', whtRate: 0, payments: [],
});

describe('vatChain — ภาษีขายหักภาษีซื้อรายเดือน', () => {
  it('ภาษีขายมากกว่าภาษีซื้อ → ต้องชำระ ไม่มีเครดิตยกไป', () => {
    const db = { sales: [sale('2026-01-10', 100000)], purchases: [purchase('2026-01-05', 40000)], expenses: [] };
    const [m] = vatChain(db, VAT7);
    expect(m!.out).toBe(7000);
    expect(m!.in).toBe(2800);
    expect(m!.payable).toBe(4200);
    expect(m!.carryOut).toBe(0);
  });

  it('ภาษีซื้อมากกว่าภาษีขาย → ไม่ต้องชำระ ส่วนเกินเป็นเครดิตยกไปเดือนหน้า', () => {
    const db = { sales: [sale('2026-01-10', 10000)], purchases: [purchase('2026-01-05', 50000)], expenses: [] };
    const [m] = vatChain(db, VAT7);
    expect(m!.payable).toBe(0);
    expect(m!.carryOut).toBe(2800);   // (50,000 - 10,000) × 7%
  });

  it('เครดิตถูกยกไปหักในเดือนถัดไปจริง', () => {
    const db = {
      sales: [sale('2026-01-10', 10000), sale('2026-02-10', 100000)],
      purchases: [purchase('2026-01-05', 50000)],
      expenses: [],
    };
    const chain = vatChain(db, VAT7);
    expect(chain.map((m) => m.key)).toEqual(['2026-01', '2026-02']);

    expect(chain[0]!.carryOut).toBe(2800);
    expect(chain[1]!.carryIn).toBe(2800);
    expect(chain[1]!.out).toBe(7000);
    expect(chain[1]!.payable).toBe(4200);   // 7,000 - 0 - 2,800
    expect(chain[1]!.carryOut).toBe(0);
  });

  it('เครดิตยกข้ามได้หลายเดือนติดกันจนกว่าจะถูกใช้หมด', () => {
    const db = {
      sales: [sale('2026-01-10', 1000), sale('2026-02-10', 1000), sale('2026-03-10', 200000)],
      purchases: [purchase('2026-01-05', 100000)],
      expenses: [],
    };
    const chain = vatChain(db, VAT7);
    expect(chain[0]!.carryOut).toBe(6930);   // (100,000 - 1,000) × 7%
    expect(chain[1]!.carryIn).toBe(6930);
    expect(chain[1]!.carryOut).toBe(6860);   // เดือนนี้ขายได้แค่ 1,000 เครดิตเหลือ
    expect(chain[2]!.carryIn).toBe(6860);
    expect(chain[2]!.payable).toBe(7140);    // 14,000 - 6,860
  });

  it('ภาษีซื้อรวมทั้งใบซื้อและค่าใช้จ่าย', () => {
    const db = {
      sales: [sale('2026-01-10', 100000)],
      purchases: [purchase('2026-01-05', 20000)],
      expenses: [expense('2026-01-06', 20000)],
    };
    expect(vatChain(db, VAT7)[0]!.in).toBe(2800);
  });

  it('vatCarryInto บอกเครดิตที่ยกมา ณ ต้นงวดที่เลือก', () => {
    const db = {
      sales: [sale('2026-01-10', 1000), sale('2026-02-10', 1000)],
      purchases: [purchase('2026-01-05', 100000)],
      expenses: [],
    };
    expect(vatCarryInto(db, '2026-02', VAT7)).toBe(6930);
    expect(vatCarryInto(db, '2026-01', VAT7)).toBe(0);   // งวดแรก ไม่มีอะไรยกมา
    expect(vatCarryInto(db, '', VAT7)).toBe(0);
  });

  it('งวดเรียงจากเก่าไปใหม่เสมอ ไม่ว่าเอกสารจะเรียงมาอย่างไร', () => {
    const db = {
      sales: [sale('2026-03-01', 100), sale('2026-01-01', 100), sale('2026-02-01', 100)],
      purchases: [], expenses: [],
    };
    expect(vatMonthKeys(db)).toEqual(['2026-01', '2026-02', '2026-03']);
  });
});

describe('salesDocs — กันนับยอดขายซ้ำ', () => {
  it('ใบเสร็จที่ออกต่อจากใบส่งมอบไม่ถูกนับซ้ำ', () => {
    const inv: SalesDoc & { id: string } = { ...sale('2026-01-10', 1000), kind: 'IVT', id: 'inv1' };
    const receiptOfInvoice: SalesDoc = { ...sale('2026-01-15', 1000), kind: 'RC', invId: 'inv1' };
    const walkIn: SalesDoc = { ...sale('2026-01-20', 500), kind: 'RC' };

    const docs = salesDocs([inv], [receiptOfInvoice, walkIn]);
    expect(docs).toHaveLength(2);

    // ถ้านับซ้ำ ภาษีขายจะกลายเป็น 175 แทนที่จะเป็น 105
    expect(vatChain({ sales: docs, purchases: [], expenses: [] }, VAT7)[0]!.out).toBe(105);
  });
});
