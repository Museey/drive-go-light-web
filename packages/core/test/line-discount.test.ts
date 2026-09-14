/**
 * ส่วนลดรายบรรทัด (%) — เพิ่ม 13 ก.ย. 69 ตามฟอร์มใหม่
 *
 * กติกาที่ต้องไม่หลุด: บรรทัดที่ไม่มี discPct ต้องคำนวณเท่าเดิมทุกบาท
 * (ชุด differential เทียบกับโปรแกรมเดิมยังต้องผ่านเหมือนเดิม)
 */
import { describe, expect, it } from 'vitest';
import { lineAmount, totalsOf, whtBaseOf } from '../src/index.js';

const VAT7 = { vatRate: 7 };

describe('lineAmount', () => {
  it('ไม่มีส่วนลด = จำนวน × ราคา เท่าเดิม', () => {
    expect(lineAmount({ qty: 3, price: 100 })).toBe(300);
    expect(lineAmount({ qty: 3, price: 100, discPct: 0 })).toBe(300);
  });
  it('ลด 10% จาก 300 เหลือ 270', () => {
    expect(lineAmount({ qty: 3, price: 100, discPct: 10 })).toBeCloseTo(270, 10);
  });
  it('เกิน 100 หรือติดลบ ถูกบีบเข้าช่วง 0–100', () => {
    expect(lineAmount({ qty: 1, price: 100, discPct: 150 })).toBe(0);
    expect(lineAmount({ qty: 1, price: 100, discPct: -5 })).toBe(100);
  });
});

describe('totalsOf กับส่วนลดบรรทัด', () => {
  it('ยอดก่อนภาษีคือผลรวมหลังลดบรรทัด แล้วค่อยหักส่วนลดท้ายบิล', () => {
    const t = totalsOf({
      items: [{ qty: 2, price: 500, discPct: 10 }, { qty: 1, price: 200 }],   // 900 + 200
      discount: 100, vatMode: 'ex',
    }, VAT7);
    expect(t.sub).toBe(1100);
    expect(t.base).toBe(1000);
    expect(t.vat).toBe(70);
    expect(t.grand).toBe(1070);
  });
  it('เอกสารเก่า (ไม่มี discPct เลย) ได้ผลเท่าเดิมเป๊ะ', () => {
    const old = totalsOf({ items: [{ qty: 2, price: 500 }, { qty: 1, price: 200 }], discount: 100, vatMode: 'ex' }, VAT7);
    const withZero = totalsOf({ items: [{ qty: 2, price: 500, discPct: 0 }, { qty: 1, price: 200, discPct: 0 }], discount: 100, vatMode: 'ex' }, VAT7);
    expect(withZero).toEqual(old);
  });
});

describe('ฐานหัก ณ ที่จ่าย ใช้มูลค่าค่าแรงหลังลดบรรทัด', () => {
  it('ค่าแรง 1,000 ลด 20% → ฐาน 800 (ไม่มีส่วนลดท้ายบิล)', () => {
    const base = whtBaseOf({
      items: [{ qty: 1, price: 1000, svc: true, discPct: 20 }, { qty: 1, price: 500 }],
      discount: 0, vatMode: 'ex',
    }, VAT7);
    expect(base).toBe(800);
  });
});
