/**
 * ต้นทุนแบบเข้าก่อนออกก่อน — เทียบกับ lotConsume ของรุ่น 6.4 โดยตรง
 *
 * ตัวเลขนี้ไปโผล่ที่กำไรขั้นต้นในงบกำไรขาดทุน ถ้าคิดผิดเจ้าของอู่จะตัดสินใจ
 * เรื่องราคาขายบนตัวเลขที่ผิด และรู้ตัวตอนสิ้นปีซึ่งแก้อะไรไม่ได้แล้ว
 *
 *   DGL_LEGACY_HTML=legacy/drivegolight-6.4-cloud.html npx vitest run --root packages/core
 *
 * ถ้าไม่ได้ชี้ไปไฟล์ 6.4 ส่วนที่เทียบกับของเดิมจะข้ามไปเอง เพราะรุ่น 3.6 ยังไม่มีล็อต
 */
import { describe, expect, it } from 'vitest';
import { makeLegacy } from './legacy.generated.mjs';
import { fifoAdd, fifoConsume, fifoQty, fifoReturn, fifoValue, type Lot } from '../src/index.js';

const legacy = makeLegacy({ shop: { vatRate: 7 }, invoices: [], receipts: [], purchases: [], expenses: [] });
const hasLots = typeof (legacy as Record<string, unknown>).lotConsume === 'function';

/** สุ่มแบบมี seed เพื่อให้เทสต์ล้มซ้ำได้เหมือนเดิมทุกครั้ง */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** แปลงล็อตฝั่งเราเป็นรูปแบบของโปรแกรมเดิม */
const toLegacyLots = (lots: readonly Lot[]) =>
  lots.map((l) => ({ q: l.qty, c: l.unitCost, d: l.on }));

describe('ตัดสต๊อกแบบเข้าก่อนออกก่อน', () => {
  it('ตัดจากล็อตที่เข้ามาก่อน แล้วค่อยไล่ไปล็อตถัดไป', () => {
    const lots: Lot[] = [
      { qty: 10, unitCost: 100, on: '2026-01-01' },
      { qty: 10, unitCost: 150, on: '2026-02-01' },
    ];
    const r = fifoConsume(lots, 15, 0);
    expect(r.cost).toBe(1750);                      // 10×100 + 5×150
    expect(r.lots).toEqual([{ qty: 5, unitCost: 150, on: '2026-02-01' }]);
  });

  it('ตัดพอดีล็อตแล้วล็อตนั้นหายไปทั้งล็อต ไม่เหลือเศษศูนย์ค้าง', () => {
    const r = fifoConsume([{ qty: 10, unitCost: 100, on: '2026-01-01' }], 10, 0);
    expect(r.cost).toBe(1000);
    expect(r.lots).toEqual([]);
  });

  it('ตัดเกินที่มี ส่วนเกินคิดที่ต้นทุนล่าสุดของสินค้า', () => {
    const r = fifoConsume([{ qty: 3, unitCost: 100, on: '2026-01-01' }], 5, 250);
    expect(r.cost).toBe(800);                       // 3×100 + 2×250
    expect(r.lots).toEqual([]);
  });

  it('ไม่มีล็อตเลย คิดที่ต้นทุนล่าสุดทั้งหมด', () => {
    expect(fifoConsume([], 4, 90).cost).toBe(360);
  });

  it('ไม่แก้ล็อตที่รับเข้ามา — ผู้เรียกต้องได้ของเดิมกลับไปครบ', () => {
    const lots: Lot[] = [{ qty: 10, unitCost: 100, on: '2026-01-01' }];
    fifoConsume(lots, 7, 0);
    expect(lots).toEqual([{ qty: 10, unitCost: 100, on: '2026-01-01' }]);
  });

  it('ของที่คืนกลับเข้าหน้าแถว จึงถูกตัดออกก่อนล็อตเดิม', () => {
    const lots: Lot[] = [{ qty: 5, unitCost: 200, on: '2026-03-01' }];
    const back = fifoReturn(lots, 2, 180, '2026-04-01');
    expect(back[0]).toEqual({ qty: 2, unitCost: 90, on: '2026-04-01' });
    expect(fifoConsume(back, 2, 0).cost).toBe(180);
  });

  it('คืนของโดยไม่รู้ต้นทุน ใช้ต้นทุนล่าสุดแทน', () => {
    const back = fifoReturn([], 4, 0, '2026-04-01', 75);
    expect(back).toEqual([{ qty: 4, unitCost: 75, on: '2026-04-01' }]);
  });

  it('มูลค่าและจำนวนคงเหลือคิดจากทุกล็อตรวมกัน', () => {
    const lots = fifoAdd(fifoAdd([], 10, 100, '2026-01-01'), 5, 150, '2026-02-01');
    expect(fifoQty(lots)).toBe(15);
    expect(fifoValue(lots)).toBe(1750);
  });

  it('รับเข้าจำนวนศูนย์หรือติดลบไม่สร้างล็อต', () => {
    expect(fifoAdd([], 0, 100, '2026-01-01')).toEqual([]);
    expect(fifoAdd([], -3, 100, '2026-01-01')).toEqual([]);
  });
});

describe.skipIf(!hasLots)('เทียบกับโค้ดของรุ่น 6.4 โดยตรง', () => {
  /** ห่อฝั่งเดิมให้เรียกง่าย — โปรแกรมเดิมทำงานบนอ็อบเจกต์สินค้า ไม่ใช่อาเรย์ล็อต */
  const L = legacy as unknown as {
    lotConsume: (p: any, qty: number) => number;
    lotAdd: (p: any, qty: number, cost: number, date: string) => void;
    lotReturn: (p: any, qty: number, totalCost: number) => void;
    lotValue: (p: any) => number;
  };

  it('สุ่มลำดับรับเข้า ตัดออก และคืนของ 2,000 ชุด แล้วต้นทุนตรงกันทุกสตางค์', () => {
    const rand = rng(20260901);
    let compared = 0;

    for (let round = 0; round < 2000; round++) {
      const fallback = Math.round(rand() * 500) / 1;
      /* ฝั่งเดิมทำงานบนสินค้าที่มี lots · qty · cost */
      const p: any = { lots: [], qty: 0, cost: fallback, lastMove: '2026-01-01' };
      let mine: Lot[] = [];

      const steps = 2 + Math.floor(rand() * 8);
      for (let s = 0; s < steps; s++) {
        const roll = rand();
        const qty = Math.round((0.5 + rand() * 20) * 100) / 100;

        if (roll < 0.45) {
          /* รับเข้า */
          const cost = Math.round(rand() * 400 * 100) / 100;
          const on = `2026-0${1 + (s % 9)}-01`;
          L.lotAdd(p, qty, cost, on);
          mine = fifoAdd(mine, qty, cost, on);
        } else if (roll < 0.85) {
          /* ตัดออก — จุดที่ต้องเทียบ */
          const theirs = L.lotConsume(p, qty);
          const ours = fifoConsume(mine, qty, fallback);
          expect(ours.cost).toBe(theirs);
          mine = ours.lots;
          compared++;
        } else {
          /* คืนของ */
          const totalCost = Math.round(rand() * 900 * 100) / 100;
          L.lotReturn(p, qty, totalCost);
          mine = fifoReturn(mine, qty, totalCost, '2026-09-01', fallback);
        }

        /* ล็อตคงเหลือต้องตรงกันทุกก้าว ไม่ใช่แค่ต้นทุนที่คืนมา */
        expect(toLegacyLots(mine)).toEqual(p.lots);
      }
    }

    expect(compared).toBeGreaterThan(3000);
  });

  it('ตัดเกินที่มีให้ผลเท่ากันทั้งสองฝั่ง', () => {
    const p: any = { lots: [], qty: 0, cost: 120, lastMove: '2026-01-01' };
    L.lotAdd(p, 3, 100, '2026-01-01');
    const mine = fifoAdd([], 3, 100, '2026-01-01');

    expect(fifoConsume(mine, 10, 120).cost).toBe(L.lotConsume(p, 10));
  });

  it('มูลค่าล็อตคงเหลือตรงกัน', () => {
    const p: any = { lots: [], qty: 0, cost: 0, lastMove: '2026-01-01' };
    L.lotAdd(p, 7, 33.33, '2026-01-01');
    L.lotAdd(p, 4, 12.5, '2026-02-01');
    const mine = fifoAdd(fifoAdd([], 7, 33.33, '2026-01-01'), 4, 12.5, '2026-02-01');

    expect(fifoValue(mine)).toBe(Math.round(L.lotValue(p) * 100) / 100);
  });
});
