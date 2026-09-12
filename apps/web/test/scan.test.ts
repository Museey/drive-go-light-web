/**
 * แยกจำนวนออกจากรหัสที่ยิงมา
 *
 * **ข้อที่อันตรายที่สุดคือการเดา** — บาร์โค้ดมาตรฐาน EAN/UPC เป็นตัวเลขล้วนทั้งอัน
 * ถ้าตีความตัวเลขนำหน้าว่าเป็นจำนวนโดยไม่ต้องมีตัวคั่น การยิงของธรรมดา
 * จะกลายเป็นจำนวนมหาศาลเงียบ ๆ แล้วไปโผล่ที่ใบเสร็จของลูกค้า
 */
import { describe, expect, it } from 'vitest';
import { parseScan } from '../src/lib/scan';

describe('จำนวนนำหน้ารหัสที่ยิง', () => {
  it('ยิงเฉย ๆ ได้หนึ่งชิ้น', () => {
    expect(parseScan('ABC123')).toEqual({ qty: 1, term: 'ABC123' });
  });

  it('พิมพ์จำนวนแล้วคั่นด้วย * ได้ตามจำนวน', () => {
    expect(parseScan('40*ABC123')).toEqual({ qty: 40, term: 'ABC123' });
  });

  it('ใช้ x แทน * ได้ เพราะ * ต้องกด Shift', () => {
    expect(parseScan('12xOIL-001')).toEqual({ qty: 12, term: 'OIL-001' });
    expect(parseScan('12XOIL-001')).toEqual({ qty: 12, term: 'OIL-001' });
  });

  it('มีช่องว่างรอบตัวคั่นก็ยังอ่านออก', () => {
    expect(parseScan(' 5 * BRK-9 ')).toEqual({ qty: 5, term: 'BRK-9' });
  });

  it('จำนวนเป็นทศนิยมได้ — ของที่ขายเป็นลิตรหรือเมตร', () => {
    expect(parseScan('2.5*OIL')).toEqual({ qty: 2.5, term: 'OIL' });
  });

  /** ข้อที่สำคัญที่สุดของไฟล์นี้ */
  it('บาร์โค้ดตัวเลขล้วนไม่ถูกตีความว่าเป็นจำนวน', () => {
    expect(parseScan('8851234567890')).toEqual({ qty: 1, term: '8851234567890' });
    expect(parseScan('0000123')).toEqual({ qty: 1, term: '0000123' });
  });

  it('รหัสที่ขึ้นต้นด้วยเลขแล้วตามด้วยตัวอักษร ยังเป็นรหัสทั้งก้อน', () => {
    /* ไม่มีตัวคั่น = ไม่ใช่จำนวน แม้จะขึ้นต้นด้วยเลขและมี x อยู่ข้างใน */
    expect(parseScan('40ABC')).toEqual({ qty: 1, term: '40ABC' });
    expect(parseScan('12AX34')).toEqual({ qty: 1, term: '12AX34' });
  });

  it('จำนวนศูนย์หรือติดลบไม่นับ ถือว่าเป็นรหัสทั้งก้อน', () => {
    expect(parseScan('0*ABC')).toEqual({ qty: 1, term: '0*ABC' });
  });

  it('คั่นแต่ไม่มีรหัสตามมา ถือว่าเป็นรหัสทั้งก้อน', () => {
    expect(parseScan('40*')).toEqual({ qty: 1, term: '40*' });
  });

  it('ช่องว่างก่อนหลังถูกตัดทิ้ง', () => {
    expect(parseScan('  ABC  ')).toEqual({ qty: 1, term: 'ABC' });
    expect(parseScan('   ')).toEqual({ qty: 1, term: '' });
  });
});
