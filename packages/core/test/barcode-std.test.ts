/** บาร์โค้ดมาตรฐาน UPC-A / EAN / Code 39 / Code 128 — เลขตรวจสอบ การเดาระบบ โมดูล และค่ารหัส */
import { describe, expect, it } from 'vitest';
import {
  barcodeAliases, barcodeSVGFor, code128Values, ean13Modules, ean8Modules, genEan13, gtinCheckDigit, validateBarcode,
} from '../src/index.js';

describe('เลขตรวจสอบ GTIN', () => {
  it('ตัวอย่างมาตรฐาน: 400638133393 → 1 · 07567816412 → 5 · 9638507 → 4', () => {
    expect(gtinCheckDigit('400638133393')).toBe(1);   // EAN-13 4006381333931
    expect(gtinCheckDigit('07567816412')).toBe(5);    // UPC-A 075678164125
    expect(gtinCheckDigit('9638507')).toBe(4);        // EAN-8 96385074
  });
});

describe('validateBarcode เดาระบบและตรวจ', () => {
  it('13 หลัก = EAN-13 · 12 = UPC-A · 8 = EAN-8 · ผสม = Code 128', () => {
    expect(validateBarcode('4006381333931')).toMatchObject({ ok: true, type: 'EAN13' });
    expect(validateBarcode('075678164125')).toMatchObject({ ok: true, type: 'UPCA' });
    expect(validateBarcode('96385074')).toMatchObject({ ok: true, type: 'EAN8' });
    expect(validateBarcode('BLT-132')).toMatchObject({ ok: true, type: 'CODE128' });
  });
  it('เลขตรวจสอบผิด → บอกเลขที่ควรเป็น', () => {
    const r = validateBarcode('4006381333930');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('ควรลงท้าย 1');
  });
  it('Code 39 รับเฉพาะชุดอักษรของมัน และแปลงเป็นตัวพิมพ์ใหญ่', () => {
    expect(validateBarcode('blt-132', 'CODE39')).toMatchObject({ ok: true, value: 'BLT-132' });
    expect(validateBarcode('abc_1', 'CODE39').ok).toBe(false);
  });
  it('Code 128 ไม่รับภาษาไทย', () => {
    expect(validateBarcode('ยาง123', 'CODE128').ok).toBe(false);
  });
});

describe('ออกบาร์โค้ดใหม่', () => {
  it('EAN-13 ในร้าน: นำหน้า 20 · 13 หลัก · เลขตรวจสอบถูก · กำหนดผลได้', () => {
    const a = genEan13(1789000000000, () => 0.5);
    expect(a).toMatch(/^20\d{11}$/);
    expect(validateBarcode(a, 'EAN13').ok).toBe(true);
    expect(genEan13(1789000000000, () => 0.5)).toBe(a);
  });
});

describe('โมดูล EAN/UPC', () => {
  it('EAN-13 = 95 โมดูล ขึ้นต้น/ลงท้าย 101 กลาง 01010 · EAN-8 = 67', () => {
    const m = ean13Modules('4006381333931');
    expect(m).toHaveLength(95);
    expect(m.startsWith('101') && m.endsWith('101') && m.slice(45, 50) === '01010').toBe(true);
    expect(ean8Modules('96385074')).toHaveLength(67);
  });
  it('ตัวอย่างสเปก 5901234123457: หลักแรก 5 → ลวดลาย LGGGLL', () => {
    const m = ean13Modules('5901234123457');
    expect(m.slice(3, 10)).toBe('0001011');    // '9' ชุด L
    expect(m.slice(10, 17)).toBe('0100111');   // '0' ชุด G
    expect(m.slice(50, 57)).toBe('1100110');   // '1' หลักแรกฝั่งขวา ชุด R
    expect(m.slice(85, 92)).toBe('1000100');   // เลขตรวจสอบ '7' ชุด R (ก่อนตัวจบ 101)
  });
});

describe('Code 128', () => {
  it('ค่ารหัส "ABC" ชุด B: Start B 104, A=33 B=34 C=35, checksum 41, Stop 106', () => {
    expect(code128Values('ABC')).toEqual([104, 33, 34, 35, (104 + 33 * 1 + 34 * 2 + 35 * 3) % 103, 106]);
  });
  it('เลขล้วนคู่ใช้ชุด C (2 หลักต่อสัญลักษณ์) — "123456" ได้ 3 สัญลักษณ์', () => {
    const v = code128Values('123456');
    expect(v[0]).toBe(105);
    expect(v.slice(1, 4)).toEqual([12, 34, 56]);
  });
  it('SVG วาดได้ทุกระบบ', () => {
    for (const [t, v] of [['EAN13', '4006381333931'], ['UPCA', '075678164125'], ['EAN8', '96385074'], ['CODE39', 'BLT-132'], ['CODE128', 'BLT-132']] as const) {
      expect(barcodeSVGFor(v, t, 200, 50)).toContain('<rect');
    }
  });
});

describe('รูปแบบเทียบเท่าตอนยิง', () => {
  it('UPC-A 12 หลัก ↔ EAN-13 นำ 0', () => {
    expect(barcodeAliases('075678164125')).toContain('0075678164125');
    expect(barcodeAliases('0075678164125')).toContain('075678164125');
  });
});
