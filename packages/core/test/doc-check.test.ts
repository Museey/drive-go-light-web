import { describe, expect, it } from 'vitest';
import { docMissing, hasAddress } from '../src/doc-check.js';

const full = {
  kind: 'IVT',
  partyId: 'c1',
  partyName: 'บริษัท ทดสอบ จำกัด',
  partyType: 'company',
  partyTaxId: '0105500000000',
  partyAddrText: '123 ถนนทดสอบ',
  partyAddr: null,
};

describe('ความครบถ้วนของเอกสารขาย', () => {
  it('ข้อมูลครบไม่มีอะไรเตือน', () => {
    expect(docMissing(full)).toEqual([]);
  });

  it('ใบกำกับภาษีที่ไม่มีเลขผู้เสียภาษีต้องเตือน แม้ลูกค้าเป็นบุคคลธรรมดา', () => {
    expect(docMissing({ ...full, partyType: 'person', partyTaxId: '' }))
      .toEqual(['ไม่มีเลขประจำตัวผู้เสียภาษี']);
  });

  it('ใบส่งมอบที่ไม่มี VAT ไม่ต้องมีเลขผู้เสียภาษีถ้าเป็นบุคคลธรรมดา', () => {
    expect(docMissing({ ...full, kind: 'IV', partyType: 'person', partyTaxId: '' })).toEqual([]);
  });

  it('นิติบุคคลต้องมีเลขผู้เสียภาษีเสมอ ไม่ว่าเอกสารชนิดไหน', () => {
    expect(docMissing({ ...full, kind: 'QT', partyTaxId: '' }))
      .toEqual(['ไม่มีเลขประจำตัวผู้เสียภาษี']);
  });

  it('ไม่ได้ผูกทะเบียนลูกค้าและไม่มีชื่อ เตือนทั้งสองอย่าง', () => {
    expect(docMissing({ ...full, partyId: null, partyName: '  ' }))
      .toEqual(['ยังไม่ได้ผูกกับทะเบียนลูกค้า', 'ไม่มีชื่อลูกค้า']);
  });

  it('ที่อยู่นับทั้งแบบพิมพ์เองและแบบแยกช่อง', () => {
    expect(hasAddress({ partyAddrText: '', partyAddr: { no: '9', road: 'สุขุมวิท' } })).toBe(true);
    expect(hasAddress({ partyAddrText: ' ', partyAddr: { no: '', road: '' } })).toBe(false);
    expect(hasAddress({ partyAddrText: '', partyAddr: null })).toBe(false);
  });

  it('ไม่มีที่อยู่เลยต้องเตือน', () => {
    expect(docMissing({ ...full, partyAddrText: '', partyAddr: {} }))
      .toEqual(['ไม่มีที่อยู่']);
  });
});
