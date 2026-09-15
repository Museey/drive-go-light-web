import { describe, expect, it } from 'vitest';
import { filledItems, kitCost, kitLineName, kitProblem, type KitInput } from '../src/lib/kit-calc';

const base = (patch: Partial<KitInput> = {}): KitInput => ({
  code: 'KIT-001', name: 'ถ่ายน้ำมันเครื่อง', price: 900, priceB: 850, priceC: 800, note: '',
  items: [
    { productId: 'p1', name: 'น้ำมันเครื่อง 4L', unit: 'แกลลอน', qty: 1, unitCost: 520.5 },
    { productId: null, name: 'แหวนรองน็อต', unit: 'ตัว', qty: 2, unitCost: 7.25 },
    { productId: null, name: '', unit: '', qty: 1, unitCost: 0 },
  ],
  ...patch,
});

describe('ชุดอะไหล่ — คำนวณ', () => {
  it('ต้นทุนรวม = Σ จำนวน × ทุน ปัด 2 ตำแหน่ง', () => {
    expect(kitCost(base().items)).toBe(535);
    expect(kitCost([{ qty: 3, unitCost: 0.335 }])).toBe(1.01);
    expect(kitCost([])).toBe(0);
  });

  it('ชื่อบรรทัดบนเอกสารรวมชื่อรายการ ข้ามบรรทัดว่าง', () => {
    expect(kitLineName('ถ่ายน้ำมันเครื่อง', base().items))
      .toBe('ชุดอะไหล่ซ่อมบำรุง ถ่ายน้ำมันเครื่อง (น้ำมันเครื่อง 4L, แหวนรองน็อต)');
  });

  it('บรรทัดว่างไม่ถูกบันทึก', () => {
    expect(filledItems(base().items)).toHaveLength(2);
  });
});

describe('ชุดอะไหล่ — ตรวจก่อนบันทึก', () => {
  it('ข้อมูลครบผ่าน', () => {
    expect(kitProblem(base())).toBeNull();
  });

  it('ไม่มีรหัส / ชื่อ', () => {
    expect(kitProblem(base({ code: '  ' }))?.field).toBe('code');
    expect(kitProblem(base({ name: '' }))?.field).toBe('name');
  });

  it('ราคาติดลบไม่ได้ — บอกช่องที่ผิด', () => {
    expect(kitProblem(base({ priceB: -1 }))).toEqual({ field: 'priceB', error: 'ราคา B ต้องไม่ติดลบ' });
    expect(kitProblem(base({ price: Number.NaN }))?.field).toBe('price');
  });

  it('ต้องมีรายการอย่างน้อยหนึ่ง (บรรทัดว่างไม่นับ)', () => {
    expect(kitProblem(base({ items: [{ productId: null, name: ' ', unit: '', qty: 1, unitCost: 0 }] }))?.field).toBe('items');
  });

  it('จำนวนต้องมากกว่า 0 และทุนไม่ติดลบ — ชี้บรรทัดที่ผิด', () => {
    const items = base().items.map((it, i) => (i === 1 ? { ...it, qty: 0 } : it));
    expect(kitProblem(base({ items }))).toEqual({ field: 'it1_qty', error: 'บรรทัดที่ 2 จำนวนต้องมากกว่า 0' });
    const neg = base().items.map((it, i) => (i === 0 ? { ...it, unitCost: -5 } : it));
    expect(kitProblem(base({ items: neg }))?.field).toBe('it0_cost');
  });
});
