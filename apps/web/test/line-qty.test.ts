/**
 * บรรทัดรายการที่ยังไม่กรอก จำนวนเป็น 0 (ผู้ใช้กำหนด 17 ก.ย. 2569)
 * — เริ่มมีของแล้วขึ้น 1 ให้เอง · ลบจนว่างกลับเป็น 0 · จำนวนที่ผู้ใช้พิมพ์เองไม่ถูกทับ
 */
import { describe, expect, it } from 'vitest';
import { BLANK_QTY, patchLine } from '../src/lib/line-qty';

type L = { productId: string | null; name: string; code: string; qty: number; price: number };
const isReal = (l: L) => Boolean(l.productId) || l.name.trim() !== '' || l.code.trim() !== '';
const blank = (): L => ({ productId: null, name: '', code: '', qty: 0, price: 0 });

describe('patchLine', () => {
  it('บรรทัดเปล่าจำนวน 0', () => {
    expect(BLANK_QTY).toBe(0);
  });

  it('พิมพ์ชื่อ/รหัสในบรรทัดว่าง → จำนวนขึ้น 1', () => {
    expect(patchLine(blank(), { name: 'ผ' }, isReal).qty).toBe(1);
    expect(patchLine(blank(), { code: 'F' }, isReal).qty).toBe(1);
    expect(patchLine(blank(), { productId: 'p1', name: 'กรอง' }, isReal).qty).toBe(1);
  });

  it('พิมพ์จำนวนไว้ก่อนแล้วค่อยพิมพ์ชื่อ → คงจำนวนที่พิมพ์', () => {
    const typed = patchLine(blank(), { qty: 5 }, isReal);
    expect(typed.qty).toBe(5);
    expect(patchLine(typed, { name: 'ผ้าเบรก' }, isReal).qty).toBe(5);
  });

  it('แก้จำนวนตรง ๆ ไม่ถูกทับ — แม้บรรทัดเพิ่งเริ่มมีของในครั้งเดียวกัน', () => {
    expect(patchLine(blank(), { name: 'x', qty: 0 }, isReal).qty).toBe(0);
    expect(patchLine(blank(), { productId: 'p', name: 'x', qty: 40 }, isReal).qty).toBe(40);
  });

  it('ลบชื่อจนบรรทัดกลับเป็นว่าง → 0', () => {
    const line = { ...blank(), name: 'ผ', qty: 3 };
    expect(patchLine(line, { name: '' }, isReal).qty).toBe(0);
  });

  it('บรรทัดที่มีของแล้ว แก้ช่องอื่นไม่แตะจำนวน', () => {
    const line = { ...blank(), name: 'ผ้าเบรก', qty: 0 };
    expect(patchLine(line, { price: 100 }, isReal).qty).toBe(0);
    expect(patchLine({ ...line, qty: 7 }, { name: 'ผ้าเบรกหน้า' }, isReal).qty).toBe(7);
  });

  it('บรรทัดว่างแก้ช่องอื่น (ราคา) ยังว่าง — ยัง 0', () => {
    expect(patchLine(blank(), { price: 50 }, isReal).qty).toBe(0);
  });
});
