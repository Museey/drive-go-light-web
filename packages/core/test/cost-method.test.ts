/** วิธีคิดต้นทุน FIFO / AVG / FEFO — เลือกได้ที่ตั้งค่าร้าน · FEFO ต้องเท่าของเดิมเป๊ะ */
import { describe, expect, it } from 'vitest';
import { averageOut, fifoAdd, fifoConsume, lotAddBy } from '../src/index.js';

const add = (m: 'FIFO' | 'AVG' | 'FEFO') => {
  let lots = lotAddBy(m, [], 10, 100, '2026-09-01', '2026-12-31');
  lots = lotAddBy(m, lots, 10, 120, '2026-09-02', '2026-10-31');   // หมดอายุก่อนล็อตแรก
  return lots;
};

describe('FEFO = พฤติกรรมเดิม', () => {
  it('ผลเท่ากับ fifoAdd เดิมทุกฟิลด์', () => {
    let a = fifoAdd([], 10, 100, '2026-09-01', '2026-12-31');
    a = fifoAdd(a, 10, 120, '2026-09-02', '2026-10-31');
    expect(add('FEFO')).toEqual(a);
    expect(add('FEFO')[0]!.expiresOn).toBe('2026-10-31');          // ของใกล้หมดอยู่หัวคิว
  });
});

describe('FIFO ล้วน', () => {
  it('ต่อท้ายเสมอ แม้ล็อตใหม่หมดอายุก่อน · ตัด 5 ชิ้นได้ต้นทุน 100', () => {
    const lots = add('FIFO');
    expect(lots[0]!.unitCost).toBe(100);
    expect(lots[1]!.expiresOn).toBe('2026-10-31');                  // ยังเก็บวันหมดอายุไว้เตือน
    expect(fifoConsume(lots, 5, 0).cost).toBe(500);
  });
});

describe('AVG ถัวเฉลี่ย', () => {
  it('รับ 10@100 + 10@120 → ทุกชิ้น 110 · ตัด 5 ชิ้น = 550', () => {
    const lots = add('AVG');
    expect(lots.every((l) => l.unitCost === 110)).toBe(true);
    expect(fifoConsume(lots, 5, 0).cost).toBe(550);
  });
  it('รับเพิ่มหลังตัดออก คิดค่าเฉลี่ยจากที่เหลือจริง', () => {
    let lots = add('AVG');                                          // 20 ชิ้น @110
    lots = fifoConsume(lots, 15, 0).lots;                           // เหลือ 5 @110
    lots = lotAddBy('AVG', lots, 5, 200, '2026-09-03');             // (550 + 1000) / 10 = 155
    expect(lots.every((l) => l.unitCost === 155)).toBe(true);
  });
  it('averageOut ไม่แตะล็อตว่าง', () => {
    expect(averageOut([])).toEqual([]);
  });
});
