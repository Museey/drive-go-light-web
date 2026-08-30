import { describe, expect, it } from 'vitest';
import { checkPaymentAmount, isSettled, outstandingOf } from '../src/lib/payment-rules';

describe('ตรวจจำนวนเงินที่ตัดชำระ', () => {
  it('รับได้เมื่อไม่เกินยอดคงค้าง', () => {
    expect(checkPaymentAmount(1000, 0, 1000)).toBeNull();
    expect(checkPaymentAmount(1000, 0, 400)).toBeNull();
    expect(checkPaymentAmount(1000, 600, 400)).toBeNull();
  });

  it('ปฏิเสธยอดที่เกินคงค้าง พร้อมบอกว่าคงค้างเท่าไร', () => {
    const msg = checkPaymentAmount(1000, 600, 500);
    expect(msg).toContain('รับเกินยอดคงค้าง');
    expect(msg).toContain('400.00');
  });

  it('พิมพ์เกินหนึ่งหลักถูกจับได้ — เคสที่เจอบ่อยที่สุด', () => {
    expect(checkPaymentAmount(2915.75, 0, 29157.5)).toContain('รับเกิน');
  });

  it('ปฏิเสธยอดศูนย์และติดลบ', () => {
    expect(checkPaymentAmount(1000, 0, 0)).toContain('มากกว่าศูนย์');
    expect(checkPaymentAmount(1000, 0, -50)).toContain('มากกว่าศูนย์');
    expect(checkPaymentAmount(1000, 0, NaN)).toContain('มากกว่าศูนย์');
  });

  it('เอกสารที่ปิดยอดแล้วรับเพิ่มไม่ได้', () => {
    expect(checkPaymentAmount(1000, 1000, 100)).toContain('ชำระครบแล้ว');
  });

  it('เศษต่ำกว่าครึ่งสตางค์ถือว่าปิดยอด ไม่ต้องมาไล่เก็บ', () => {
    expect(checkPaymentAmount(1000, 999.998, 1)).toContain('ชำระครบแล้ว');
  });

  it('จ่ายเกินไม่เกินครึ่งสตางค์ยังรับได้ — กันเศษทศนิยมทำให้ปิดยอดไม่ลง', () => {
    expect(checkPaymentAmount(1000, 0, 1000.003)).toBeNull();
  });
});

describe('ยอดคงค้าง', () => {
  it('ไม่สะสมเศษจากการลบทศนิยม', () => {
    expect(outstandingOf(0.3, 0.1)).toBe(0.2);
    expect(outstandingOf(1000.1, 1000)).toBe(0.1);
  });

  it('บอกได้ว่าปิดยอดแล้วหรือยัง', () => {
    expect(isSettled(1000, 1000)).toBe(true);
    expect(isSettled(1000, 999.999)).toBe(true);
    expect(isSettled(1000, 999)).toBe(false);
  });
});
