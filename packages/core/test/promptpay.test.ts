import { describe, expect, it } from 'vitest';
import { crc16, parsePromptPayId, promptPayPayload } from '../src/promptpay.js';

describe('คิวอาร์พร้อมเพย์', () => {
  it('CRC-16/CCITT-FALSE ตรงกับค่าตรวจมาตรฐาน', () => {
    /* ค่าตรวจที่ทุกตารางอ้างอิงของ CRC-16/CCITT-FALSE ใช้ — ถ้าไม่ตรง แอปธนาคารจะปฏิเสธคิวอาร์ทั้งใบ */
    expect(crc16('123456789')).toBe('29B1');
  });

  it('เบอร์มือถือไม่ระบุยอด ได้ข้อความตรงกับตัวอย่างอ้างอิง', () => {
    expect(promptPayPayload('0899999999')).toBe(
      '00020101021129370016A000000677010111011300668999999995802TH53037646304FE29',
    );
  });

  it('ระบุยอดแล้วเป็นคิวอาร์ใช้ครั้งเดียว และยอดมีทศนิยมสองตำแหน่งเสมอ', () => {
    const p = promptPayPayload('089-999-9999', 1500)!;
    expect(p.startsWith('000201010212')).toBe(true);
    expect(p).toContain('54071500.00');
    /* ตัวตรวจท้ายข้อความต้องคิดจากทุกอย่างก่อนหน้ารวม "6304" */
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
  });

  it('ยอดถูกปัดเป็นสตางค์ ไม่ปล่อยเศษทศนิยมยาวเข้าไปในคิวอาร์', () => {
    expect(promptPayPayload('0899999999', 1234.565)).toContain('54071234.57');
    expect(promptPayPayload('0899999999', 0.1 + 0.2)).toContain('54040.30');
  });

  it('เลขประจำตัวผู้เสียภาษี 13 หลัก และ e-Wallet 15 หลัก ใช้ช่องของตัวเอง', () => {
    expect(promptPayPayload('0105556000001')).toContain('02130105556000001');
    expect(promptPayPayload('123456789012345')).toContain('0315123456789012345');
  });

  it('ยอดศูนย์หรือติดลบ = ไม่ระบุยอด', () => {
    expect(promptPayPayload('0899999999', 0)).toBe(promptPayPayload('0899999999'));
    expect(promptPayPayload('0899999999', -5)).toBe(promptPayPayload('0899999999'));
  });

  it('เลขที่ไม่ใช่รูปแบบพร้อมเพย์ คืน null ไม่สร้างคิวอาร์ที่โอนไม่ได้', () => {
    expect(promptPayPayload('')).toBeNull();
    expect(promptPayPayload('12345')).toBeNull();
    expect(promptPayPayload('8999999990')).toBeNull();       /* 10 หลักแต่ไม่ขึ้นต้นด้วย 0 */
    expect(promptPayPayload(null)).toBeNull();
    expect(parsePromptPayId('081 234 5678')).toEqual({ type: 'mobile', digits: '0812345678' });
  });
});
