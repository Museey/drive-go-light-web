import { describe, expect, it } from 'vitest';
import { bahtText, quote } from '../src/lib/billing';

describe('ยอดที่ต้องโอน', () => {
  it('3,600 + VAT 7% = 3,852 (ผู้ใช้กำหนด 25 พ.ย. 2569)', () => {
    expect(quote()).toEqual({ years: 1, base: 3600, vat: 252, wht: 0, total: 3852 });
  });

  it('นิติบุคคลที่หัก ณ ที่จ่าย 3% โอน 3,744 — หักจากค่าบริการก่อน VAT', () => {
    expect(quote({ wht: true })).toEqual({ years: 1, base: 3600, vat: 252, wht: 108, total: 3744 });
  });

  it('หลายปีคูณตรง ๆ ไม่มีเศษสตางค์หลุด', () => {
    expect(quote({ years: 3, wht: true })).toEqual({ years: 3, base: 10800, vat: 756, wht: 324, total: 11232 });
  });

  it('ปีที่ไม่ใช่จำนวนเต็มบวกถือเป็น 1 ปี', () => {
    expect(quote({ years: 0 }).years).toBe(1);
    expect(quote({ years: 1.9 }).years).toBe(1);
  });

  it('แสดงผลมีจุลภาคและทศนิยมสองตำแหน่ง', () => {
    expect(bahtText(3852)).toBe('3,852.00');
    expect(bahtText(3744.5)).toBe('3,744.50');
  });
});
