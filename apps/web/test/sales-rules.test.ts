import { describe, expect, it } from 'vitest';
import { forcedVatMode, nextKinds } from '../src/lib/sales-rules';

describe('โหมดภาษีตามชนิดเอกสาร', () => {
  it('ใบส่งมอบแบบไม่มีใบกำกับภาษีห้ามมี VAT ไม่ว่าผู้ใช้เลือกอะไร', () => {
    expect(forcedVatMode('IV', 'ex')).toBe('none');
    expect(forcedVatMode('IV', 'in')).toBe('none');
    expect(forcedVatMode('IV', 'none')).toBe('none');
  });

  it('ใบกำกับภาษีต้องมี VAT เสมอ', () => {
    expect(forcedVatMode('IVT', 'none')).toBe('ex');
    expect(forcedVatMode('IVT', 'in')).toBe('ex');
    expect(forcedVatMode('IVT', 'ex')).toBe('ex');
  });

  it('ใบเสนอราคาและใบเสร็จให้ผู้ใช้เลือกเอง', () => {
    expect(forcedVatMode('QT', 'in')).toBe('in');
    expect(forcedVatMode('RC', 'none')).toBe('none');
    expect(forcedVatMode('RC', 'ex')).toBe('ex');
  });
});

describe('เอกสารที่ออกต่อได้', () => {
  it('ใบเสนอราคาออกได้ทั้งใบส่งมอบและใบเสร็จ', () => {
    expect(nextKinds('QT')).toEqual(['IVT', 'IV', 'RC']);
  });

  it('ใบส่งมอบออกได้แค่ใบเสร็จ', () => {
    expect(nextKinds('IV')).toEqual(['RC']);
    expect(nextKinds('IVT')).toEqual(['RC']);
  });

  it('ใบเสร็จเป็นปลายทาง ออกต่อไม่ได้', () => {
    expect(nextKinds('RC')).toEqual([]);
  });
});
