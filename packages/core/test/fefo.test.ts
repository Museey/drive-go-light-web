/**
 * หมดอายุก่อนออกก่อน (FEFO)
 *
 * ของใหม่ ไม่มีในรุ่น 6.4 — จึงไม่มีต้นฉบับให้เทียบ ต้องพิสูจน์กติกาเอง
 *
 * **ข้อที่สำคัญที่สุดคือของที่ไม่มีวันหมดอายุต้องได้ผลเหมือนเดิมทุกประการ**
 * ถ้าการเพิ่มเรื่องนี้ไปขยับต้นทุนของอะไหล่ธรรมดา จะไม่มีใครสังเกตจนกว่าจะปิดงบ
 */
import { describe, expect, it } from 'vitest';
import { fifoAdd, fifoConsume, fifoQty, fifoReturn, type Lot } from '../src/fifo';
import { daysUntil, stockFlags } from '../src/stock';
import { addMonths } from '../src/date';

/** ลำดับคิว แสดงเป็นต้นทุนต่อหน่วย เพื่ออ่านง่ายว่าอะไรอยู่ก่อนอะไร */
const order = (lots: readonly Lot[]) => lots.map((l) => l.unitCost);

describe('ของที่ไม่มีวันหมดอายุ', () => {
  it('ต่อท้ายแถวเหมือนเดิม และไม่มีฟิลด์วันหมดอายุติดมา', () => {
    let lots: Lot[] = [];
    lots = fifoAdd(lots, 10, 50, '2026-01-01');
    lots = fifoAdd(lots, 10, 60, '2026-02-01');

    expect(order(lots)).toEqual([50, 60]);
    /* รูปร่างต้องเหมือนก่อนมีเรื่องนี้ ไม่ใช่แค่ค่าเท่ากัน */
    expect(lots[0]).toEqual({ qty: 10, unitCost: 50, on: '2026-01-01' });
    expect('expiresOn' in lots[0]!).toBe(false);
  });

  it('ส่ง undefined หรือ null ให้ผลเหมือนไม่ส่งเลย', () => {
    const a = fifoAdd([], 5, 40, '2026-01-01');
    const b = fifoAdd([], 5, 40, '2026-01-01', null);
    const c = fifoAdd([], 5, 40, '2026-01-01', undefined);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
});

describe('ของที่มีวันหมดอายุ', () => {
  it('ล็อตที่หมดอายุก่อน ถูกตัดก่อน แม้จะรับเข้าทีหลัง', () => {
    let lots: Lot[] = [];
    /* รับเข้าก่อน แต่หมดอายุทีหลัง */
    lots = fifoAdd(lots, 10, 50, '2026-01-01', '2027-12-31');
    /* รับเข้าทีหลัง แต่หมดอายุก่อน — ต้องขึ้นหน้าแถว */
    lots = fifoAdd(lots, 10, 60, '2026-06-01', '2026-09-30');

    expect(order(lots)).toEqual([60, 50]);
    expect(fifoConsume(lots, 10).cost).toBe(600);
  });

  it('เรียงจากใกล้หมดไปไกล ไม่ว่าจะรับเข้าลำดับไหน', () => {
    let lots: Lot[] = [];
    lots = fifoAdd(lots, 1, 30, '2026-01-01', '2026-12-01');
    lots = fifoAdd(lots, 1, 10, '2026-01-02', '2026-06-01');
    lots = fifoAdd(lots, 1, 20, '2026-01-03', '2026-09-01');

    expect(order(lots)).toEqual([10, 20, 30]);
  });

  it('หมดอายุวันเดียวกัน คงลำดับเข้าก่อนออกก่อนไว้', () => {
    let lots: Lot[] = [];
    lots = fifoAdd(lots, 1, 11, '2026-01-01', '2026-06-01');
    lots = fifoAdd(lots, 1, 22, '2026-02-01', '2026-06-01');

    expect(order(lots)).toEqual([11, 22]);
  });
});

describe('ของมีและไม่มีวันหมดอายุปนกัน', () => {
  it('ของที่มีวันหมดอายุอยู่หน้าของที่ไม่มีเสมอ แม้จะรับเข้าทีหลัง', () => {
    let lots: Lot[] = [];
    lots = fifoAdd(lots, 5, 70, '2026-01-01');                 // ไม่มีวันหมดอายุ
    lots = fifoAdd(lots, 5, 80, '2026-05-01', '2026-12-31');   // มี

    expect(order(lots)).toEqual([80, 70]);
  });

  it('แทรกเข้าระหว่างของที่มีวันหมดอายุ โดยไม่ข้ามหน้าของที่ไม่มี', () => {
    let lots: Lot[] = [];
    lots = fifoAdd(lots, 1, 10, '2026-01-01', '2026-06-01');
    lots = fifoAdd(lots, 1, 90, '2026-01-02');                 // ไม่มีวันหมดอายุ
    lots = fifoAdd(lots, 1, 20, '2026-01-03', '2026-08-01');

    expect(order(lots)).toEqual([10, 20, 90]);
  });
});

describe('ของคืนกลับเข้าคลัง', () => {
  /*
   * กติกา "ของคืนเข้าหน้าแถว" สำคัญกว่า FEFO — ยกเลิกใบเสร็จแล้วออกใหม่
   * ต้องได้ต้นทุนเท่าเดิม ถ้าของคืนไปต่อคิวตามวันหมดอายุ ต้นทุนจะเปลี่ยน
   */
  it('เข้าหน้าแถวเสมอ แม้ล็อตอื่นจะหมดอายุก่อน', () => {
    let lots: Lot[] = [];
    lots = fifoAdd(lots, 5, 50, '2026-01-01', '2026-03-01');
    lots = fifoReturn(lots, 2, 180, '2026-02-01', 0, '2027-01-01');

    expect(order(lots)).toEqual([90, 50]);
  });

  it('ของคืนที่ไม่มีวันหมดอายุ ไม่มีฟิลด์ติดมา', () => {
    const lots = fifoReturn([], 2, 180, '2026-02-01');
    expect(lots[0]).toEqual({ qty: 2, unitCost: 90, on: '2026-02-01' });
  });
});

describe('ตัดข้ามล็อต', () => {
  it('ตัดเกินล็อตแรก ไล่ต่อไปล็อตถัดไปตามคิวหมดอายุ', () => {
    let lots: Lot[] = [];
    lots = fifoAdd(lots, 3, 100, '2026-01-01', '2027-01-01');
    lots = fifoAdd(lots, 3, 200, '2026-01-02', '2026-06-01');

    /* คิวคือ 200 (หมดก่อน) แล้ว 100 — ตัด 4 ชิ้นได้ 3×200 + 1×100 */
    const r = fifoConsume(lots, 4);
    expect(r.cost).toBe(700);
    expect(fifoQty(r.lots)).toBe(2);
    expect(order(r.lots)).toEqual([100]);
  });
});

describe('ป้ายเตือนวันหมดอายุ', () => {
  const base = { qtyOnHand: 10, qtyMin: 0, qtyMax: 0, lastMoveOn: '2026-09-01' };
  const flags = (nearestExpiry: string | null, warn = 60) =>
    stockFlags({ ...base, nearestExpiry }, '2026-09-11', warn);

  it('ไม่มีวันหมดอายุ — ไม่มีป้าย', () => {
    expect(flags(null)).toEqual([]);
  });

  it('ยังอีกไกล — ไม่มีป้าย', () => {
    expect(flags('2027-01-01')).toEqual([]);
  });

  it('อยู่ในเกณฑ์เตือน — ใกล้หมดอายุ', () => {
    expect(flags('2026-10-01')).toEqual(['expiring']);
  });

  it('ขอบเกณฑ์พอดี — ยังนับว่าใกล้หมดอายุ', () => {
    expect(flags('2026-11-10')).toEqual(['expiring']);   // อีก 60 วันพอดี
    expect(flags('2026-11-11')).toEqual([]);             // อีก 61 วัน
  });

  it('หมดอายุวันนี้ — ยังไม่นับว่าหมด เพราะยังใช้ได้ทั้งวัน', () => {
    expect(flags('2026-09-11')).toEqual(['expiring']);
  });

  it('เลยวันมาแล้ว — หมดอายุแล้ว ไม่ใช่ใกล้หมดอายุ', () => {
    expect(flags('2026-09-10')).toEqual(['expired']);
  });

  it('เกณฑ์ที่ตั้งเองมีผลจริง', () => {
    expect(flags('2026-10-20', 30)).toEqual([]);          // อีก 39 วัน เกิน 30
    expect(flags('2026-10-20', 90)).toEqual(['expiring']);
  });

  it('ขึ้นพร้อมป้ายอื่นได้', () => {
    expect(stockFlags(
      { qtyOnHand: 1, qtyMin: 5, qtyMax: 0, lastMoveOn: '2026-09-01',
        nearestExpiry: '2026-09-01' },
      '2026-09-11',
    )).toEqual(['min', 'expired']);
  });
});

describe('นับวันคงเหลือ', () => {
  it('วันนี้ = 0 · พรุ่งนี้ = 1 · เมื่อวาน = -1', () => {
    expect(daysUntil('2026-09-11', '2026-09-11')).toBe(0);
    expect(daysUntil('2026-09-12', '2026-09-11')).toBe(1);
    expect(daysUntil('2026-09-10', '2026-09-11')).toBe(-1);
  });

  it('ข้ามเดือนและข้ามปีถูกต้อง', () => {
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
    expect(daysUntil('2026-03-01', '2026-02-28')).toBe(1);   // 2026 ไม่ใช่ปีอธิกสุรทิน
  });
});

describe('เติมวันหมดอายุจากอายุการเก็บ', () => {
  it('ไม่มีอายุการเก็บ — ไม่มีวันหมดอายุ', () => {
    expect(addMonths('2026-09-11', null)).toBeNull();
    expect(addMonths('2026-09-11', 0)).toBeNull();
    expect(addMonths('2026-09-11', undefined)).toBeNull();
  });

  it('บวกเดือนตรง ๆ', () => {
    expect(addMonths('2026-09-11', 24)).toBe('2028-09-11');
    expect(addMonths('2026-01-15', 6)).toBe('2026-07-15');
  });

  /*
   * เคสที่ Date ของ JS ทำผิด — 31 มกราคม + 1 เดือน มันให้ 3 มีนาคม
   * เพราะ 31 กุมภาพันธ์ไม่มีจริงแล้วมันล้นไปข้างหน้า
   * ของที่ซื้อสิ้นเดือนไม่ควรได้วันหมดอายุข้ามเดือนโดยไม่มีใครตั้งใจ
   */
  it('ตกวันที่ไม่มีจริง เลื่อนมาเป็นวันสุดท้ายของเดือน', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
  });

  it('ปีอธิกสุรทินได้ 29 กุมภาพันธ์', () => {
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('ข้ามปีถูกต้อง', () => {
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('วันที่ไม่ถูกรูปแบบ — คืน null ไม่ใช่วันที่มั่ว', () => {
    expect(addMonths('', 12)).toBeNull();
    expect(addMonths('ไม่ใช่วันที่', 12)).toBeNull();
  });
});
