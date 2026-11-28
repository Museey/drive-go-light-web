/**
 * ฐานหัก ณ ที่จ่ายของเอกสารขาย — เฉพาะค่าแรง หรือ ทั้งใบ (041 · 24 พ.ย. 2569)
 * เคสคิดเลขด้วยมือ เพื่อบอกว่าสูตรควรได้เท่าไร ไม่ใช่แค่ "เหมือนของเดิม"
 */
import { describe, expect, it } from 'vitest';
import { recTotals, totalsOf, whtBaseOf } from '../src/index.js';

/* ค่าแรง 2,000 + อะไหล่ 8,000 = 10,000 */
const items = [
  { qty: 1, price: 2000, svc: true },
  { qty: 2, price: 4000, svc: false },
];

describe('ฐานหัก ณ ที่จ่าย', () => {
  it('ไม่ระบุ = เฉพาะค่าแรง — ผู้เรียกเดิมได้ผลเท่าเดิมทุกบาท', () => {
    const doc = { items, vatMode: 'ex' as const, whtRate: 3 };
    expect(whtBaseOf(doc, { vatRate: 7 })).toBe(2000);
    expect(whtBaseOf(doc, { vatRate: 7, whtBase: 'labour' })).toBe(2000);
    expect(recTotals(doc, { vatRate: 7 }).wht).toBe(60);
  });

  it('ทั้งใบ — ฐานคือมูลค่าก่อน VAT ของทั้งใบ', () => {
    const doc = { items, vatMode: 'ex' as const, whtRate: 3 };
    expect(whtBaseOf(doc, { vatRate: 7, whtBase: 'all' })).toBe(10000);

    const t = recTotals(doc, { vatRate: 7, whtBase: 'all' });
    expect(t.wht).toBe(300);                    // 10,000 × 3%
    expect(t.grand).toBe(10700);
    expect(t.payable).toBe(10400);              // 10,700 − 300
  });

  it('ทั้งใบ + ส่วนลดท้ายบิล — หักส่วนลดก่อน', () => {
    const doc = { items, discount: 1000, vatMode: 'ex' as const, whtRate: 3 };
    expect(whtBaseOf(doc, { vatRate: 7, whtBase: 'all' })).toBe(9000);
    /* เฉพาะค่าแรง: ส่วนลดเฉลี่ยตามสัดส่วน 2,000 − 1,000 × 20% = 1,800 */
    expect(whtBaseOf(doc, { vatRate: 7, whtBase: 'labour' })).toBe(1800);
  });

  it('ทั้งใบ + ราคารวม VAT แล้ว — ถอด VAT ออกก่อน ฐานเท่ากับ totalsOf().net', () => {
    const doc = { items: [{ qty: 1, price: 10700, svc: false }], vatMode: 'in' as const, whtRate: 3 };
    expect(whtBaseOf(doc, { vatRate: 7, whtBase: 'all' })).toBe(10000);
    expect(whtBaseOf(doc, { vatRate: 7, whtBase: 'all' })).toBe(totalsOf(doc, { vatRate: 7 }).net);
  });

  it('ทั้งใบ — ใบที่ไม่มีบรรทัดค่าแรงเลยก็ถูกหัก (เฉพาะค่าแรงไม่หัก)', () => {
    const doc = { items: [{ qty: 1, price: 5000, svc: false }], vatMode: 'none' as const, whtRate: 3 };
    expect(recTotals(doc, { vatRate: 7, whtBase: 'labour' }).wht).toBe(0);
    expect(recTotals(doc, { vatRate: 7, whtBase: 'all' }).wht).toBe(150);
  });

  it('ขั้นต่ำ 1,000 บาทยังใช้กับฐานทั้งใบ', () => {
    const doc = { items: [{ qty: 1, price: 900, svc: false }], vatMode: 'none' as const, whtRate: 3 };
    const t = recTotals(doc, { vatRate: 7, whtBase: 'all' });
    expect(t.whtBase).toBe(900);
    expect(t.wht).toBe(0);
  });
});
