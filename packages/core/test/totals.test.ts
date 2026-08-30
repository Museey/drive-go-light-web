/**
 * เคสตัวอย่างที่คิดเลขด้วยมือแล้ว — ไว้อธิบายว่าสูตรควรทำงานอย่างไร
 * เทสต์ชุด differential บอกได้แค่ว่า "เหมือนของเดิม" แต่ไม่ได้บอกว่า "ถูกต้อง"
 * สองชุดนี้ต้องมีคู่กัน
 */
import { describe, expect, it } from 'vitest';
import {
  exTotals, isServiceItem, paidOf, payState, poTotals, recTotals, totalsOf, whtBaseOf,
} from '../src/index.js';

const VAT7 = { vatRate: 7 };

describe('totalsOf — ภาษีมูลค่าเพิ่ม', () => {
  const items = [{ qty: 2, price: 1000 }];

  it('vatMode "ex" — ราคายังไม่รวม VAT บวกภาษีเพิ่ม 7%', () => {
    const t = totalsOf({ items, vatMode: 'ex' }, VAT7);
    expect(t.net).toBe(2000);
    expect(t.vat).toBe(140);
    expect(t.grand).toBe(2140);
  });

  it('vatMode "in" — ราคารวม VAT แล้ว ถอดภาษีออกจากยอด', () => {
    const t = totalsOf({ items: [{ qty: 1, price: 2140 }], vatMode: 'in' }, VAT7);
    expect(t.net).toBe(2000);
    expect(t.vat).toBe(140);
    expect(t.grand).toBe(2140);   // ยอดที่ลูกค้าจ่ายไม่เปลี่ยน
  });

  it('vatMode "none" — ไม่คิดภาษี', () => {
    const t = totalsOf({ items, vatMode: 'none' }, VAT7);
    expect(t.net).toBe(2000);
    expect(t.vat).toBe(0);
    expect(t.grand).toBe(2000);
  });

  it('ส่วนลดหักก่อนคำนวณภาษี', () => {
    const t = totalsOf({ items, discount: 500, vatMode: 'ex' }, VAT7);
    expect(t.base).toBe(1500);
    expect(t.vat).toBe(105);
    expect(t.grand).toBe(1605);
  });

  it('ส่วนลดมากกว่ายอด ฐานภาษีไม่ติดลบ', () => {
    const t = totalsOf({ items, discount: 5000, vatMode: 'ex' }, VAT7);
    expect(t.base).toBe(0);
    expect(t.grand).toBe(0);
  });

  it('เอกสารว่างได้ยอดศูนย์ ไม่พัง', () => {
    expect(totalsOf({ items: [], vatMode: 'ex' }, VAT7).grand).toBe(0);
  });

  it('รับตัวเลขที่เป็นข้อความและมีคอมมา (มาจากช่องกรอกของเดิม)', () => {
    const t = totalsOf({ items: [{ qty: '2', price: '1,000.50' }], vatMode: 'none' }, VAT7);
    expect(t.grand).toBe(2001);
  });
});

describe('whtBaseOf — ฐานภาษีหัก ณ ที่จ่าย', () => {
  it('นับเฉพาะค่าแรง ไม่นับค่าอะไหล่', () => {
    const doc = {
      items: [
        { qty: 2, price: 1450 },                        // อะไหล่ 2,900
        { qty: 1, price: 500, svc: true },              // ค่าแรง 500
      ],
      vatMode: 'ex' as const,
    };
    expect(whtBaseOf(doc, VAT7)).toBe(500);
  });

  it('เอกสารรุ่นเก่าใช้รหัส LAB แทนฟิลด์ svc', () => {
    expect(isServiceItem({ code: 'LAB', qty: 1, price: 500 })).toBe(true);
    expect(isServiceItem({ code: 'LAB', qty: 1, price: 500, svc: false })).toBe(false);
    expect(isServiceItem({ code: 'BRK-001', qty: 1, price: 500 })).toBe(false);
  });

  it('ส่วนลดถูกเฉลี่ยลงค่าแรงตามสัดส่วน', () => {
    // อะไหล่ 900 + ค่าแรง 100 = 1,000 · ค่าแรงคิดเป็น 10% ของยอด
    // ส่วนลด 200 จึงตกที่ค่าแรง 20 → ฐาน = 100 - 20 = 80
    const doc = {
      items: [{ qty: 1, price: 900 }, { qty: 1, price: 100, svc: true }],
      discount: 200,
      vatMode: 'ex' as const,
    };
    expect(whtBaseOf(doc, VAT7)).toBe(80);
  });

  it('ถ้าราคารวม VAT แล้ว ต้องถอด VAT ออกจากฐานก่อน', () => {
    const doc = { items: [{ qty: 1, price: 1070, svc: true }], vatMode: 'in' as const };
    expect(whtBaseOf(doc, VAT7)).toBe(1000);
  });

  it('ไม่มีค่าแรงเลย ฐานเป็นศูนย์', () => {
    expect(whtBaseOf({ items: [{ qty: 1, price: 900 }], vatMode: 'ex' }, VAT7)).toBe(0);
  });
});

describe('recTotals — เอกสารขาย', () => {
  it('หักภาษี ณ ที่จ่าย 3% จากค่าแรงเท่านั้น', () => {
    const doc = {
      date: '2026-08-01',
      items: [{ qty: 2, price: 1450 }, { qty: 1, price: 500, svc: true }],
      vatMode: 'ex' as const,
      whtRate: 3,
    };
    const t = recTotals(doc, VAT7);
    expect(t.net).toBe(3400);
    expect(t.vat).toBe(238);
    expect(t.grand).toBe(3638);
    expect(t.whtBase).toBe(500);
    expect(t.wht).toBe(15);          // 3% ของ 500
    expect(t.payable).toBe(3623);    // ลูกค้าจ่ายจริง = 3,638 - 15
  });

  it('whtRate = 0 ไม่หักอะไรเลย', () => {
    const doc = {
      date: '2026-08-01',
      items: [{ qty: 1, price: 1000, svc: true }],
      vatMode: 'ex' as const,
      whtRate: 0,
    };
    expect(recTotals(doc, VAT7).payable).toBe(1070);
  });
});

describe('poTotals / exTotals — ฝั่งรายจ่าย', () => {
  it('ใบซื้อไม่มีการหักภาษี ณ ที่จ่าย', () => {
    const po = { date: '2026-08-01', items: [{ qty: 10, price: 100 }], vatMode: 'ex' as const };
    const t = poTotals(po, VAT7);
    expect(t.wht).toBe(0);
    expect(t.payable).toBe(t.grand);
    expect(t.payable).toBe(1070);
  });

  it('ค่าเช่าหัก 5% จากมูลค่าก่อน VAT (ไม่ใช่เฉพาะค่าแรงแบบฝั่งขาย)', () => {
    const ex = {
      date: '2026-08-01',
      cat: 'rent' as const,
      items: [{ qty: 1, price: 20000 }],
      vatMode: 'ex' as const,
      whtRate: 5,
    };
    const t = exTotals(ex, VAT7);
    expect(t.net).toBe(20000);
    expect(t.vat).toBe(1400);
    expect(t.grand).toBe(21400);
    expect(t.wht).toBe(1000);        // 5% ของ 20,000
    expect(t.payable).toBe(20400);   // จ่ายผู้ให้เช่าจริง แล้วนำส่งสรรพากร 1,000
  });
});

describe('paidOf / payState — สถานะการชำระ', () => {
  const doc = (amounts: number[]) => ({
    date: '2026-08-01',
    items: [],
    payments: amounts.map((amount) => ({ amount })),
  });

  it('รวมยอดชำระทุกรายการ', () => {
    expect(paidOf(doc([1000, 500.25, 0.75]))).toBe(1501);
  });

  it('ยังไม่จ่ายเลย', () => {
    expect(payState(1000, 0)).toBe('unpaid');
  });

  it('จ่ายบางส่วน', () => {
    expect(payState(1000, 400)).toBe('partial');
  });

  it('จ่ายครบ', () => {
    expect(payState(1000, 1000)).toBe('paid');
  });

  it('ขาดไม่ถึงครึ่งสตางค์ ถือว่าครบ — กันเศษทศนิยมทำให้ค้างยอด 0.00 บาท', () => {
    expect(payState(1000, 999.998)).toBe('paid');
  });
});
