/**
 * การผูกบรรทัดกับทะเบียนสินค้า — บรรทัดที่ผูกอยู่ต้องไม่หลุดเพราะแตะช่องรหัส
 * (อู่แจ้ง 21 ก.ย. 2569: ออกบิลใบเปล่าจ่ายสดแล้วอะไหล่ไม่ลด)
 */
import { describe, expect, it } from 'vitest';
import { typeCode, unstockedLines, type CodeLink } from '../src/lib/line-link';

type L = { productId: string | null; code: string; name: string };
const linked = (): L => ({ productId: 'p1', code: 'BRK-01', name: 'ผ้าเบรกหน้า' });

/** พิมพ์ทีละตัวเหมือนคนใช้จริง — ความจำถูกส่งต่อระหว่างตัวอักษร */
function typeAll(line: L, keys: string[]): { line: L; memo: CodeLink | null } {
  let memo: CodeLink | null = null;
  let cur: L = line;
  for (const k of keys) {
    const r: { patch: Partial<L>; memo: CodeLink | null } = typeCode<L>(cur, k, memo);
    cur = { ...cur, ...r.patch };
    memo = r.memo;
  }
  return { line: cur, memo };
}

describe('typeCode — ช่องรหัสของบรรทัดที่ผูกทะเบียน', () => {
  it('พิมพ์ได้รหัสเดิมเป๊ะ ไม่ถือว่าเปลี่ยน — การผูกอยู่ครบ', () => {
    const { patch } = typeCode(linked(), 'BRK-01', null);
    expect(patch.productId).toBeUndefined();
    expect(patch.code).toBe('BRK-01');
  });

  it('รหัสเปลี่ยนจริง → ตัดการผูก แต่จำรหัสเดิมไว้', () => {
    const { patch, memo } = typeCode(linked(), 'BRK-011', null);
    expect(patch.productId).toBeNull();
    expect(memo).toEqual({ id: 'p1', code: 'BRK-01' });
  });

  it('เคาะเว้นวรรคแล้วลบทิ้ง → ผูกคืนเอง (อาการที่อู่เจอ)', () => {
    const { line } = typeAll(linked(), ['BRK-01 ', 'BRK-01']);
    expect(line.productId).toBe('p1');
    expect(line.code).toBe('BRK-01');
  });

  it('ลบรหัสทิ้งทีละตัวแล้วพิมพ์กลับมาเหมือนเดิม → ผูกคืนเอง', () => {
    const { line } = typeAll(linked(), ['BRK-0', 'BRK-', 'BRK', 'BR', 'B', '', 'B', 'BR', 'BRK', 'BRK-', 'BRK-0', 'BRK-01']);
    expect(line.productId).toBe('p1');
  });

  it('แก้เป็นรหัสอื่นแล้วหยุด → หลุดจริง ไม่แอบผูกให้', () => {
    const { line } = typeAll(linked(), ['BRK-02']);
    expect(line.productId).toBeNull();
    expect(line.code).toBe('BRK-02');
  });

  it('ล้างช่องจนว่าง → หลุด และการพิมพ์ว่างซ้ำไม่ผูกคืนมั่ว', () => {
    const { line } = typeAll(linked(), ['', '']);
    expect(line.productId).toBeNull();
    expect(line.code).toBe('');
  });

  it('บรรทัดพิมพ์มือที่ไม่เคยผูก พิมพ์อะไรก็ไม่ผูกให้เอง', () => {
    const hand: L = { productId: null, code: '', name: '' };
    const { line } = typeAll(hand, ['B', 'BR', 'BRK-01']);
    expect(line.productId).toBeNull();
  });

  it('เลือกสินค้าตัวใหม่แล้วทิ้งความจำ — พิมพ์รหัสเก่าไม่ดึงตัวเก่ากลับมา', () => {
    const { memo } = typeCode(linked(), 'X', null);
    expect(memo).not.toBeNull();
    /* หน้าจอเรียก setMemo(null) ตอนเลือกผลค้นหา — ที่นี่จำลองด้วยการส่ง null ต่อ */
    const after: L = { productId: 'p2', code: 'OIL-9', name: 'น้ำมันเครื่อง' };
    const r = typeCode(after, 'BRK-01', null);
    expect(r.patch.productId).toBeNull();
    expect(r.memo).toEqual({ id: 'p2', code: 'OIL-9' });
  });
});

describe('unstockedLines — บรรทัดที่จะไม่ขยับสต๊อก', () => {
  const mk = (o: Partial<{ productId: string | null; kitId: string | null; isService: boolean; qty: number }>) =>
    ({ productId: null, kitId: null, isService: false, qty: 1, ...o });

  it('บรรทัดที่ผูกทะเบียนไม่ถูกเตือน', () => {
    expect(unstockedLines([mk({ productId: 'p1' })])).toHaveLength(0);
  });

  it('บรรทัดพิมพ์มือถูกเตือน', () => {
    expect(unstockedLines([mk({})])).toHaveLength(1);
  });

  it('ชุดอะไหล่ไม่ถูกเตือน — ตัดที่ชิ้นส่วนอยู่แล้ว', () => {
    expect(unstockedLines([mk({ kitId: 'k1' })])).toHaveLength(0);
  });

  it('ค่าแรงไม่ถูกเตือน — ไม่มีของให้ตัด', () => {
    expect(unstockedLines([mk({ isService: true })])).toHaveLength(0);
  });

  it('จำนวน 0 ไม่ถูกเตือน — ไม่มีของจะขยับอยู่แล้ว', () => {
    expect(unstockedLines([mk({ qty: 0 })])).toHaveLength(0);
  });

  it('ฝั่งซื้อไม่มีชุดอะไหล่/ค่าแรง ก็ยังใช้ได้', () => {
    const buy = [{ productId: null, qty: 2 }, { productId: 'p9', qty: 1 }];
    expect(unstockedLines(buy)).toEqual([{ productId: null, qty: 2 }]);
  });
});
