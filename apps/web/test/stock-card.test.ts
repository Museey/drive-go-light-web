/**
 * แถวทะเบียนสินค้า → การ์ดสินค้า (จอต่ำกว่า 1280 · ต้นแบบ a.mpcard)
 *
 * การ์ดมีที่ให้ข้อมูลน้อยกว่าตารางสิบกว่าคอลัมน์ จึงต้องตัดสินว่าอะไรได้ไปต่อ
 * ตัดสินที่เดียวในโมดูลบริสุทธิ์ แล้วเทสต์ได้โดยไม่ต้องเปิดเบราว์เซอร์
 */
import { describe, expect, it } from 'vitest';
import { filterLabel, stockCard } from '../src/lib/stock-card';

const p = (over: Partial<Parameters<typeof stockCard>[0]> = {}) => ({
  id: 'p1', code: 'BAT-131', name: 'แบตเตอรี่ 38B20L', unit: 'ลูก',
  priceA: 4670, qtyOnHand: 33, active: true, needReorder: false,
  flags: [] as ('min' | 'max' | 'dead' | 'expiring' | 'expired')[],
  ...over,
});

describe('stockCard — การ์ดสินค้า', () => {
  it('ข้อมูลที่การ์ดต้องมี: ลิงก์ · รหัส · ชื่อ · ราคา · คงเหลือพร้อมหน่วย', () => {
    const c = stockCard(p());
    expect(c.href).toBe('/stock/p1');
    expect(c.code).toBe('BAT-131');
    expect(c.name).toBe('แบตเตอรี่ 38B20L');
    expect(c.price).toBe(4670);
    expect(c.qty).toBe(33);
    expect(c.unit).toBe('ลูก');
    expect(c.low, 'ของยังไม่ถึงจุดสั่งซื้อ').toBe(false);
    expect(c.chips).toEqual([]);
  });

  /* คงเหลือสีแดงคือสัญญาณเดียวบนการ์ดที่บอกว่าต้องสั่งของ — ตารางใช้ชิปแดงที่คอลัมน์คงเหลือ */
  it('ถึงจุดสั่งซื้อ — คงเหลือต้องถูกทำเครื่องหมายว่าต่ำ', () => {
    expect(stockCard(p({ needReorder: true, qtyOnHand: 1 })).low).toBe(true);
  });

  it('ของที่ปิดใช้งานมีชิปบอก — ไม่งั้นการ์ดดูเหมือนของที่ขายได้', () => {
    const c = stockCard(p({ active: false }));
    expect(c.chips.map((x) => x.label)).toEqual(['ปิดใช้งาน']);
  });

  it('ป้ายสถานะจากตารางยกมาเป็นชิปย่อ พร้อมคำเต็มไว้ใน title', () => {
    const c = stockCard(p({ flags: ['expiring', 'dead'] }));
    expect(c.chips.map((x) => x.label)).toEqual(['ใกล้หมด', 'ค้าง']);
    expect(c.chips[0]!.title).toBe('ใกล้หมดอายุ');
    expect(c.chips[0]!.key).toBe('expiring');
  });

  it('ปิดใช้งานมาก่อนป้ายอื่น — เป็นเรื่องที่ต้องเห็นก่อน', () => {
    const c = stockCard(p({ active: false, flags: ['min'] }));
    expect(c.chips.map((x) => x.label)).toEqual(['ปิดใช้งาน', 'Min']);
  });
});

describe('filterLabel — แถบบอกตัวกรองที่เปิดอยู่', () => {
  it('ไม่ได้กรองอะไร ไม่ต้องมีแถบ', () => {
    expect(filterLabel({})).toBe(null);
    expect(filterLabel({ q: 'แบต' })).toBe(null);
  });

  it('มาจากการ์ด "ต้องสั่งซื้อ" ของหน้าแรก', () => {
    expect(filterLabel({ reorder: '1' })).toBe('สินค้าที่ต้องสั่งซื้อ');
  });

  it('ป้ายสถานะใช้คำเต็มของ core ไม่เขียนคำใหม่', () => {
    expect(filterLabel({ flag: 'expired' })).toBe('หมดอายุแล้ว');
    expect(filterLabel({ flag: 'max' })).toBe('เกินระดับสูงสุด (Max)');
  });

  it('ค่าที่ไม่รู้จักถือว่าไม่ได้กรอง — ไม่ขึ้นแถบหลอก', () => {
    expect(filterLabel({ flag: 'ไม่มีป้ายนี้' })).toBe(null);
  });

  /* กรองสองอย่างพร้อมกันได้ — บอกทั้งคู่ ไม่ใช่บอกอันเดียวแล้วอีกอันเงียบ */
  it('กรองพร้อมกันบอกทั้งคู่', () => {
    expect(filterLabel({ reorder: '1', flag: 'expiring' })).toBe('สินค้าที่ต้องสั่งซื้อ · ใกล้หมดอายุ');
  });
});
