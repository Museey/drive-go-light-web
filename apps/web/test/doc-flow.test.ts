/**
 * กติกาของกระดานงานใบเสนอราคา — ฟังก์ชันล้วน
 *
 * ส่วนที่ต้องมีฐานข้อมูล (ใบลูกที่ถูกยกเลิกต้องไม่นับว่าออกแล้ว · การต่อสายเอกสาร ·
 * การเขียนเลขไมล์กลับ) อยู่ใน doc-chain-db.test.ts
 */
import { describe, expect, it } from 'vitest';
import { newDocHref, todoState } from '../src/lib/doc-flow';

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
