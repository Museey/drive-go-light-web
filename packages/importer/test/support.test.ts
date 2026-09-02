/**
 * ไฟล์สำรองจากรุ่น 6.4 มีข้อมูลที่ระบบใหม่ยังรับไม่ได้
 *
 * ก่อนหน้านี้มันถูกข้ามไปเงียบ ๆ ซึ่งแปลว่าอู่ที่ย้ายเข้ามาจะเสียใบวางบิล
 * ใบเคลม และใบตรวจนับทั้งหมดโดยไม่มีใครรู้จนกว่าจะไปหาแล้วไม่เจอ
 */
import { describe, expect, it } from 'vitest';
import {
  hasDataLoss, unsupportedCollections, unsupportedWarnings,
} from '../src/support.js';

const v64 = {
  shop: {}, products: [], customers: [],
  /* ใบวางบิล ใบเคลม และใบตรวจนับรองรับหมดแล้ว (ช่วงที่ 3–5) ต้องไม่ถูกเตือน */
  billnotes: [{ id: 'b1' }, { id: 'b2' }],
  claims: [{ id: 'c1' }],
  counts: [{ id: 'ct1' }, { id: 'ct2' }, { id: 'ct3' }],
  moves: [{ id: 'm1' }, { id: 'm2' }],
};

describe('ตรวจข้อมูลที่ยังรองรับไม่ได้', () => {
  it('เจอครบทุกกลุ่มพร้อมจำนวนที่ถูกต้อง', () => {
    const g = unsupportedCollections(v64);
    expect(g.map((x) => [x.key, x.count])).toEqual([['moves', 2]]);
  });

  it('กลุ่มที่หายทั้งก้อนขึ้นก่อนกลุ่มที่หายแค่ประวัติ', () => {
    const g = unsupportedCollections(v64);
    /* เหลือกลุ่มเดียวที่ยังรับไม่ได้ และเป็นแบบ partial คือยอดยังถูกแต่ประวัติหาย */
    expect(g.map((x) => x.kind)).toEqual(['partial']);
  });

  it('ไฟล์จากรุ่นเดิมที่ไม่มีกลุ่มใหม่เลย ไม่ต้องเตือนอะไร', () => {
    expect(unsupportedCollections({ shop: {}, products: [], customers: [] })).toEqual([]);
    expect(hasDataLoss([])).toBe(false);
  });

  it('กลุ่มที่มีแต่ array ว่าง ไม่นับว่าเป็นข้อมูลที่จะหาย', () => {
    const g = unsupportedCollections({ claims: [], counts: [], moves: [] });
    expect(g).toEqual([]);
  });

  it('มีแค่ประวัติสต๊อกไม่ถือว่าข้อมูลหายทั้งก้อน', () => {
    const g = unsupportedCollections({ moves: [{ id: 'm1' }] });
    expect(g).toHaveLength(1);
    expect(hasDataLoss(g)).toBe(false);
  });

  it('ใบวางบิลไม่ถูกเตือนแล้ว เพราะตัวนำเข้ารองรับเต็มรูปแบบ', () => {
    expect(unsupportedCollections({ billnotes: [{ id: 'b1' }] })).toEqual([]);
  });

  it('ใบเคลมไม่ถูกเตือนแล้ว เพราะตัวนำเข้ารองรับเต็มรูปแบบ', () => {
    expect(unsupportedCollections({ claims: [{ id: 'c1' }] })).toEqual([]);
  });

  it('ใบตรวจนับไม่ถูกเตือนแล้ว เพราะตัวนำเข้ารองรับเต็มรูปแบบ', () => {
    expect(unsupportedCollections({ counts: [{ id: 'ct1' }] })).toEqual([]);
  });

  it('ตอนนี้ไม่มีกลุ่มไหนหายทั้งก้อนอีกแล้ว — ไม่ต้องให้ยืนยันเพิ่ม', () => {
    expect(hasDataLoss(unsupportedCollections(v64))).toBe(false);
  });

  it('คำเตือนบอกทั้งชื่อกลุ่ม จำนวน และสิ่งที่เสียไปจริง', () => {
    const w = unsupportedWarnings(unsupportedCollections(v64));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('ประวัติการเคลื่อนไหวสต๊อก');
    expect(w[0]).toContain('2');
    /* กลุ่มที่ยอดยังถูกต้องห้ามเขียนว่า "จะไม่ถูกนำเข้า" เพราะจะทำให้เข้าใจผิด */
    expect(w[0]).toContain('ยอดคงเหลือของสินค้าทุกตัวยังถูกต้อง');
    expect(w[0]).not.toContain('จะไม่ถูกนำเข้า');
  });

  it('ไฟล์ที่ไม่ใช่ออบเจกต์ไม่ทำให้พัง', () => {
    expect(unsupportedCollections(null)).toEqual([]);
    expect(unsupportedCollections('ข้อความ')).toEqual([]);
    expect(unsupportedCollections([1, 2, 3])).toEqual([]);
  });
});
