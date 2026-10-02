import { describe, expect, it } from 'vitest';
import {
  canIssueKind, forcedVatMode, invoiceKind, newDocVatMode, nextKinds, vatChoices,
} from '../src/lib/sales-rules';

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

/**
 * ร้านจด / ไม่จด VAT (ผู้ใช้กำหนด 2 ต.ค. 2569 · ไมเกรชัน 036)
 *
 * ผู้ใช้เลือก: ใบกำกับภาษี "ซ่อนและห้ามออก" · ใบเก่าที่มี VAT "คงยอดเดิม เอา VAT ออกได้"
 * ฟอร์มกับเซิร์ฟเวอร์ใช้ vatChoices() ตัวเดียวกัน — ฝั่งฐานข้อมูลอยู่ที่ vat-registered-db.test.ts
 */
describe('ร้านที่ไม่จด VAT', () => {
  const off = { registered: false } as const;

  it('ใบใหม่ทุกชนิดที่ออกได้ไม่คิด VAT ไม่ว่าเลือกอะไรมา', () => {
    for (const k of ['QT', 'IV', 'RC'] as const) {
      expect(vatChoices(k, off)).toEqual(['none']);
      expect(forcedVatMode(k, 'ex', off)).toBe('none');
      expect(forcedVatMode(k, 'in', off)).toBe('none');
      expect(newDocVatMode(k, false)).toBe('none');
    }
  });

  it('ออกใบกำกับภาษีใบใหม่ไม่ได้ — ชนิดอื่นออกได้ตามปกติ', () => {
    expect(canIssueKind('IVT', false)).toBe(false);
    for (const k of ['QT', 'IV', 'RC'] as const) expect(canIssueKind(k, false)).toBe(true);
  });

  it('ใบกำกับภาษีเก่าเปิดแก้แล้วยังต้องมี VAT — สคีมาบังคับ IVT ต้องคิด VAT', () => {
    expect(vatChoices('IVT', { registered: false, saved: 'ex' })).toEqual(['ex']);
  });

  it('ใบเสร็จที่ออกต่อจากใบกำกับภาษี คิด VAT ตามใบกำกับ — ยอดเก็บเงินต้องตรงกับหนี้', () => {
    expect(vatChoices('RC', { registered: false, parentKind: 'IVT' })).toEqual(['ex']);
    /* ใบเสร็จเก่าที่บันทึกแบบอื่นไว้ — ยอดเดิมไม่เปลี่ยนเอง */
    expect(vatChoices('RC', { registered: false, parentKind: 'IVT', saved: 'in' })).toEqual(['in']);
    /* ต่อจากใบที่ไม่ใช่ใบกำกับภาษี = ใบใหม่ธรรมดา */
    expect(vatChoices('RC', { registered: false, parentKind: 'IV' })).toEqual(['none']);
    expect(vatChoices('RC', { registered: false, parentKind: 'QT' })).toEqual(['none']);
  });

  it('ใบเก่าที่มี VAT เปิดแก้ — ค่าตั้งต้นคือแบบเดิม เอา VAT ออกได้ แต่เพิ่มหรือสลับแบบไม่ได้', () => {
    expect(vatChoices('RC', { registered: false, saved: 'ex' })).toEqual(['ex', 'none']);
    expect(vatChoices('QT', { registered: false, saved: 'in' })).toEqual(['in', 'none']);
    expect(forcedVatMode('QT', 'none', { registered: false, saved: 'in' })).toBe('none');
    expect(forcedVatMode('QT', 'ex', { registered: false, saved: 'in' })).toBe('in');
    expect(vatChoices('QT', { registered: false, saved: 'none' })).toEqual(['none']);
  });

  it('ใบเสนอราคาออกต่อได้แค่ใบส่งมอบไม่มี VAT กับใบเสร็จ · ขั้น B พาไปใบส่งมอบไม่มี VAT', () => {
    expect(nextKinds('QT', false)).toEqual(['IV', 'RC']);
    expect(nextKinds('IVT', false)).toEqual(['RC']);
    expect(invoiceKind(false)).toBe('IV');
  });
});

describe('ร้านที่จด VAT — ทำงานเหมือนเดิมทุกอย่าง', () => {
  it('ใบเสนอราคาและใบเสร็จเลือกได้ครบสามแบบ ไม่ขึ้นกับใบต้นทางหรือค่าที่บันทึกไว้', () => {
    for (const ctx of [{}, { registered: true }, { registered: true, saved: 'none' as const, parentKind: 'IVT' as const }]) {
      expect(vatChoices('QT', ctx)).toEqual(['none', 'ex', 'in']);
      expect(vatChoices('RC', ctx)).toEqual(['none', 'ex', 'in']);
    }
  });

  it('ใบใหม่เริ่มที่ราคายังไม่รวมภาษี · IV ไม่คิด · IVT คิด', () => {
    expect(newDocVatMode('QT')).toBe('ex');
    expect(newDocVatMode('RC')).toBe('ex');
    expect(newDocVatMode('IV')).toBe('none');
    expect(newDocVatMode('IVT')).toBe('ex');
  });

  it('ออกได้ทุกชนิด และใบส่งมอบที่เสนอต่อจากใบเสนอราคาคือใบกำกับภาษี', () => {
    for (const k of ['QT', 'IV', 'IVT', 'RC'] as const) expect(canIssueKind(k)).toBe(true);
    expect(invoiceKind()).toBe('IVT');
  });
});
