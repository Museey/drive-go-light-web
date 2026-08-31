import { describe, expect, it } from 'vitest';
import { monthsSince, reorderQty, stockFlags } from '../src/stock.js';

const TODAY = '2026-08-31';

const p = (qty: number, min: number, max: number, lastMove: string | null) =>
  stockFlags({ qtyOnHand: qty, qtyMin: min, qtyMax: max, lastMoveOn: lastMove }, TODAY);

describe('ป้ายสถานะสต๊อก', () => {
  it('คงเหลือเท่ากับ Min พอดีถือว่าถึงจุดสั่งซื้อแล้ว', () => {
    expect(p(6, 6, 30, TODAY)).toEqual(['min']);
    expect(p(7, 6, 30, TODAY)).toEqual([]);
    expect(p(0, 6, 30, TODAY)).toEqual(['min']);
  });

  it('ยังไม่ตั้ง Min ไม่ต้องเตือน', () => {
    expect(p(0, 0, 0, TODAY)).toEqual([]);
  });

  it('ยังไม่ตั้ง Max ไม่ตีว่าเกินระดับ — ของเดิมตีว่าเกินทุกตัวที่มีของ', () => {
    expect(p(48, 0, 0, TODAY)).toEqual([]);
    expect(p(48, 10, 40, TODAY)).toEqual(['max']);
  });

  it('ไม่เคลื่อนไหวครบหกเดือนถึงนับเป็นของค้าง', () => {
    expect(p(5, 0, 0, '2026-03-01')).toEqual([]);          // 6 เดือนขาดวันเดียว
    expect(p(5, 0, 0, '2026-02-28')).toEqual(['dead']);
    expect(p(5, 0, 0, null)).toEqual(['dead']);            // ไม่เคยเคลื่อนไหวเลย
  });

  it('ติดหลายป้ายพร้อมกันได้', () => {
    expect(p(2, 5, 0, '2025-01-01')).toEqual(['min', 'dead']);
    expect(p(90, 10, 40, '2025-01-01')).toEqual(['max', 'dead']);
  });
});

describe('จำนวนที่ควรสั่ง', () => {
  it('สั่งให้เต็มระดับสูงสุด', () => {
    expect(reorderQty({ qtyOnHand: 4, qtyMax: 24 })).toBe(20);
  });

  it('ยังไม่ตั้ง Max ก็สั่งอย่างน้อยหนึ่งหน่วย', () => {
    expect(reorderQty({ qtyOnHand: 0, qtyMax: 0 })).toBe(1);
    expect(reorderQty({ qtyOnHand: 50, qtyMax: 10 })).toBe(1);
  });
});

describe('การนับเดือน', () => {
  it('นับเป็นเดือนเต็ม ไม่ปัดขึ้นจากเศษวัน', () => {
    expect(monthsSince('2026-08-31', TODAY)).toBe(0);
    expect(monthsSince('2026-07-31', TODAY)).toBe(1);
    expect(monthsSince('2025-08-31', TODAY)).toBe(12);
  });
});
