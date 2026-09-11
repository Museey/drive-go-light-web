/**
 * กติกาของกระดานงานใบเสนอราคา — ฟังก์ชันล้วน
 *
 * ส่วนที่ต้องมีฐานข้อมูล (ใบลูกที่ถูกยกเลิกต้องไม่นับว่าออกแล้ว · การต่อสายเอกสาร ·
 * การเขียนเลขไมล์กลับ) อยู่ใน doc-chain-db.test.ts
 */
import { describe, expect, it } from 'vitest';
import { NEW_BTNS, newBtnHref, newDocHref, pickSourceTarget, todoState } from '../src/lib/doc-flow';

const st = (done: boolean, sourceVoided: boolean, canMake: boolean) =>
  todoState({ done, sourceVoided, canMake }).kind;

describe('ช่องงานค้าง', () => {
  it('ยังไม่ได้ออก มีสิทธิ์ ใบแม่ยังอยู่ → กดทำต่อได้', () => {
    expect(st(false, false, true)).toBe('todo');
  });

  it('ออกแล้ว → แสดงเลขที่', () => {
    expect(st(true, false, true)).toBe('done');
  });

  it('ใบแม่ถูกยกเลิก → ออกต่อไม่ได้', () => {
    expect(st(false, true, true)).toBe('voided');
  });

  it('ไม่มีสิทธิ์ → บอกว่ายังไม่ได้ออก แต่ไม่ให้ปุ่ม', () => {
    expect(st(false, false, false)).toBe('denied');
  });

  /*
   * ข้อนี้คือเหตุผลที่ลำดับการตัดสินสำคัญ — เอกสารภาษีที่ออกไปแล้วมีผลตามกฎหมาย
   * ต่อให้ใบเสนอราคาต้นทางถูกยกเลิกทีหลัง ใบที่ออกไปแล้วก็ยังต้องเห็นและกดเข้าไปดูได้
   * ถ้าเอา 'ยกเลิกแล้ว' ขึ้นก่อน ใบเสร็จที่ออกไปจริงจะหายไปจากหน้าจอ
   */
  it('ออกใบต่อไปแล้วแต่ใบแม่ถูกยกเลิกทีหลัง → ยังต้องเห็นเลขที่ ไม่ใช่คำว่ายกเลิกแล้ว', () => {
    expect(st(true, true, true)).toBe('done');
  });

  it('ออกแล้วและไม่มีสิทธิ์ออกใบใหม่ → ยังเห็นเลขที่ใบที่ออกไปแล้ว', () => {
    expect(st(true, false, false)).toBe('done');
  });
});

describe('ที่อยู่หน้าออกเอกสารต่อ', () => {
  it('ใบส่งมอบตั้งต้นเป็นแบบมีใบกำกับภาษี', () => {
    expect(newDocHref('abc', 'invoice')).toBe('/income/new?kind=IVT&from=abc');
  });

  it('ใบเสร็จ', () => {
    expect(newDocHref('abc', 'receipt')).toBe('/income/new?kind=RC&from=abc');
  });
});

describe('ปุ่มเปิดเอกสารใหม่', () => {
  it('ปุ่มขายหน้าร้านพาไปใบเปล่าที่เติมค่าให้แล้ว', () => {
    expect(newBtnHref({ no: '03.3', kind: 'RC', label: '+ ขายหน้าร้าน', walkin: true }))
      .toBe('/income/new?kind=RC&walkin=1');
  });

  it('ปุ่มปกติไม่พ่วง walkin ไปด้วย', () => {
    expect(newBtnHref({ no: '03.3', kind: 'RC', label: '+ ใบเสร็จ' }))
      .toBe('/income/new?kind=RC');
  });

  /* ขายหน้าร้านเป็นใบเสร็จใบเดียวกัน ไม่ใช่เอกสารชนิดใหม่ —
     ถ้าวันหนึ่งมันกลายเป็น kind อื่น เอกสารจะหลุดจากแท็บใบเสร็จไปเงียบ ๆ */
  it('ปุ่มขายหน้าร้านออกใบเสร็จ ไม่ใช่เอกสารชนิดใหม่', () => {
    const walkins = Object.values(NEW_BTNS).flat().filter((b) => b.walkin);
    expect(walkins.length).toBeGreaterThan(0);
    for (const b of walkins) {
      expect(b.kind).toBe('RC');
      expect(b.no).toBe('03.3');
    }
  });

  it('มีปุ่มขายหน้าร้านทั้งแท็บทั้งหมดและแท็บใบเสร็จ', () => {
    for (const view of ['all', 'receipt']) {
      expect(NEW_BTNS[view]?.some((b) => b.walkin), `แท็บ ${view}`).toBe(true);
    }
  });
});

describe('จะเสนอให้เลือกเอกสารต้นทางไหม', () => {
  const at = (kind: string, over: Partial<Parameters<typeof pickSourceTarget>[0]> = {}) =>
    pickSourceTarget({ kind, hasFrom: false, hasParty: false, blank: false, walkin: false, ...over });

  it('กดออกใบส่งมอบเปล่า ๆ — เสนอใบเสนอราคาที่ค้างให้เลือกก่อน', () => {
    expect(at('IVT')).toBe('invoice');
    expect(at('IV')).toBe('invoice');
  });

  it('กดออกใบเสร็จเปล่า ๆ — เสนอใบที่ค้างให้เลือกก่อน', () => {
    expect(at('RC')).toBe('receipt');
  });

  it('ใบเสนอราคาเป็นต้นสาย ไม่มีอะไรให้เลือก', () => {
    expect(at('QT')).toBeNull();
  });

  /* ทั้งสี่ทางนี้คือ "ผู้ใช้ตอบไปแล้วว่าจะเริ่มจากอะไร" ถามซ้ำคือขวางงาน */
  it('มาจากเอกสารต้นทางแล้ว ไม่ถามซ้ำ', () => {
    expect(at('RC', { hasFrom: true })).toBeNull();
  });

  it('เปิดจากแถวทะเบียนลูกค้า ไม่ถามซ้ำ', () => {
    expect(at('RC', { hasParty: true })).toBeNull();
  });

  it('กดข้ามมาเอง ไม่ถามซ้ำ', () => {
    expect(at('RC', { blank: true })).toBeNull();
  });

  it('ขายหน้าร้าน เข้าฟอร์มทันที ไม่ต้องผ่านหน้าเลือกต้นทาง', () => {
    expect(at('RC', { walkin: true })).toBeNull();
  });
});
